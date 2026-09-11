import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('clientId')
    const logType = searchParams.get('logType')
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const skip = (page - 1) * limit

    const where: any = {}

    if (clientId) {
      where.clientId = clientId
    }

    if (logType && logType !== 'all') {
      where.logType = logType
    }

    if (status && status !== 'all') {
      where.status = status
    }

    if (search) {
      where.client = {
        OR: [
          { name: { contains: search } },
          { gstin: { contains: search } },
          { gstUsername: { contains: search } },
        ],
      }
    }

    const [logs, totalCount, statsCounts] = await Promise.all([
      prisma.fetchLog.findMany({
        where,
        orderBy: { fetchedAt: 'desc' },
        skip,
        take: limit,
        include: {
          client: {
            select: {
              id: true,
              name: true,
              gstin: true,
              gstUsername: true,
              stateCode: true,
            },
          },
        },
      }),
      prisma.fetchLog.count({ where }),
      prisma.fetchLog.groupBy({
        by: ['logType', 'status'],
        _count: { id: true },
      }),
    ])

    let noticeFetches = 0
    let tokenRefreshes = 0
    let otpEvents = 0
    let errorsCount = 0

    for (const item of statsCounts) {
      if (item.status === 'error') {
        errorsCount += item._count.id
      }
      if (item.logType === 'notice_fetch') {
        noticeFetches += item._count.id
      } else if (item.logType === 'token_refresh') {
        tokenRefreshes += item._count.id
      } else if (item.logType === 'otp_request' || item.logType === 'otp_verify') {
        otpEvents += item._count.id
      }
    }

    return NextResponse.json({
      logs,
      total: totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit) || 1,
      stats: {
        total: totalCount,
        noticeFetches,
        tokenRefreshes,
        otpEvents,
        errors: errorsCount,
      },
    })
  } catch (error) {
    console.error('GET /api/activity error:', error)
    return NextResponse.json({ error: 'Failed to fetch activity logs' }, { status: 500 })
  }
}
