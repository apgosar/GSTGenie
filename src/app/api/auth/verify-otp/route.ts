import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthToken } from '@/lib/whitebooks-api'
import { DEFAULT_CA_EMAIL, DEFAULT_CA_IP, getStateCodeFromGSTIN } from '@/lib/utils'
import { addHours } from 'date-fns'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { clientId, otp, sessionId, txn } = body

    if (!clientId || !otp) {
      return NextResponse.json(
        { error: 'clientId and otp are required' },
        { status: 400 }
      )
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } })
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Find the pending session's txn if not directly provided
    let step1Txn = txn
    if (!step1Txn) {
      const pendingSession = await prisma.authSession.findFirst({
        where: { clientId },
        orderBy: { createdAt: 'desc' },
      })
      step1Txn = pendingSession?.txn
    }

    if (!step1Txn) {
      return NextResponse.json(
        { error: 'No transaction ID found. Please request a new OTP first.' },
        { status: 400 }
      )
    }

    const stateCode = getStateCodeFromGSTIN(client.gstin) || client.stateCode || client.gstin.slice(0, 2)
    const result = await getAuthToken(
      DEFAULT_CA_EMAIL,
      otp,
      step1Txn,
      client.gstUsername,
      stateCode,
      DEFAULT_CA_IP
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.message || 'OTP verification failed', debug: result.debug, raw: result.raw },
        { status: 400 }
      )
    }

    const now = new Date()
    const expiresAt = addHours(now, 6)
    // The returned authToken is valid for 6 hours and will be used as `txn` in getnotices/noticedetails
    const authorizedToken = result.authToken || result.txn || step1Txn

    if (sessionId) {
      await prisma.authSession.update({
        where: { id: sessionId },
        data: {
          txn: authorizedToken,
          isActive: true,
          authError: null,
          lastRefreshedAt: now,
          expiresAt,
        },
      })
    } else {
      await prisma.authSession.updateMany({
        where: { clientId, isActive: true },
        data: { isActive: false },
      })
      await prisma.authSession.create({
        data: {
          clientId,
          txn: authorizedToken,
          ipAddress: DEFAULT_CA_IP,
          isActive: true,
          lastRefreshedAt: now,
          expiresAt,
        },
      })
    }

    await prisma.client.update({
      where: { id: clientId },
      data: { status: 'authenticated' },
    })

    try {
      await prisma.fetchLog.create({
        data: {
          clientId,
          status: 'success',
          logType: 'otp_verify',
          errorMessage: null,
          rawResponse: JSON.stringify({
            request: {
              endpoint: 'GET /authentication/authtoken',
              email: DEFAULT_CA_EMAIL,
              otp,
              txn: step1Txn,
              gst_username: client.gstUsername,
              state_cd: stateCode,
              ip_address: DEFAULT_CA_IP,
            },
            response: {
              authToken: authorizedToken,
              message: 'Authentication successful! Session active for 6 hours.',
              data: result.raw,
              rawBody: result.rawText,
            },
          }),
        },
      })
    } catch {}

    return NextResponse.json({
      success: true,
      message: 'Authentication successful! Session active for 6 hours.',
      expiresAt,
      txn: authorizedToken,
    })
  } catch (error) {
    console.error('POST /api/auth/verify-otp error:', error)
    return NextResponse.json({ error: 'Failed to verify OTP' }, { status: 500 })
  }
}
