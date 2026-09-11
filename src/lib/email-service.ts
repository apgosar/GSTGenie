import nodemailer from 'nodemailer'
import { prisma } from './db'

export interface NoticeReportItem {
  clientName: string
  gstin: string
  noticeType: string
  section?: string
  taxPeriod?: string
  dueDate?: string
  issuedDate?: string
  description?: string
}

export interface ClientErrorItem {
  clientName: string
  gstin: string
  error: string
}

export interface NoticeRunReport {
  runDate: Date
  totalClientsChecked: number
  totalNoticesFound: number
  totalNewNotices: number
  newNoticeItems: NoticeReportItem[]
  failedClients: ClientErrorItem[]
}

function getMailerTransport() {
  const user = process.env.GMAIL_USER || 'gnggst2026@gmail.com'
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '')

  if (!pass) {
    throw new Error('GMAIL_APP_PASSWORD is not configured.')
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user,
      pass,
    },
  })
}

async function ensureSystemSettingTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SystemSetting" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "key" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "SystemSetting_key_key" ON "SystemSetting"("key");
    `)
  } catch (err) {
    console.warn('[EmailService] ensureSystemSettingTable notice:', err)
  }
}

export async function getNotificationEmails(): Promise<string[]> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'notification_emails' },
    })

    if (setting?.value) {
      const parsed = JSON.parse(setting.value)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((e) => typeof e === 'string' && e.includes('@'))
      }
    }
  } catch (err) {
    console.warn('Error reading notification emails from DB, ensuring table exists:', err)
    await ensureSystemSettingTable()
  }

  // Fallback default
  const defaultEmail = process.env.GMAIL_USER || 'gnggst2026@gmail.com'
  return [defaultEmail]
}

export async function setNotificationEmails(emails: string[]): Promise<string[]> {
  const cleanEmails = Array.from(
    new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')))
  )

  try {
    await prisma.systemSetting.upsert({
      where: { key: 'notification_emails' },
      create: {
        key: 'notification_emails',
        value: JSON.stringify(cleanEmails),
      },
      update: {
        value: JSON.stringify(cleanEmails),
      },
    })
  } catch (err) {
    console.warn('[EmailService] upsert failed, ensuring table exists and retrying...', err)
    await ensureSystemSettingTable()
    await prisma.systemSetting.upsert({
      where: { key: 'notification_emails' },
      create: {
        key: 'notification_emails',
        value: JSON.stringify(cleanEmails),
      },
      update: {
        value: JSON.stringify(cleanEmails),
      },
    })
  }

  return cleanEmails
}

export async function sendTestEmail(toEmail: string): Promise<{ success: boolean; message: string; messageId?: string }> {
  try {
    const transporter = getMailerTransport()
    const sender = process.env.GMAIL_USER || 'gnggst2026@gmail.com'
    const nowIst = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })

    const plainText = `GST Genie - Test Notification Verification\n\n` +
      `Hello,\n\n` +
      `This is a test notification confirming email delivery from GST Genie to ${toEmail}.\n` +
      `Your email address is configured to receive automated compliance reports every Monday at 10:00 AM IST.\n\n` +
      `Recipient: ${toEmail}\n` +
      `Timestamp: ${nowIst} IST\n` +
      `Status: Active & Verified\n\n` +
      `Powered by Siddh Tech Solutions - https://siddhtech.ai\n`

    const info = await transporter.sendMail({
      from: `"GST Genie" <${sender}>`,
      to: toEmail,
      subject: 'GST Genie: Test Notification Verification',
      text: plainText,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #ffffff;">
          <div style="background: #2563eb; padding: 20px; color: white; text-align: center;">
            <h1 style="margin: 0; font-size: 20px; font-weight: 700;">GST Genie</h1>
            <p style="margin: 5px 0 0; font-size: 13px; opacity: 0.9;">Test Notification Verification</p>
          </div>
          <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
            <p style="margin-top: 0;">Hello,</p>
            <p>This is a test notification confirming email delivery from <strong>GST Genie</strong>. Your email address is configured to receive automated compliance reports every <strong>Monday at 10:00 AM IST</strong>.</p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px 18px; border-radius: 6px; font-size: 13px; margin: 18px 0;">
              <div style="margin-bottom: 4px;"><strong>Recipient:</strong> ${toEmail}</div>
              <div style="margin-bottom: 4px;"><strong>Timestamp:</strong> ${nowIst} IST</div>
              <div><strong>Status:</strong> <span style="color: #16a34a; font-weight: 600;">Active &amp; Verified</span></div>
            </div>
            <p style="font-size: 12px; color: #64748b; margin-top: 20px; margin-bottom: 0; border-top: 1px solid #f1f5f9; padding-top: 12px;">
              &copy; ${new Date().getFullYear()} GST Genie &middot; Powered by <a href="https://siddhtech.ai" style="color: #2563eb; text-decoration: none;">Siddh Tech Solutions</a>
            </p>
          </div>
        </div>
      `,
    })

    console.log(`[EmailService] Test email dispatched successfully to ${toEmail}:`, {
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
    })

    return {
      success: true,
      message: `Test email successfully dispatched to ${toEmail}`,
      messageId: info.messageId,
    }
  } catch (error) {
    console.error('[EmailService] Error sending test email:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to send test email',
    }
  }
}

export async function sendNoticeRunReportEmail(report: NoticeRunReport): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const recipients = await getNotificationEmails()
    if (recipients.length === 0) {
      console.log('[NoticeRunReport] No recipient emails configured. Skipping email send.')
      return { success: true, count: 0 }
    }

    const transporter = getMailerTransport()
    const sender = process.env.GMAIL_USER || 'gnggst2026@gmail.com'
    const dateFormatted = report.runDate.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    const hasNewNotices = report.totalNewNotices > 0
    const subjectPrefix = hasNewNotices ? `🚨 [${report.totalNewNotices} NEW NOTICES]` : '📋 [Summary]'
    const subject = `${subjectPrefix} GST Genie Notice Run Report — ${dateFormatted} IST`

    // Generate HTML tables
    let newNoticesTableHtml = ''
    if (hasNewNotices) {
      const rows = report.newNoticeItems
        .map(
          (n) => `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px 12px; font-weight: 600;">${n.clientName}<br/><span style="font-weight: 400; font-size: 11px; color: #64748b;">${n.gstin}</span></td>
            <td style="padding: 8px 12px;"><span style="background: #dbeafe; color: #1d4ed8; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">${n.noticeType}</span></td>
            <td style="padding: 8px 12px; font-size: 12px;">${n.section || '-'}</td>
            <td style="padding: 8px 12px; font-size: 12px;">${n.taxPeriod || '-'}</td>
            <td style="padding: 8px 12px; font-size: 12px; color: #dc2626; font-weight: 600;">${n.dueDate || '-'}</td>
          </tr>
        `
        )
        .join('')

      newNoticesTableHtml = `
        <h3 style="color: #0f172a; margin: 24px 0 10px; font-size: 15px;">📬 New Notices Detected (${report.totalNewNotices})</h3>
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; border: 1px solid #e2e8f0;">
          <thead>
            <tr style="background: #f1f5f9; color: #475569; font-size: 12px;">
              <th style="padding: 8px 12px;">Client / GSTIN</th>
              <th style="padding: 8px 12px;">Notice Type</th>
              <th style="padding: 8px 12px;">Section</th>
              <th style="padding: 8px 12px;">Tax Period</th>
              <th style="padding: 8px 12px;">Due Date</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `
    } else {
      newNoticesTableHtml = `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 14px; border-radius: 6px; color: #166534; font-size: 13px; margin: 20px 0;">
          ✅ <strong>No New Notices Detected:</strong> All ${report.totalClientsChecked} client GST accounts were inspected. Zero new notices were issued.
        </div>
      `
    }

    let failedClientsHtml = ''
    if (report.failedClients.length > 0) {
      const failedRows = report.failedClients
        .map(
          (f) => `
          <tr style="border-bottom: 1px solid #fee2e2;">
            <td style="padding: 8px 12px; font-weight: 600;">${f.clientName}<br/><span style="font-weight: 400; font-size: 11px; color: #64748b;">${f.gstin}</span></td>
            <td style="padding: 8px 12px; font-size: 12px; color: #b91c1c;">${f.error}</td>
          </tr>
        `
        )
        .join('')

      failedClientsHtml = `
        <h3 style="color: #b91c1c; margin: 24px 0 10px; font-size: 15px;">⚠️ Attention Needed: Failed Checks (${report.failedClients.length})</h3>
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; border: 1px solid #fecaca;">
          <thead>
            <tr style="background: #fef2f2; color: #991b1b; font-size: 12px;">
              <th style="padding: 8px 12px;">Client / GSTIN</th>
              <th style="padding: 8px 12px;">Reason / Action Required</th>
            </tr>
          </thead>
          <tbody>
            ${failedRows}
          </tbody>
        </table>
      `
    }

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #ffffff;">
        <div style="background: #0f172a; padding: 20px; color: #ffffff;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div>
              <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff;">GST Genie</h1>
              <p style="margin: 4px 0 0; font-size: 12px; color: #94a3b8;">Weekly Automated GST Notice Fetch Report &middot; Monday 10:00 AM IST</p>
            </div>
          </div>
        </div>

        <div style="padding: 24px;">
          <!-- KPI Cards -->
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; text-align: center;">
              <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Clients Checked</div>
              <div style="font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 4px;">${report.totalClientsChecked}</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; text-align: center;">
              <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Total Notices Found</div>
              <div style="font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 4px;">${report.totalNoticesFound}</div>
            </div>
            <div style="background: ${hasNewNotices ? '#eff6ff' : '#f8fafc'}; border: 1px solid ${hasNewNotices ? '#bfdbfe' : '#e2e8f0'}; padding: 12px; border-radius: 6px; text-align: center;">
              <div style="font-size: 11px; color: ${hasNewNotices ? '#1d4ed8' : '#64748b'}; text-transform: uppercase;">New Notices</div>
              <div style="font-size: 22px; font-weight: 700; color: ${hasNewNotices ? '#1d4ed8' : '#0f172a'}; margin-top: 4px;">${report.totalNewNotices}</div>
            </div>
          </div>

          ${newNoticesTableHtml}
          ${failedClientsHtml}

          <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center;">
            <a href="https://gst-genie-175265902825.asia-south1.run.app" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: 600;">
              Open GST Genie Dashboard &rarr;
            </a>
            <p style="margin: 16px 0 0; font-size: 11px; color: #94a3b8;">
              This is an automated compliance report dispatched by GST Genie every Monday at 10:00 AM IST.<br/>
              &copy; ${new Date().getFullYear()} GST Genie &middot; Powered by <a href="https://siddhtech.ai" style="color: #64748b;">Siddh Tech Solutions</a>
            </p>
          </div>
        </div>
      </div>
    `

    // Plain text summary for email clients and spam filter compliance
    const plainTextBody = [
      `GST Genie - Weekly Notice Sync Report (${dateFormatted} IST)`,
      `============================================================`,
      `Total Clients Checked: ${report.totalClientsChecked}`,
      `Total Notices Found:   ${report.totalNoticesFound}`,
      `New Notices Detected:  ${report.totalNewNotices}`,
      '',
      report.totalNewNotices > 0 ? '--- NEW NOTICES ---' : 'No new notices were detected across any authenticated accounts.',
      ...report.newNoticeItems.map(
        (n) => `* ${n.clientName} (${n.gstin}): ${n.noticeType} | Section: ${n.section || 'N/A'} | Tax Period: ${n.taxPeriod || 'N/A'} | Due Date: ${n.dueDate || 'N/A'}`
      ),
      '',
      report.failedClients.length > 0 ? '--- FAILED CLIENTS ---' : '',
      ...report.failedClients.map((f) => `* ${f.clientName} (${f.gstin}): ${f.error}`),
      '',
      'Dashboard: https://gst-genie-q7addn2xsq-el.a.run.app',
      'Powered by Siddh Tech Solutions (https://siddhtech.ai)',
    ].filter(Boolean).join('\n')

    const info = await transporter.sendMail({
      from: `"GST Genie" <${sender}>`,
      to: recipients.join(', '),
      subject,
      text: plainTextBody,
      html: htmlBody,
    })

    console.log(`[NoticeRunReport] Email report dispatched to: ${recipients.join(', ')}`, {
      messageId: info.messageId,
      response: info.response,
    })
    return { success: true, count: recipients.length }
  } catch (err) {
    console.error('[NoticeRunReport] Failed to send report email:', err)
    return {
      success: false,
      count: 0,
      error: err instanceof Error ? err.message : 'Failed to send report email',
    }
  }
}
