import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requestOTP } from '@/lib/whitebooks-api'
import { DEFAULT_CA_EMAIL, DEFAULT_CA_IP, getStateCodeFromGSTIN } from '@/lib/utils'

export async function GET() {
  try {
    // Find any client to use as a probe
    const client = await prisma.client.findFirst({
      orderBy: { createdAt: 'desc' },
    })

    if (!client) {
      return NextResponse.json({
        online: false,
        message: 'No client records available to probe portal.',
        checkedAt: new Date().toISOString(),
      })
    }

    const stateCode = getStateCodeFromGSTIN(client.gstin) || client.stateCode || client.gstin.slice(0, 2)
    const result = await requestOTP(DEFAULT_CA_EMAIL, client.gstUsername, stateCode, DEFAULT_CA_IP)

    const rawMsg = result.message || ''
    const isPortalDown =
      rawMsg.includes('WB_ERR_9999') ||
      /temporarily unavailable/i.test(rawMsg) ||
      /service unavailable/i.test(rawMsg) ||
      /bad gateway/i.test(rawMsg) ||
      /502|503|504/.test(rawMsg)

    if (isPortalDown) {
      return NextResponse.json({
        online: false,
        errorCode: rawMsg.includes('WB_ERR_9999') ? 'WB_ERR_9999' : 'PORTAL_DOWN',
        message: rawMsg || 'GST Service is temporarily unavailable. Please try again later.',
        checkedAt: new Date().toISOString(),
      })
    }

    return NextResponse.json({
      online: true,
      errorCode: null,
      message: 'GST Portal API is operational and accepting requests.',
      checkedAt: new Date().toISOString(),
      details: result.success ? 'OTP request accepted' : rawMsg,
    })
  } catch (error) {
    return NextResponse.json({
      online: false,
      errorCode: 'PROBE_ERROR',
      message: error instanceof Error ? error.message : 'Failed to probe GST portal',
      checkedAt: new Date().toISOString(),
    })
  }
}
