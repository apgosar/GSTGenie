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

    return NextResponse.json({
      totalClients,
      totalNotices,
      newNotices,
      authIssues,
      activeSessions,
      expiringSoon,
      recentActivity: recentLogs,
    })
  } catch (error) {
    console.error('GET /api/dashboard/stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
