import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { refreshToken, requestOTP, getAuthToken } from '@/lib/whitebooks-api'
import { fetchAllRecentGSTEmails } from '@/lib/gmail-otp'
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
    // -------------------------------------------------------------
    // PHASE 1: REFRESH CURRENTLY ACTIVE SESSIONS
    // -------------------------------------------------------------
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
    const activeSessions = rawSessions.filter((s) => {
      if (seenClientIds.has(s.clientId)) return false
      seenClientIds.add(s.clientId)
      return true
    })

    let refreshedCount = 0
    let refreshFailedCount = 0

    if (activeSessions.length > 0) {
      console.log(`[Cron Refresh] Refreshing ${activeSessions.length} active session(s)...`)

      const BATCH_SIZE = 5
      for (let i = 0; i < activeSessions.length; i += BATCH_SIZE) {
        const chunk = activeSessions.slice(i, i + BATCH_SIZE)
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
              } else {
                const errMsg = result.message || 'Token refresh failed'
                const isInvalidSession =
                  errMsg.includes('AUTH4033') ||
                  errMsg.includes('AUTH4042') ||
                  errMsg.includes('Invalid Session') ||
                  errMsg.includes('Cannot Be Extended') ||
                  errMsg.includes('Not found')

                // Deactivate if session genuinely expired on GST portal
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

                refreshFailedCount++
              }
            } catch (err) {
              refreshFailedCount++
              const errMsg = err instanceof Error ? err.message : 'Network error'
              console.error(`[Cron Refresh] Error refreshing ${client.name}:`, err)
            }
          })
        )
      }
    }

    // -------------------------------------------------------------
    // PHASE 2: AUTO-RECOVERY AUTHENTICATION FOR CLIENTS NEEDING AUTH
    // -------------------------------------------------------------
    // Find all clients that have NO valid active session
    const unauthenticatedClients = await prisma.client.findMany({
      where: {
        OR: [
          { status: { not: 'authenticated' } },
          { sessions: { none: { isActive: true, expiresAt: { gt: now } } } },
        ],
      },
      orderBy: { name: 'asc' },
    })

    console.log(`[Cron Refresh] Found ${unauthenticatedClients.length} client(s) needing authentication.`)

    let autoRecoveryTriggered = 0
    let autoRecoverySuccess = 0
    let autoRecoveryFailed = 0
    let portalStillDown = false

    if (unauthenticatedClients.length > 0) {
      // Step A: Canary probe - test 1 client first to verify if GST Portal is reachable
      const canary = unauthenticatedClients[0]
      const canaryStateCode = getStateCodeFromGSTIN(canary.gstin) || canary.stateCode || canary.gstin.slice(0, 2)

      console.log(`[Cron Refresh] Probing GST Portal connectivity with canary client: ${canary.name}...`)
      const probeRes = await requestOTP(DEFAULT_CA_EMAIL, canary.gstUsername, canaryStateCode, DEFAULT_CA_IP)
      const probeMsg = probeRes.message || ''

      const isPortalDown =
        probeMsg.includes('WB_ERR_9999') ||
        /temporarily unavailable/i.test(probeMsg) ||
        /service unavailable/i.test(probeMsg) ||
        /502|503|504/.test(probeMsg)

      if (isPortalDown) {
        portalStillDown = true
        console.warn(`[Cron Refresh] GST Portal is STILL DOWN (${probeMsg}). Postponing auto-recovery authentication.`)

        // Record canary failure log so dashboard stays updated with the outage status
        await prisma.fetchLog.create({
          data: {
            clientId: canary.id,
            status: 'error',
            logType: 'token_refresh',
            errorMessage: probeMsg || 'GST Service is temporarily unavailable. Please try again later.',
            noticesFound: 0,
            newNotices: 0,
            rawResponse: JSON.stringify({
              action: 'cron_refresh_portal_probe',
              probeResult: probeRes,
            }),
          },
        })
      } else {
        // Step B: GST Portal is OPERATIONAL! Trigger OTPs for unauthenticated clients
        console.log(`[Cron Refresh] GST Portal is UP! Initiating automated recovery authentication for ${unauthenticatedClients.length} clients...`)

        interface PendingItem {
          clientId: string
          clientName: string
          gstin: string
          gstUsername: string
          txn: string
          sessionId: string
          stateCode: string
        }

        const pendingItems: PendingItem[] = []

        // If canary succeeded or returned valid txn, record it
        if (probeRes.success && probeRes.txn) {
          await prisma.authSession.updateMany({
            where: { clientId: canary.id, isActive: true },
            data: { isActive: false },
          })

          const session = await prisma.authSession.create({
            data: {
              clientId: canary.id,
              txn: probeRes.txn,
              ipAddress: DEFAULT_CA_IP,
              isActive: false,
              expiresAt: addHours(now, 6),
            },
          })

          await prisma.client.update({
            where: { id: canary.id },
            data: { status: 'pending' },
          })

          pendingItems.push({
            clientId: canary.id,
            clientName: canary.name,
            gstin: canary.gstin,
            gstUsername: canary.gstUsername,
            txn: probeRes.txn,
            sessionId: session.id,
            stateCode: canaryStateCode,
          })
          autoRecoveryTriggered++
        }

        // Process remaining clients in concurrent batches of 3
        const remainingClients = unauthenticatedClients.slice(1)
        const TRIGGER_BATCH_SIZE = 3

        for (let i = 0; i < remainingClients.length; i += TRIGGER_BATCH_SIZE) {
          const chunk = remainingClients.slice(i, i + TRIGGER_BATCH_SIZE)
          await Promise.all(
            chunk.map(async (client) => {
              const stateCode = getStateCodeFromGSTIN(client.gstin) || client.stateCode || client.gstin.slice(0, 2)
              try {
                const otpRes = await requestOTP(DEFAULT_CA_EMAIL, client.gstUsername, stateCode, DEFAULT_CA_IP)

                if (otpRes.success && otpRes.txn) {
                  await prisma.authSession.updateMany({
                    where: { clientId: client.id, isActive: true },
                    data: { isActive: false },
                  })

                  const session = await prisma.authSession.create({
                    data: {
                      clientId: client.id,
                      txn: otpRes.txn,
                      ipAddress: DEFAULT_CA_IP,
                      isActive: false,
                      expiresAt: addHours(now, 6),
                    },
                  })

                  await prisma.client.update({
                    where: { id: client.id },
                    data: { status: 'pending' },
                  })

                  pendingItems.push({
                    clientId: client.id,
                    clientName: client.name,
                    gstin: client.gstin,
                    gstUsername: client.gstUsername,
                    txn: otpRes.txn,
                    sessionId: session.id,
                    stateCode,
                  })
                  autoRecoveryTriggered++
                } else {
                  autoRecoveryFailed++
                  const rawMsg = otpRes.message || 'OTP request failed'
                  await prisma.fetchLog.create({
                    data: {
                      clientId: client.id,
                      status: 'error',
                      logType: 'auto_recovery_auth',
                      errorMessage: rawMsg,
                    },
                  })
                }
              } catch (err) {
                autoRecoveryFailed++
                console.error(`[Cron Refresh] Error triggering OTP for ${client.name}:`, err)
              }
            })
          )
          // Brief 250ms spacing between batch calls
          await new Promise((r) => setTimeout(r, 250))
        }

        // Step C: Wait 25 seconds for OTP emails to land in Gmail, then scan and auto-verify
        if (pendingItems.length > 0) {
          console.log(`[Cron Refresh] Dispatched ${pendingItems.length} OTPs. Waiting 25s for Gmail inbox delivery...`)
          await new Promise((r) => setTimeout(r, 25000))

          console.log(`[Cron Refresh] Scanning Gmail for OTPs...`)
          const recentEmails = await fetchAllRecentGSTEmails(10)

          for (const item of pendingItems) {
            const normGSTIN = item.gstin.toUpperCase().replace(/[\s\-_]/g, '')
            const normUsername = item.gstUsername.toUpperCase().replace(/[\s\-_]/g, '')

            let matchedOTP: string | null = null
            for (const email of recentEmails) {
              const normBody = email.rawBody.toUpperCase().replace(/[\s\-_]/g, '')
              const normSubject = email.subject.toUpperCase().replace(/[\s\-_]/g, '')

              const gstinMatches =
                (email.gstin && email.gstin.toUpperCase() === normGSTIN) ||
                normBody.includes(normGSTIN) ||
                normSubject.includes(normGSTIN)

              const usernameMatches =
                normBody.includes(normUsername) ||
                normSubject.includes(normUsername)

              if (gstinMatches || usernameMatches) {
                matchedOTP = email.otp
                break
              }
            }

            if (matchedOTP) {
              try {
                const authRes = await getAuthToken(
                  DEFAULT_CA_EMAIL,
                  matchedOTP,
                  item.txn,
                  item.gstUsername,
                  item.stateCode,
                  DEFAULT_CA_IP
                )

                if (authRes.success) {
                  const finalTxn = authRes.txn || item.txn
                  const expiresAt = addHours(now, 6)

                  await prisma.authSession.update({
                    where: { id: item.sessionId },
                    data: {
                      txn: finalTxn,
                      isActive: true,
                      authError: null,
                      lastRefreshedAt: now,
                      expiresAt,
                    },
                  })

                  await prisma.client.update({
                    where: { id: item.clientId },
                    data: { status: 'authenticated' },
                  })

                  await prisma.fetchLog.create({
                    data: {
                      clientId: item.clientId,
                      status: 'success',
                      logType: 'auto_recovery_auth',
                      noticesFound: 0,
                      newNotices: 0,
                      rawResponse: JSON.stringify({
                        action: 'cron_auto_recovery_auth',
                        otp: matchedOTP,
                        message: 'Automatically authenticated via Gmail OTP during scheduled refresh',
                      }),
                    },
                  })

                  autoRecoverySuccess++
                  console.log(`[Cron Refresh] Auto-recovered session for ${item.clientName}!`)
                }
              } catch (err) {
                console.error(`[Cron Refresh] Error verifying OTP for ${item.clientName}:`, err)
              }
            }
          }
        }
      }
    }

    console.log(
      `[Cron Refresh] Finished cycle: ${refreshedCount} refreshed, ${autoRecoverySuccess} auto-recovered, portalStillDown: ${portalStillDown}`
    )

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      activeSessionsChecked: activeSessions.length,
      refreshedCount,
      refreshFailedCount,
      unauthenticatedClientsFound: unauthenticatedClients.length,
      autoRecovery: {
        attempted: unauthenticatedClients.length > 0 && !portalStillDown,
        portalStillDown,
        triggeredCount: autoRecoveryTriggered,
        successCount: autoRecoverySuccess,
        failedCount: autoRecoveryFailed,
      },
    })
  } catch (error) {
    console.error('[Cron Refresh] Fatal error:', error)
    return NextResponse.json({ error: 'Failed to run cron refresh cycle' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
