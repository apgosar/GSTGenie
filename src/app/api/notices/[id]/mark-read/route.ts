import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const notice = await prisma.notice.update({
      where: { id },
      data: { isNew: false },
    })
    return NextResponse.json(notice)
  } catch (error) {
    console.error('PUT /api/notices/[id]/mark-read error:', error)
    return NextResponse.json({ error: 'Failed to mark notice as read' }, { status: 500 })
  }
}
