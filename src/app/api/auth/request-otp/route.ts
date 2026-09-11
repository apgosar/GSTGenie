import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requestOTP } from '@/lib/whitebooks-api'
import { DEFAULT_CA_EMAIL, DEFAULT_CA_IP, getStateCodeFromGSTIN } from '@/lib/utils'

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

    const stateCode = getStateCodeFromGSTIN(client.gstin) || client.stateCode || client.gstin.slice(0, 2)
    const result = await requestOTP(
      DEFAULT_CA_EMAIL,
      client.gstUsername,
      stateCode,
      DEFAULT_CA_IP
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.message || 'Failed to send OTP', debug: result.debug, raw: result.raw },
        { status: 400 }
      )
    }

    const txnToStore = result.txn || 'pending'

    // Deactivate old sessions
    await prisma.authSession.updateMany({
      where: { clientId, isActive: true },
      data: { isActive: false },
    })

    // Create a pending session with the txn from Step 1 otprequest
    const session = await prisma.authSession.create({
      data: {
        clientId,
        txn: txnToStore,
        ipAddress: DEFAULT_CA_IP,
        isActive: false,
        expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
      },
    })

    await prisma.client.update({
      where: { id: clientId },
      data: { status: 'pending' },
    })

    try {
      await prisma.fetchLog.create({
        data: {
          clientId,
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
              txn: txnToStore,
              message: result.message,
              data: result.raw,
              rawBody: result.rawText,
            },
          }),
        },
      })
    } catch {}

    return NextResponse.json({
      success: true,
      message: result.message || 'OTP sent successfully to taxpayer credentials',
      sessionId: session.id,
      txn: txnToStore,
    })
  } catch (error) {
    console.error('POST /api/auth/request-otp error:', error)
    return NextResponse.json({ error: 'Failed to request OTP' }, { status: 500 })
  }
}
