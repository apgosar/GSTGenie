import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const now = new Date()

    const [totalClients, totalNotices, newNotices, recentLogs] = await Promise.all([
      prisma.client.count(),
      prisma.notice.count(),
      prisma.notice.count({ where: { isNew: true } }),
      prisma.fetchLog.findMany({
        orderBy: { fetchedAt: 'desc' },
        take: 8,
        include: { client: { select: { name: true, gstin: true } } },
      }),
    ])

    // A client is genuinely healthy if status is 'authenticated' AND has an active session expiring in the future
    const healthyClientsCount = await prisma.client.count({
      where: {
        status: 'authenticated',
        sessions: {
          some: {
            isActive: true,
            expiresAt: { gt: now },
          },
        },
      },
    })

    const authIssues = Math.max(0, totalClients - healthyClientsCount)

    const activeSessions = await prisma.authSession.count({
      where: {
        isActive: true,
        expiresAt: { gt: now },
      },
    })

    const expiringSoon = await prisma.authSession.count({
      where: {
        isActive: true,
        expiresAt: {
          gt: now,
          lt: new Date(now.getTime() + 60 * 60 * 1000), // < 1hr
        },
      },
    })

    // Detect government GST Portal issues / outages from recent logs (within last 12 hours)
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000)
    const recentErrors = await prisma.fetchLog.findMany({
      where: {
        status: 'error',
        fetchedAt: { gte: twelveHoursAgo },
      },
      orderBy: { fetchedAt: 'desc' },
      take: 60,
    })

    const isPortalError = (msg: string | null) => {
      if (!msg) return false
      return (
        msg.includes('WB_ERR_9999') ||
        /temporarily unavailable/i.test(msg) ||
        /service unavailable/i.test(msg) ||
        /bad gateway/i.test(msg) ||
        /gateway timeout/i.test(msg) ||
        /502|503|504/.test(msg) ||
        /GST Service is temporarily unavailable/i.test(msg)
      )
    }

    const portalErrors = recentErrors.filter((log) => isPortalError(log.errorMessage))
    const isGstPortalIssue = portalErrors.length > 0 && authIssues > 0
    const latestPortalLog = portalErrors[0]

    const gstPortalIssue = {
      isDetected: isGstPortalIssue,
      errorCode: latestPortalLog?.errorMessage?.includes('WB_ERR_9999')
        ? 'WB_ERR_9999'
        : isGstPortalIssue
        ? 'PORTAL_UNAVAILABLE'
        : null,
      errorMessage: latestPortalLog?.errorMessage || null,
      affectedClientsCount: portalErrors.length,
      detectedAt: latestPortalLog?.fetchedAt ? latestPortalLog.fetchedAt.toISOString() : null,
    }

    return NextResponse.json({
      totalClients,
      totalNotices,
      newNotices,
      authIssues,
      activeSessions,
      expiringSoon,
      recentActivity: recentLogs,
      gstPortalIssue,
    })
  } catch (error) {
    console.error('GET /api/dashboard/stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
