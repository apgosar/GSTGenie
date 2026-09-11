import { NextRequest, NextResponse } from 'next/server'
import { getNotificationEmails, setNotificationEmails, sendTestEmail } from '@/lib/email-service'

export async function GET() {
  try {
    const emails = await getNotificationEmails()
    return NextResponse.json({
      emails,
      schedule: {
        noticeFetch: 'Every Monday at 10:00 AM IST (0 10 * * 1)',
        tokenRefresh: 'Every 5 hours (0 */5 * * *)',
      },
    })
  } catch (error) {
    console.error('GET /api/settings error:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action = 'update_emails', emails, testEmail } = body

    if (action === 'update_emails') {
      if (!Array.isArray(emails)) {
        return NextResponse.json({ error: 'emails must be an array of strings' }, { status: 400 })
      }

      const updated = await setNotificationEmails(emails)
      return NextResponse.json({
        success: true,
        emails: updated,
        message: 'Notification email recipients updated successfully',
      })
    }

    if (action === 'test_email') {
      if (!testEmail || typeof testEmail !== 'string' || !testEmail.includes('@')) {
        return NextResponse.json({ error: 'Valid testEmail is required' }, { status: 400 })
      }

      const result = await sendTestEmail(testEmail.trim())
      if (!result.success) {
        return NextResponse.json({ error: result.message }, { status: 400 })
      }

      return NextResponse.json({ success: true, message: result.message })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('POST /api/settings error:', error)
    const errorMsg = error instanceof Error ? error.message : 'Failed to update settings'
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}
