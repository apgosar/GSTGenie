'use client'
import React, { useState, useEffect } from 'react'
import {
  Settings,
  Mail,
  Plus,
  Trash2,
  Send,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ExternalLink,
  Loader2,
  AlertCircle,
  Calendar,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import ScheduledTaskCountdown from '@/components/ScheduledTaskCountdown'

export default function SettingsPage() {
  const [emails, setEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingEmail, setTestingEmail] = useState<string | null>(null)

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings')
        const data = await res.json()
        if (res.ok && data.emails) {
          setEmails(data.emails)
        }
      } catch {
        toast.error('Failed to load email settings')
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  async function handleAddEmail(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newEmail.trim().toLowerCase()
    if (!trimmed) return

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmed)) {
      toast.error('Please enter a valid email address')
      return
    }

    if (emails.includes(trimmed)) {
      toast.error('This email is already in the recipient list')
      return
    }

    const updated = [...emails, trimmed]
    await saveEmails(updated)
    setNewEmail('')
  }

  async function handleRemoveEmail(emailToRemove: string) {
    if (emails.length <= 1) {
      if (!confirm('This is the only recipient email. If removed, no emails will be sent on Monday runs. Proceed?')) {
        return
      }
    }
    const updated = emails.filter((e) => e !== emailToRemove)
    await saveEmails(updated)
  }

  async function saveEmails(updatedEmails: string[]) {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_emails',
          emails: updatedEmails,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setEmails(data.emails)
        toast.success('Notification recipient list updated')
      } else {
        toast.error(data.error || 'Failed to update email list')
      }
    } catch {
      toast.error('Network error saving email settings')
    } finally {
      setSaving(false)
    }
  }

  async function handleSendTestEmail(targetEmail: string) {
    setTestingEmail(targetEmail)
    try {
      toast.info(`Sending test email to ${targetEmail}...`)
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_email',
          testEmail: targetEmail,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success(`Test email sent to ${targetEmail}! Please check your Inbox and Spam/Junk folder (search from: gnggst2026@gmail.com).`, {
          duration: 7000,
        })
      } else {
        toast.error(data.error || 'Failed to deliver test email. Check Gmail credentials.')
      }
    } catch {
      toast.error('Error sending test email')
    } finally {
      setTestingEmail(null)
    }
  }

  return (
    <div className="page-container" style={{ maxWidth: '64rem', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'rgb(15, 23, 42)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Settings size={26} color="rgb(37, 99, 235)" />
            Settings & Automation
          </h1>
          <p style={{ margin: '0.25rem 0 0', color: 'rgb(100, 116, 139)', fontSize: '0.875rem' }}>
            Configure report recipient emails, manage Monday 10:00 AM automated runs, and monitor scheduled background tasks.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        {/* Card 1: Notification Recipients */}
        <div style={{ background: 'white', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid rgb(241, 245, 249)', paddingBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 38, height: 38, borderRadius: '0.5rem', background: 'rgb(239, 246, 255)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgb(37, 99, 235)' }}>
                <Mail size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, color: 'rgb(15, 23, 42)' }}>
                  Monday 10:00 AM Report Recipients
                </h2>
                <p style={{ fontSize: '0.8rem', color: 'rgb(100, 116, 139)', margin: '0.15rem 0 0' }}>
                  The automated Monday notice fetch run will dispatch an executive summary report to these email addresses.
                </p>
              </div>
            </div>
            {saving && (
              <span style={{ fontSize: '0.75rem', color: 'rgb(37, 99, 235)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Loader2 size={12} className="animate-spin" /> Saving...
              </span>
            )}
          </div>

          {/* Add Email Form */}
          <form onSubmit={handleAddEmail} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Mail size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'rgb(148, 163, 184)' }} />
              <input
                type="email"
                placeholder="Enter email address (e.g. ca.firm@gmail.com, partner@vdsadvisory.com)"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem 0.625rem 2.25rem',
                  fontSize: '0.875rem',
                  border: '1px solid rgb(203, 213, 225)',
                  borderRadius: '0.5rem',
                  outline: 'none',
                }}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.625rem 1.25rem', fontSize: '0.875rem' }}
              disabled={saving}
            >
              <Plus size={16} /> Add Recipient
            </button>
          </form>

          {/* Recipient List */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'rgb(100, 116, 139)' }}>
              <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
              <div style={{ fontSize: '0.85rem' }}>Loading recipients...</div>
            </div>
          ) : emails.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', background: 'rgb(248, 250, 252)', borderRadius: '0.5rem', border: '1px dashed rgb(203, 213, 225)', color: 'rgb(100, 116, 139)', fontSize: '0.85rem' }}>
              No notification email addresses configured yet. Add your email above to receive the weekly Monday run report.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {emails.map((email) => (
                <div
                  key={email}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    background: 'rgb(248, 250, 252)',
                    border: '1px solid rgb(226, 232, 240)',
                    borderRadius: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgb(219, 234, 254)', color: 'rgb(37, 99, 235)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
                      {email.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'rgb(15, 23, 42)' }}>{email}</div>
                      <div style={{ fontSize: '0.7rem', color: 'rgb(22, 163, 74)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <CheckCircle2 size={11} /> Receives Weekly Notice Report
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleSendTestEmail(email)}
                      disabled={testingEmail === email}
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      {testingEmail === email ? (
                        <>
                          <Loader2 size={13} className="animate-spin" /> Sending...
                        </>
                      ) : (
                        <>
                          <Send size={13} /> Send Test Email
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleRemoveEmail(email)}
                      style={{ padding: '0.35rem 0.5rem', color: 'rgb(220, 38, 38)' }}
                      title="Remove Recipient"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Email Deliverability Notice */}
          <div
            style={{
              marginTop: '1.25rem',
              padding: '0.85rem 1rem',
              background: 'rgb(240, 249, 255)',
              border: '1px solid rgb(186, 230, 253)',
              borderRadius: '0.5rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.65rem',
            }}
          >
            <AlertCircle size={16} color="rgb(2, 132, 199)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: '0.78rem', color: 'rgb(12, 74, 110)', lineHeight: 1.5 }}>
              <strong>Important tip on email delivery:</strong> Automated reports and test emails are sent from{' '}
              <code style={{ background: 'white', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgb(186, 230, 253)' }}>
                gnggst2026@gmail.com
              </code>
              . If you do not see the test email in your primary inbox, please check your <strong>Spam / Junk</strong> folder or <strong>Updates / Promotions</strong> tab. Marking the email as <em>"Not Spam"</em> or adding <code>gnggst2026@gmail.com</code> to your email contacts will ensure all automated weekly reports arrive directly in your primary inbox.
            </div>
          </div>
        </div>

        {/* Card 2: Scheduled Automation Tasks */}
        <div style={{ background: 'white', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem', borderBottom: '1px solid rgb(241, 245, 249)', paddingBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 38, height: 38, borderRadius: '0.5rem', background: 'rgb(245, 243, 255)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgb(124, 58, 237)' }}>
                <Clock size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, color: 'rgb(15, 23, 42)' }}>
                  Active Scheduled Automation Tasks
                </h2>
                <p style={{ fontSize: '0.8rem', color: 'rgb(100, 116, 139)', margin: '0.15rem 0 0' }}>
                  Managed via Google Cloud Scheduler (Region: asia-south1 Mumbai)
                </p>
              </div>
            </div>
            <ScheduledTaskCountdown variant="compact" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {/* Job 1 */}
            <div style={{ background: 'rgb(248, 250, 252)', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.5rem', padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>● Enabled</span>
                <code style={{ fontSize: '0.75rem', background: 'white', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgb(226, 232, 240)' }}>
                  gst-notice-fetch
                </code>
              </div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0 0 0.25rem', color: 'rgb(15, 23, 42)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Calendar size={16} color="rgb(37, 99, 235)" />
                Weekly Notice Sync & Report
              </h3>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgb(37, 99, 235)', margin: '0.5rem 0' }}>
                Every Monday at 10:00 AM IST
              </div>
              <p style={{ fontSize: '0.75rem', color: 'rgb(71, 85, 105)', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
                Inspects all client GST accounts for notices issued in the last 60 days, extracts notices into the database, and emails the complete executive report.
              </p>
              <div style={{ fontSize: '0.7rem', color: 'rgb(100, 116, 139)', borderTop: '1px solid rgb(226, 232, 240)', paddingTop: '0.5rem' }}>
                <strong>Endpoint:</strong> <code>POST /api/cron/fetch-notices</code>
              </div>
            </div>

            {/* Job 2 */}
            <div style={{ background: 'rgb(248, 250, 252)', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.5rem', padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>● Enabled</span>
                <code style={{ fontSize: '0.75rem', background: 'white', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgb(226, 232, 240)' }}>
                  gst-token-refresh
                </code>
              </div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0 0 0.25rem', color: 'rgb(15, 23, 42)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Zap size={16} color="rgb(124, 58, 237)" />
                Token Refresh Automation
              </h3>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgb(124, 58, 237)', margin: '0.5rem 0' }}>
                Every 5 Hours (0 */5 * * *)
              </div>
              <p style={{ fontSize: '0.75rem', color: 'rgb(71, 85, 105)', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
                Refreshes active 6-hour auth tokens before expiry so client sessions remain permanently active without requiring repetitive manual OTP verification.
              </p>
              <div style={{ fontSize: '0.7rem', color: 'rgb(100, 116, 139)', borderTop: '1px solid rgb(226, 232, 240)', paddingTop: '0.5rem' }}>
                <strong>Endpoint:</strong> <code>POST /api/cron/refresh</code>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: How to Check Scheduled Tasks */}
        <div style={{ background: 'rgb(248, 250, 252)', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.75rem', padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.5rem', color: 'rgb(15, 23, 42)' }}>
            🔍 How to Inspect & Monitor Scheduled Tasks
          </h3>
          <div style={{ fontSize: '0.8rem', color: 'rgb(71, 85, 105)', lineHeight: 1.6 }}>
            <div>
              <strong>1. In App:</strong> Visit the <a href="/activity" style={{ color: 'rgb(37, 99, 235)', textDecoration: 'none', fontWeight: 600 }}>Activity Log</a> tab. Every execution of <code>gst-notice-fetch</code> and <code>gst-token-refresh</code> is logged with execution timestamps, notice counts, and full JSON payloads.
            </div>
            <div style={{ marginTop: '0.25rem' }}>
              <strong>2. In Google Cloud Console:</strong> Open <a href="https://console.cloud.google.com/cloudscheduler?project=gstgenie-506815" target="_blank" rel="noopener noreferrer" style={{ color: 'rgb(37, 99, 235)', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>GCP Cloud Scheduler <ExternalLink size={12} /></a> to see last run time, next run time, and HTTP execution status.
            </div>
            <div style={{ marginTop: '0.25rem' }}>
              <strong>3. Via Terminal Command:</strong> Run <code>gcloud scheduler jobs list --project gstgenie-506815 --location asia-south1</code> in PowerShell.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
