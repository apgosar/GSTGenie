import { NextRequest, NextResponse } from 'next/server'
import { pollForGmailOTP } from '@/lib/gmail-otp'
import { prisma } from '@/lib/db'
import { getAuthToken } from '@/lib/whitebooks-api'
import { DEFAULT_CA_EMAIL, DEFAULT_CA_IP, getStateCodeFromGSTIN } from '@/lib/utils'
import { addHours } from 'date-fns'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { clientId, gstin: passedGSTIN, gstUsername: passedUsername, txn, sessionId, autoVerify = true, timeoutSeconds = 10 } = body

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      return NextResponse.json(
        {
          error: 'Gmail credentials not configured in .env. Please add GMAIL_USER and GMAIL_APP_PASSWORD.',
        },
        { status: 400 }
      )
    }

    // Retrieve client record if clientId provided
    let client = null
    if (clientId) {
      client = await prisma.client.findUnique({ where: { id: clientId } })
    }

    const targetGSTIN = client?.gstin || passedGSTIN || ''
    const targetUsername = client?.gstUsername || passedUsername || ''

    console.log(`[GmailOTP] Listening for OTP from Gmail for GSTIN: "${targetGSTIN}" (User: "${targetUsername}", timeout: ${timeoutSeconds}s)...`)
    
    // Strictly search for emails matching the specific client's GSTIN
    const otpResult = await pollForGmailOTP(timeoutSeconds, 2500, targetGSTIN, targetUsername)

    if (!otpResult.success || !otpResult.otp) {
      return NextResponse.json(
        {
          success: false,
          error: otpResult.message || `No OTP email received for GSTIN ${targetGSTIN} yet.`,
        },
        { status: 404 }
      )
    }

    const detectedOtp = otpResult.otp
    console.log(`[GmailOTP] ✅ Successfully matched OTP ${detectedOtp} for GSTIN ${targetGSTIN} from email subject: "${otpResult.subject}"`)

    // If autoVerify is enabled and we have clientId & txn, perform token exchange directly
    if (autoVerify && client && txn) {
      const stateCode = getStateCodeFromGSTIN(client.gstin) || client.stateCode || client.gstin.slice(0, 2)

      const authResult = await getAuthToken(
        DEFAULT_CA_EMAIL,
        detectedOtp,
        txn,
        client.gstUsername,
        stateCode,
        DEFAULT_CA_IP
      )

      if (authResult.success) {
        const now = new Date()
        const expiresAt = addHours(now, 6)
        const finalTxn = authResult.txn || txn

        if (sessionId) {
          await prisma.authSession.update({
            where: { id: sessionId },
            data: {
              txn: finalTxn,
              isActive: true,
              authError: null,
              lastRefreshedAt: now,
              expiresAt,
            },
          })
        } else {
          await prisma.authSession.updateMany({
            where: { clientId: client.id, isActive: true },
            data: { isActive: false },
          })
          await prisma.authSession.create({
            data: {
              clientId: client.id,
              txn: finalTxn,
              ipAddress: DEFAULT_CA_IP,
              isActive: true,
              lastRefreshedAt: now,
              expiresAt,
            },
          })
        }

        await prisma.client.update({
          where: { id: client.id },
          data: { status: 'authenticated' },
        })

        return NextResponse.json({
          success: true,
          otp: detectedOtp,
          autoVerified: true,
          matchedGSTIN: targetGSTIN,
          message: `OTP retrieved for GSTIN ${targetGSTIN} and verified successfully! Session active for 6 hours.`,
          emailSubject: otpResult.subject,
          receivedAt: otpResult.receivedAt,
        })
      } else {
        return NextResponse.json({
          success: true,
          otp: detectedOtp,
          autoVerified: false,
          matchedGSTIN: targetGSTIN,
          authError: authResult.message || 'OTP verification failed with WhiteBooks.',
        })
      }
    }

    return NextResponse.json({
      success: true,
      otp: detectedOtp,
      autoVerified: false,
      matchedGSTIN: targetGSTIN,
      emailSubject: otpResult.subject,
      receivedAt: otpResult.receivedAt,
    })
  } catch (error) {
    console.error('POST /api/auth/fetch-gmail-otp error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error checking Gmail for OTP' },
      { status: 500 }
    )
  }
}
