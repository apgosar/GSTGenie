import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { refreshToken } from '@/lib/whitebooks-api'
import { DEFAULT_CA_EMAIL, DEFAULT_CA_IP, getStateCodeFromGSTIN } from '@/lib/utils'
import { addHours } from 'date-fns'
import { sendTokenRefreshAlertEmail, TokenRefreshFailureItem } from '@/lib/email-service'

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

  console.log(`[Cron Refresh] Starting silent automated token refresh cycle at ${now.toISOString()}...`)

  try {
    // -------------------------------------------------------------
    // SILENT TOKEN REFRESH ONLY (Zero OTPs / Zero SMS sent to clients)
    // -------------------------------------------------------------
    // Only refresh sessions that are active and have not expired yet
    const rawSessions = await prisma.authSession.findMany({
      where: {
        isActive: true,
        expiresAt: { gt: now },
      },
      include: {
        client: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    // De-duplicate to latest active session per client and ensure valid client exists
    const seenClientIds = new Set<string>()
    const activeSessions = rawSessions
      .filter((s) => s.client && s.client.id && s.client.gstin)
      .filter((s) => {
        if (!s.clientId || seenClientIds.has(s.clientId)) return false
        seenClientIds.add(s.clientId)
        return true
      })

    let refreshedCount = 0
    let refreshFailedCount = 0
    const failedClients: TokenRefreshFailureItem[] = []

    if (activeSessions.length > 0) {
      console.log(`[Cron Refresh] Silently refreshing ${activeSessions.length} active session(s)...`)

      const BATCH_SIZE = 5
      for (let i = 0; i < activeSessions.length; i += BATCH_SIZE) {
        const chunk = activeSessions.slice(i, i + BATCH_SIZE)
        await Promise.all(
          chunk.map(async (session) => {
            const { client } = session
            if (!client || !client.gstin) return

            try {
              const stateCode = getStateCodeFromGSTIN(client.gstin) || client.stateCode || client.gstin.slice(0, 2)
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
                    clientId: client.id,
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
              } else {
                const errMsg = result.message || 'Token refresh failed'
                const isInvalidSession =
                  errMsg.includes('AUTH4033') ||
                  errMsg.includes('AUTH4038') ||
                  errMsg.includes('AUTH4042') ||
                  errMsg.includes('Invalid Session') ||
                  errMsg.includes('Cannot Be Extended') ||
                  errMsg.includes('Not found') ||
                  errMsg.includes('Session Expired')

                // Deactivate if session genuinely expired on GST portal
                if (isInvalidSession) {
                  await prisma.authSession.update({
                    where: { id: session.id },
                    data: {
                      clientId: client.id,
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

                refreshFailedCount++
                failedClients.push({
                  clientName: client.name,
                  gstin: client.gstin,
                  error: errMsg,
                })
              }
            } catch (err) {
              refreshFailedCount++
              const errMsg = err instanceof Error ? err.message : 'Network error'
              console.error(`[Cron Refresh] Error refreshing ${client.name}:`, err)
              failedClients.push({
                clientName: client.name,
                gstin: client.gstin,
                error: errMsg,
              })
            }
          })
        )
      }
    }

    // -------------------------------------------------------------
    // DISPATCH ALERT EMAIL IF ANY CLIENT TOKEN REFRESH FAILED
    // -------------------------------------------------------------
    if (failedClients.length > 0) {
      console.warn(`[Cron Refresh] Sending alert email for ${failedClients.length} failed client(s)...`)
      try {
        await sendTokenRefreshAlertEmail({
          failedCount: failedClients.length,
          totalChecked: activeSessions.length,
          failedClients,
        })
      } catch (emailErr) {
        console.error('[Cron Refresh] Failed to dispatch alert email:', emailErr)
      }
    }

    console.log(
      `[Cron Refresh] Finished silent refresh: ${refreshedCount} refreshed, ${refreshFailedCount} failed.`
    )

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      activeSessionsChecked: activeSessions.length,
      refreshedCount,
      refreshFailedCount,
      alertDispatched: failedClients.length > 0,
      failedClients: failedClients.map((f) => ({ clientName: f.clientName, gstin: f.gstin, error: f.error })),
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to run cron refresh cycle'
    console.error('[Cron Refresh] Fatal error:', error)

    // Send critical alert on crash
    try {
      await sendTokenRefreshAlertEmail({
        failedCount: 0,
        totalChecked: 0,
        failedClients: [],
        fatalError: errorMsg,
      })
    } catch (e) {
      console.error('[Cron Refresh] Failed to send fatal error alert email:', e)
    }

    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
