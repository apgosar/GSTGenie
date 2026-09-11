import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { validateGSTIN, getStateCodeFromGSTIN, DEFAULT_CA_EMAIL } from '@/lib/utils'
import { z } from 'zod'

const CreateClientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  gstin: z.string().length(15, 'GSTIN must be 15 characters'),
  gstUsername: z.string().min(1, 'GST Username is required'),
  email: z.string().email('Invalid email').default(DEFAULT_CA_EMAIL),
  phone: z.string().optional(),
  stateCode: z.string().optional(),
})

export async function GET() {
  try {
    const clients = await prisma.client.findMany({
      orderBy: [
        { status: 'asc' }, // error/expired first
        { createdAt: 'desc' },
      ],
      include: {
        sessions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        fetchLogs: {
          where: { logType: 'notice_fetch' },
          orderBy: { fetchedAt: 'desc' },
          take: 1,
        },
        _count: { select: { notices: true } },
      },
    })

    const newNoticeCounts = await prisma.notice.groupBy({
      by: ['clientId'],
      where: { isNew: true },
      _count: { id: true },
    })
    const newCountMap = Object.fromEntries(
      newNoticeCounts.map((n) => [n.clientId, n._count.id])
    )

    const enriched = clients.map((c) => ({
      ...c,
      newNoticeCount: newCountMap[c.id] ?? 0,
      activeSession: c.sessions[0] ?? null,
      totalNotices: c._count.notices,
      lastNoticeFetchedAt: c.fetchLogs[0]?.fetchedAt ?? null,
      lastFetchStatus: c.fetchLogs[0]?.status ?? null,
    }))

    // Sort: auth issues first, then by new notices
    enriched.sort((a, b) => {
      const aIssue = ['error', 'expired'].includes(a.status) ? 0 : 1
      const bIssue = ['error', 'expired'].includes(b.status) ? 0 : 1
      if (aIssue !== bIssue) return aIssue - bIssue
      return b.newNoticeCount - a.newNoticeCount
    })

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('GET /api/clients error:', error)
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = CreateClientSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { gstin } = parsed.data
    if (!validateGSTIN(gstin)) {
      return NextResponse.json({ error: 'Invalid GSTIN format' }, { status: 400 })
    }

    const existing = await prisma.client.findUnique({ where: { gstin } })
    if (existing) {
      return NextResponse.json({ error: 'Client with this GSTIN already exists' }, { status: 409 })
    }

    // Auto populate state code from first 2 digits of GSTIN
    const derivedStateCode = getStateCodeFromGSTIN(gstin) || parsed.data.stateCode || gstin.slice(0, 2)

    const client = await prisma.client.create({
      data: {
        name: parsed.data.name,
        gstin: parsed.data.gstin,
        gstUsername: parsed.data.gstUsername,
        email: parsed.data.email || DEFAULT_CA_EMAIL,
        phone: parsed.data.phone,
        stateCode: derivedStateCode,
        status: 'pending',
      },
    })

    return NextResponse.json(client, { status: 201 })
  } catch (error) {
    console.error('POST /api/clients error:', error)
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }
}
