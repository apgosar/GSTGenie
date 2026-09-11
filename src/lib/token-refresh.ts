import { prisma } from './db'
import { refreshToken } from './whitebooks-api'
import { DEFAULT_CA_EMAIL, DEFAULT_CA_IP, getStateCodeFromGSTIN } from './utils'
import { addHours } from 'date-fns'

const REFRESH_INTERVAL_MS = 5 * 60 * 1000        // Check every 5 minutes
const REFRESH_THRESHOLD_MS = 5.75 * 60 * 60 * 1000 // Refresh if older than 5h45m

let refreshTimer: ReturnType<typeof setInterval> | null = null
let isRunning = false

export async function runTokenRefreshCycle() {
  if (isRunning) return
  isRunning = true

  try {
    const now = new Date()
    const thresholdTime = new Date(now.getTime() - REFRESH_THRESHOLD_MS)

    const sessions = await prisma.authSession.findMany({
      where: {
        isActive: true,
        lastRefreshedAt: { lt: thresholdTime },
      },
      include: { client: true },
    })

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
          await prisma.authSession.update({
            where: { id: session.id },
            data: {
              lastRefreshedAt: now,
              expiresAt: addHours(now, 6),
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
            },
          })
          console.log(`[TokenRefresh] ✓ Refreshed for ${client.name} (${client.gstin})`)
        } else {
          await prisma.authSession.update({
            where: { id: session.id },
            data: { isActive: false, authError: result.message || 'Refresh failed' },
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
            },
          })
          console.error(`[TokenRefresh] ✗ Failed for ${client.name}: ${result.message}`)
        }
      } catch (err) {
        console.error(`[TokenRefresh] Error for session ${session.id}:`, err)
      }
    }
  } catch (err) {
    console.error('[TokenRefresh] Cycle error:', err)
  } finally {
    isRunning = false
  }
}

export function startTokenRefreshJob() {
  if (refreshTimer) return
  console.log('[TokenRefresh] Starting background job (checks every 5 min, refreshes at 5h45m)')
  runTokenRefreshCycle() // Run immediately on start
  refreshTimer = setInterval(runTokenRefreshCycle, REFRESH_INTERVAL_MS)
}

export function stopTokenRefreshJob() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
    console.log('[TokenRefresh] Stopped')
  }
}
