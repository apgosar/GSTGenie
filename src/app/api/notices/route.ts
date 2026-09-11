import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('clientId')
    const isNew = searchParams.get('isNew')

    const where: Record<string, unknown> = {}
    if (clientId) where.clientId = clientId
    if (isNew === 'true') where.isNew = true

    const notices = await prisma.notice.findMany({
      where,
      orderBy: [{ isNew: 'desc' }, { createdAt: 'desc' }],
      include: {
        client: { select: { id: true, name: true, gstin: true } },
      },
    })

    return NextResponse.json(notices)
  } catch (error) {
    console.error('GET /api/notices error:', error)
    return NextResponse.json({ error: 'Failed to fetch notices' }, { status: 500 })
  }
}
