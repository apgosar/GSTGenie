import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { refreshToken } from '@/lib/whitebooks-api'
import { DEFAULT_CA_EMAIL, DEFAULT_CA_IP, getStateCodeFromGSTIN } from '@/lib/utils'
import { addHours } from 'date-fns'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { clientId } = body

    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } })
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const session = await prisma.authSession.findFirst({
      where: { clientId, isActive: true },
      orderBy: { createdAt: 'desc' },
    })

    if (!session || !session.txn) {
      return NextResponse.json(
        { error: 'No active session. Please authenticate first.' },
        { status: 400 }
      )
    }

    const stateCode = getStateCodeFromGSTIN(client.gstin) || client.stateCode || client.gstin.slice(0, 2)
    const result = await refreshToken(
      DEFAULT_CA_EMAIL,
      session.txn,
      client.gstUsername,
      stateCode,
      DEFAULT_CA_IP
    )

    if (!result.success) {
      await prisma.authSession.update({
        where: { id: session.id },
        data: { isActive: false, authError: result.message },
      })
      await prisma.client.update({
        where: { id: clientId },
        data: { status: 'error' },
      })
      return NextResponse.json({ error: result.message || 'Token refresh failed' }, { status: 400 })
    }

    const now = new Date()
    await prisma.authSession.update({
      where: { id: session.id },
      data: { lastRefreshedAt: now, expiresAt: addHours(now, 6), authError: null },
    })
    await prisma.client.update({
      where: { id: clientId },
      data: { status: 'authenticated' },
    })

    return NextResponse.json({ success: true, message: 'Token refreshed successfully' })
  } catch (error) {
    console.error('POST /api/auth/refresh error:', error)
    return NextResponse.json({ error: 'Failed to refresh token' }, { status: 500 })
  }
}
