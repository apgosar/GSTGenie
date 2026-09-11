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
  // Refresh if last refreshed more than 5 hours ago (or expiring within 1 hour)
  const thresholdTime = new Date(now.getTime() - 5 * 60 * 60 * 1000)

  console.log(`[Cron Refresh] Starting automated token refresh cycle at ${now.toISOString()}...`)

  try {
    const sessions = await prisma.authSession.findMany({
      where: {
        isActive: true,
        OR: [
          { lastRefreshedAt: { lt: thresholdTime } },
          { expiresAt: { lt: new Date(now.getTime() + 60 * 60 * 1000) } },
        ],
      },
      include: {
        client: true,
      },
    })

    if (sessions.length === 0) {
      console.log('[Cron Refresh] No sessions need refreshing right now.')
      return NextResponse.json({
        success: true,
        message: 'No sessions need refreshing.',
        totalChecked: 0,
        refreshedCount: 0,
      })
    }

    console.log(`[Cron Refresh] Found ${sessions.length} session(s) to refresh.`)

    let refreshedCount = 0
    let failedCount = 0
    const results: any[] = []

    for (const session of sessions) {
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
          await prisma.authSession.update({
            where: { id: session.id },
            data: {
              isActive: false,
              authError: result.message || 'Token refresh failed',
            },
          })

          await prisma.client.update({
            where: { id: client.id },
            data: { status: 'error' },
          })

          await prisma.fetchLog.create({
            data: {
              clientId: client.id,
              status: 'error',
              logType: 'token_refresh',
              errorMessage: result.message,
              noticesFound: 0,
              newNotices: 0,
              rawResponse: JSON.stringify({
                action: 'automated_cron_refresh',
                result,
              }),
            },
          })

          failedCount++
          results.push({ clientId: client.id, name: client.name, status: 'error', error: result.message })
        }
      } catch (err) {
        failedCount++
        console.error(`[Cron Refresh] Error refreshing ${client.name}:`, err)
      }
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
