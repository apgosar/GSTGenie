import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { refreshToken } from '@/lib/whitebooks-api'
import { DEFAULT_CA_EMAIL, DEFAULT_CA_IP, getStateCodeFromGSTIN } from '@/lib/utils'
import { addHours } from 'date-fns'

function isAuthorizedCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true // Allow if no secret configured (e.g. local testing)

  const authHeader = req.headers.get('authorization')
  const customHeader = req.headers.get('x-cron-secret')
  const token = authHeader?.replace(/^Bearer\s+/i, '') || customHeader

  return token === cronSecret
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 })
  }

  const now = new Date()

  console.log(`[Cron Refresh] Starting universal automated token refresh cycle at ${now.toISOString()}...`)

  try {
    // Find all active sessions across all clients by default (no lastRefreshedAt filter)
    const rawSessions = await prisma.authSession.findMany({
      where: {
        isActive: true,
      },
      include: {
        client: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    // De-duplicate to latest active session per client
    const seenClientIds = new Set<string>()
    const sessions = rawSessions.filter((s) => {
      if (seenClientIds.has(s.clientId)) return false
      seenClientIds.add(s.clientId)
      return true
    })

    if (sessions.length === 0) {
      console.log('[Cron Refresh] No active sessions found to refresh.')
      return NextResponse.json({
        success: true,
        message: 'No active sessions found.',
        totalChecked: 0,
        refreshedCount: 0,
      })
    }

    console.log(`[Cron Refresh] Found ${sessions.length} active session(s) to refresh across clients.`)

    let refreshedCount = 0
    let failedCount = 0
    const results: any[] = []

    // Process in concurrent batches of 5 for speed and timeout avoidance
    const BATCH_SIZE = 5
    for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
      const chunk = sessions.slice(i, i + BATCH_SIZE)
      await Promise.all(
        chunk.map(async (session) => {
          const { client } = session
          const stateCode = getStateCodeFromGSTIN(client.gstin) || client.stateCode || client.gstin.slice(0, 2)

          try {
            const result = await refreshToken(
              DEFAULT_CA_EMAIL,
              session.txn,
              client.gstUsername,
              stateCode,
              DEFAULT_CA_IP
            )

            if (result.success) {
              const expiresAt = addHours(now, 6)
              await prisma.authSession.update({
                where: { id: session.id },
                data: {
                  lastRefreshedAt: now,
                  expiresAt,
                  authError: null,
                },
              })

              await prisma.client.update({
                where: { id: client.id },
                data: { status: 'authenticated' },
              })

              await prisma.fetchLog.create({
                data: {
                  clientId: client.id,
                  status: 'success',
                  logType: 'token_refresh',
                  noticesFound: 0,
                  newNotices: 0,
                  rawResponse: JSON.stringify({
                    action: 'automated_cron_refresh',
                    result,
                    refreshedAt: now,
                    newExpiresAt: expiresAt,
                  }),
                },
              })

              refreshedCount++
              results.push({ clientId: client.id, name: client.name, status: 'success' })
            } else {
              const errMsg = result.message || 'Token refresh failed'
              const isInvalidSession =
                errMsg.includes('AUTH4033') ||
                errMsg.includes('Invalid Session') ||
                errMsg.includes('Not found')

              // Only deactivate if session was genuinely expired on GST portal
              if (isInvalidSession) {
                await prisma.authSession.update({
                  where: { id: session.id },
                  data: {
                    isActive: false,
                    authError: errMsg,
                  },
                })

                await prisma.client.update({
                  where: { id: client.id },
                  data: { status: 'error' },
                })
              }

              await prisma.fetchLog.create({
                data: {
                  clientId: client.id,
                  status: 'error',
                  logType: 'token_refresh',
                  errorMessage: errMsg,
                  noticesFound: 0,
                  newNotices: 0,
                  rawResponse: JSON.stringify({
                    action: 'automated_cron_refresh',
                    result,
                  }),
                },
              })

              failedCount++
              results.push({ clientId: client.id, name: client.name, status: 'error', error: errMsg })
            }
          } catch (err) {
            failedCount++
            const errMsg = err instanceof Error ? err.message : 'Network error'
            console.error(`[Cron Refresh] Error refreshing ${client.name}:`, err)
            results.push({ clientId: client.id, name: client.name, status: 'error', error: errMsg })
          }
        })
      )
    }

    console.log(`[Cron Refresh] Completed: ${refreshedCount} refreshed, ${failedCount} failed.`)

    return NextResponse.json({
      success: true,
      totalChecked: sessions.length,
      refreshedCount,
      failedCount,
      results,
    })
  } catch (error) {
    console.error('[Cron Refresh] Fatal error:', error)
    return NextResponse.json({ error: 'Failed to run cron refresh cycle' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
