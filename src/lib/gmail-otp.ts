import { ImapFlow } from 'imapflow'
import { simpleParser, ParsedMail } from 'mailparser'

export interface GmailOTPResult {
  success: boolean
  otp?: string
  subject?: string
  from?: string
  matchedGSTIN?: string
  receivedAt?: Date
  message?: string
}

export interface ExtractedGSTEmail {
  gstin?: string
  otp: string
  subject: string
  from: string
  receivedAt: Date
  rawBody: string
}

function normalizeStr(s: string): string {
  return String(s || '').toUpperCase().replace(/[\s\-_]/g, '')
}

function extractOTPFromBody(text: string): string | null {
  if (!text) return null

  // 1. Official GST portal format: "This is to inform you that the OTP is 471962 for the transaction..."
  const gstSpecificPatterns = [
    /(?:the\s+)?otp\s+is\s+(\d{6})\b/i,
    /(?:one\s*time\s*password|otp|verification\s*code|code)\s*(?:is|:|-)?\s*<b>?(\d{6})<\/b>?/i,
    /\b(\d{6})\s*(?:is\s*your\s*otp|is\s*the\s*otp|is\s*your\s*one\s*time\s*password)/i,
    /(?:is|code:?)\s*(\d{6})\b/i,
  ]

  for (const pattern of gstSpecificPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }

  // 2. Generic 6-digit match, avoiding 15-digit GSTINs or 10-digit phone numbers
  const all6Digits = text.match(/\b\d{6}\b/g)
  if (all6Digits && all6Digits.length > 0) {
    return all6Digits[0]
  }

  return null
}

function extractGSTINFromBody(text: string): string | null {
  if (!text) return null

  // Standard 15-character GSTIN regex pattern: 2 digits + 5 chars + 4 digits + 1 char + 1 char + Z + 1 char
  const gstinRegex = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b/i
  const match = text.match(gstinRegex)
  if (match && match[1]) {
    return match[1].toUpperCase()
  }

  return null
}

export async function fetchAllRecentGSTEmails(sinceMinutes: number = 10): Promise<ExtractedGSTEmail[]> {
  const user = process.env.GMAIL_USER || ''
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '')

  if (!user || !pass) {
    console.error('[GmailOTP] GMAIL_USER or GMAIL_APP_PASSWORD is not configured.')
    return []
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  })

  const results: ExtractedGSTEmail[] = []

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    try {
      const thresholdTime = Date.now() - sinceMinutes * 60 * 1000
      const sinceDate = new Date(thresholdTime)

      const searchCriteria = { since: sinceDate }
      const messages: any[] = []

      for await (const message of client.fetch(searchCriteria, { envelope: true, source: true })) {
        const msgDate = message.envelope?.date ? new Date(message.envelope.date).getTime() : Date.now()
        if (msgDate >= thresholdTime - 30 * 1000) {
          messages.push(message)
        }
      }

      // Process newest first
      messages.reverse()

      for (const msg of messages) {
        if (!msg.source) continue
        const parsed: ParsedMail = await simpleParser(msg.source as Buffer)
        const subject = parsed.subject || ''
        const from = parsed.from?.text || ''
        const body = (parsed.text || parsed.html || '') as string
        const date = parsed.date || new Date()

        const isFromGST =
          /donotreply@gst\.gov\.in/i.test(from) ||
          /gst\.gov\.in/i.test(from) ||
          /gst|otp|taxpayer|whitebooks/i.test(subject) ||
          /gst/i.test(body)

        if (!isFromGST) continue

        const otp = extractOTPFromBody(body) || extractOTPFromBody(subject)
        const gstin = extractGSTINFromBody(body) || extractGSTINFromBody(subject)

        if (otp) {
          results.push({
            gstin: gstin || undefined,
            otp,
            subject,
            from,
            receivedAt: date,
            rawBody: body,
          })
        }
      }
    } finally {
      lock.release()
    }
  } catch (err) {
    console.error('[GmailOTP] Error fetching all recent GST emails:', err)
  } finally {
    try {
      await client.logout()
    } catch {}
  }

  return results
}

export async function checkGmailForOTP(
  sinceMinutes: number = 5,
  targetGSTIN?: string,
  targetUsername?: string
): Promise<GmailOTPResult> {
  const allEmails = await fetchAllRecentGSTEmails(sinceMinutes)
  const normTargetGSTIN = targetGSTIN ? normalizeStr(targetGSTIN) : ''
  const normTargetUsername = targetUsername ? normalizeStr(targetUsername) : ''

  if (allEmails.length === 0) {
    return {
      success: false,
      message: `No new GST emails received in the last ${sinceMinutes} minutes.`,
    }
  }

  for (const email of allEmails) {
    const normBody = normalizeStr(email.rawBody)
    const normSubject = normalizeStr(email.subject)

    // If targetGSTIN is specified, verify it matches
    if (normTargetGSTIN) {
      const gstinMatches = (email.gstin && normalizeStr(email.gstin) === normTargetGSTIN) ||
        normBody.includes(normTargetGSTIN) ||
        normSubject.includes(normTargetGSTIN)

      if (!gstinMatches) {
        const usernameMatches = normTargetUsername && (normBody.includes(normTargetUsername) || normSubject.includes(normTargetUsername))
        if (!usernameMatches) {
          continue
        }
      }
    }

    return {
      success: true,
      otp: email.otp,
      subject: email.subject,
      from: email.from,
      matchedGSTIN: targetGSTIN || email.gstin,
      receivedAt: email.receivedAt,
      message: `Found OTP ${email.otp} for GSTIN ${targetGSTIN || email.gstin || 'N/A'}`,
    }
  }

  if (normTargetGSTIN) {
    return {
      success: false,
      message: `Emails found, but none matched GSTIN ${targetGSTIN} yet. Waiting for email...`,
    }
  }

  return {
    success: false,
    message: 'Emails found, but no matching OTP was detected.',
  }
}

export async function pollForGmailOTP(
  maxWaitSeconds: number = 10,
  intervalMs: number = 2500,
  targetGSTIN?: string,
  targetUsername?: string
): Promise<GmailOTPResult> {
  const startTime = Date.now()
  const timeoutMs = maxWaitSeconds * 1000

  while (Date.now() - startTime < timeoutMs) {
    const result = await checkGmailForOTP(5, targetGSTIN, targetUsername)
    if (result.success && result.otp) {
      return result
    }
    // Wait before next check
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  return {
    success: false,
    message: `Timed out waiting for OTP email for GSTIN ${targetGSTIN || 'N/A'}.`,
  }
}
