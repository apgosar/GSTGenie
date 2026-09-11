import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requestOTP, getAuthToken } from '@/lib/whitebooks-api'
import { fetchAllRecentGSTEmails } from '@/lib/gmail-otp'
import { DEFAULT_CA_EMAIL, DEFAULT_CA_IP, getStateCodeFromGSTIN } from '@/lib/utils'
import { addHours } from 'date-fns'

export interface BulkPendingClient {
  clientId: string
  clientName: string
  gstin: string
  gstUsername: string
  txn: string
  sessionId: string
  stateCode: string
}

export interface BulkAuthenticatedClient {
  clientId: string
  clientName: string
  gstin: string
  gstUsername: string
  otp: string
  txn: string
  sessionId: string
  message: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { action = 'initiate', pendingClients = [] } = body

    // -------------------------------------------------------------
    // ACTION 1: INITIATE OTP REQUESTS (Only for Unauthenticated/Pending)
    // -------------------------------------------------------------
    if (action === 'initiate') {
      const now = new Date()

      // Find all clients that are NOT currently authenticated or whose session expired
      const clients = await prisma.client.findMany({
        include: {
          sessions: {
            where: { isActive: true, expiresAt: { gt: now } },
            take: 1,
          },
        },
      })

      // Strictly target clients that have NO valid active session or status is pending/expired/error
      const targetClients = clients.filter(
        (c) => c.status !== 'authenticated' || c.sessions.length === 0
      )

      if (targetClients.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'All clients already have valid active 6-hour sessions.',
          total: 0,
          triggeredClients: [],
          alreadyAuthenticatedCount: clients.length,
        })
      }

      console.log(`[BulkAuth] Initiating OTP requests for ${targetClients.length} unauthenticated/pending client(s)...`)

      const triggeredClients: BulkPendingClient[] = []
      const failedTriggers: any[] = []

      for (const client of targetClients) {
        const stateCode = getStateCodeFromGSTIN(client.gstin) || client.stateCode || client.gstin.slice(0, 2)

        try {
          const otpRes = await requestOTP(DEFAULT_CA_EMAIL, client.gstUsername, stateCode, DEFAULT_CA_IP)

          if (!otpRes.success || !otpRes.txn) {
            const rawMsg = otpRes.message || 'OTP request rejected by WhiteBooks'
            const isApiAccessDisabled =
              rawMsg.includes('AUTH002') ||
              rawMsg.includes('AUTH_002') ||
              /disabled API access/i.test(rawMsg) ||
              /not been allowed access/i.test(rawMsg)

            const formattedError = isApiAccessDisabled
              ? `API access disabled on GST Portal. Taxpayer must enable 'Manage API Access' on services.gst.gov.in`
              : rawMsg

            // Update client status to error so CA knows this client requires attention
            await prisma.client.update({
              where: { id: client.id },
              data: { status: 'error' },
            }).catch(() => {})

            // Record in fetchLog so it appears in Activity Log
            await prisma.fetchLog.create({
              data: {
                clientId: client.id,
                status: 'error',
                logType: 'otp_request',
                errorMessage: formattedError,
                rawResponse: JSON.stringify({
                  request: {
                    endpoint: 'GET /authentication/otprequest',
                    email: DEFAULT_CA_EMAIL,
                    gst_username: client.gstUsername,
                    state_cd: stateCode,
                    ip_address: DEFAULT_CA_IP,
                  },
                  response: {
                    error: formattedError,
                    rawError: rawMsg,
                    data: otpRes.raw,
                    rawBody: otpRes.rawText,
                  },
                  isApiAccessDisabled,
                }),
              },
            }).catch(() => {})

            failedTriggers.push({
              clientId: client.id,
              clientName: client.name,
              gstin: client.gstin,
              gstUsername: client.gstUsername,
              error: formattedError,
              rawError: rawMsg,
              isApiAccessDisabled,
            })
            continue
          }

          // Deactivate old sessions
          await prisma.authSession.updateMany({
            where: { clientId: client.id, isActive: true },
            data: { isActive: false },
          })

          // Create pending session
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

          // Record successful trigger in fetchLog
          await prisma.fetchLog.create({
            data: {
              clientId: client.id,
              status: 'success',
              logType: 'otp_request',
              errorMessage: null,
              rawResponse: JSON.stringify({
                request: {
                  endpoint: 'GET /authentication/otprequest',
                  email: DEFAULT_CA_EMAIL,
                  gst_username: client.gstUsername,
                  state_cd: stateCode,
                  ip_address: DEFAULT_CA_IP,
                },
                response: {
                  txn: otpRes.txn,
                  message: 'OTP sent successfully to taxpayer credentials',
                },
              }),
            },
          }).catch(() => {})

          triggeredClients.push({
            clientId: client.id,
            clientName: client.name,
            gstin: client.gstin,
            gstUsername: client.gstUsername,
            txn: otpRes.txn,
            sessionId: session.id,
            stateCode,
          })
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Network error'
          await prisma.client.update({
            where: { id: client.id },
            data: { status: 'error' },
          }).catch(() => {})

          await prisma.fetchLog.create({
            data: {
              clientId: client.id,
              status: 'error',
              logType: 'otp_request',
              errorMessage: errMsg,
            },
          }).catch(() => {})

          failedTriggers.push({
            clientId: client.id,
            clientName: client.name,
            gstin: client.gstin,
            gstUsername: client.gstUsername,
            error: errMsg,
            rawError: errMsg,
            isApiAccessDisabled: false,
          })
        }

        // Slight 250ms spacing between OTP calls to prevent burst rate limit throttling
        await new Promise((resolve) => setTimeout(resolve, 250))
      }

      return NextResponse.json({
        success: true,
        total: targetClients.length,
        triggeredClients,
        failedTriggers,
        alreadyAuthenticatedCount: clients.length - targetClients.length,
      })
    }

    // -------------------------------------------------------------
    // ACTION 2: SCAN GMAIL & MATCH GSTINs IN BATCH
    // -------------------------------------------------------------
    if (action === 'scan') {
      const candidates: BulkPendingClient[] = Array.isArray(pendingClients) ? pendingClients : []

      if (candidates.length === 0) {
        return NextResponse.json({
          success: true,
          authenticatedList: [],
          stillPendingList: [],
        })
      }

      // Fetch all recent GST emails in ONE fast IMAP connection
      const recentEmails = await fetchAllRecentGSTEmails(8) // Look back 8 minutes
      const newlyAuthenticated: BulkAuthenticatedClient[] = []
      const stillPending: BulkPendingClient[] = []

      for (const item of candidates) {
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
              const now = new Date()
              const expiresAt = addHours(now, 6)
              const finalTxn = authRes.txn || item.txn

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

              newlyAuthenticated.push({
                clientId: item.clientId,
                clientName: item.clientName,
                gstin: item.gstin,
                gstUsername: item.gstUsername,
                otp: matchedOTP,
                txn: finalTxn,
                sessionId: item.sessionId,
                message: `Authenticated via Gmail OTP (${matchedOTP})`,
              })
              continue
            }
          } catch (err) {
            console.error(`[BulkAuth Scan] Error verifying OTP for ${item.clientName}:`, err)
          }
        }

        stillPending.push(item)
      }

      return NextResponse.json({
        success: true,
        newlyAuthenticated,
        stillPending,
      })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    console.error('POST /api/auth/bulk-authenticate error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk authentication error' },
      { status: 500 }
    )
  }
}
