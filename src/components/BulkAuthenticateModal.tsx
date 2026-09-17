'use client'
import React, { useState, useEffect, useRef } from 'react'
import { X, Zap, Loader2, CheckCircle2, Clock, AlertTriangle, KeyRound, Sparkles, RotateCcw, ShieldCheck, Copy, Check, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import OTPModal from './OTPModal'

interface BulkPendingClient {
  clientId: string
  clientName: string
  gstin: string
  gstUsername: string
  txn: string
  sessionId: string
  stateCode: string
}

interface BulkAuthenticatedClient {
  clientId: string
  clientName: string
  gstin: string
  gstUsername: string
  otp: string
  txn: string
  sessionId: string
  message: string
}

interface BulkFailedTriggerClient {
  clientId: string
  clientName: string
  gstin: string
  gstUsername: string
  error: string
  rawError?: string
  isApiAccessDisabled?: boolean
}

interface BulkAuthenticateModalProps {
  onClose: () => void
  onSuccess: () => void
}

const TOTAL_WAIT_SECONDS = 180

export default function BulkAuthenticateModal({
  onClose,
  onSuccess,
}: BulkAuthenticateModalProps) {
  const [phase, setPhase] = useState<'initial' | 'initiating' | 'listening' | 'finished'>('initial')
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_WAIT_SECONDS)
  const [totalTriggered, setTotalTriggered] = useState(0)
  const [alreadyHealthyCount, setAlreadyHealthyCount] = useState(0)
  
  const [authenticatedList, setAuthenticatedList] = useState<BulkAuthenticatedClient[]>([])
  const [pendingList, setPendingList] = useState<BulkPendingClient[]>([])
  const [failedList, setFailedList] = useState<BulkFailedTriggerClient[]>([])
  const [activeTab, setActiveTab] = useState<'pending' | 'authenticated' | 'failed'>('pending')
  const [manualOtpClient, setManualOtpClient] = useState<BulkPendingClient | null>(null)
  const [copiedFailed, setCopiedFailed] = useState(false)
  const [copiedPending, setCopiedPending] = useState(false)

  const [triggerStatusText, setTriggerStatusText] = useState('')
  const [triggeredCount, setTriggeredCount] = useState(0)
  const [totalToTrigger, setTotalToTrigger] = useState(0)
  const [isTriggering, setIsTriggering] = useState(false)

  const isCancelledRef = useRef(false)
  const pendingRef = useRef<BulkPendingClient[]>([])
  pendingRef.current = pendingList

  // 180-second Countdown Timer
  useEffect(() => {
    if (phase !== 'listening') return

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          setPhase('finished')
          setActiveTab(pendingRef.current.length > 0 ? 'pending' : (failedList.length > 0 ? 'failed' : 'authenticated'))
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [phase, failedList.length])

  // Scanning Loop (every 3.5 seconds during listening phase)
  useEffect(() => {
    if (phase !== 'listening') return
    isCancelledRef.current = false

    async function runScanLoop() {
      while (!isCancelledRef.current && phase === 'listening') {
        const currentPending = pendingRef.current
        if (currentPending.length === 0 && !isTriggering) {
          // If no pending left and done triggering (all auto-authenticated)
          setPhase('finished')
          setActiveTab('authenticated')
          break
        }

        if (currentPending.length > 0) {
          try {
            const res = await fetch('/api/auth/bulk-authenticate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'scan',
                pendingClients: currentPending,
              }),
            })

            const data = await res.json()

            if (isCancelledRef.current) break

            if (res.ok && data.success) {
              const newlyAuth: BulkAuthenticatedClient[] = data.newlyAuthenticated || []
              const stillPend: BulkPendingClient[] = data.stillPending || []

              if (newlyAuth.length > 0) {
                setAuthenticatedList((prev) => [...prev, ...newlyAuth])
                setPendingList(stillPend)
                toast.success(`✨ Authenticated ${newlyAuth.length} client(s): ${newlyAuth.map(a => a.clientName).join(', ')}`)
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new Event('stats-updated'))
                }
                onSuccess()
              }

              if (stillPend.length === 0 && !isTriggering && (newlyAuth.length > 0 || currentPending.length > 0)) {
                setPhase('finished')
                setActiveTab('authenticated')
                break
              }
            }
          } catch {
            // Ignore transient errors
          }
        }

        if (isCancelledRef.current) break
        await new Promise((resolve) => setTimeout(resolve, 3500))
      }
    }

    runScanLoop()

    return () => {
      isCancelledRef.current = true
    }
  }, [phase, isTriggering, onSuccess])

  async function handleStartBulkAuth() {
    setPhase('initiating')
    setSecondsLeft(TOTAL_WAIT_SECONDS)
    setAuthenticatedList([])
    setPendingList([])
    setFailedList([])
    setTriggeredCount(0)
    setTotalToTrigger(0)
    setIsTriggering(true)
    isCancelledRef.current = false

    try {
      setTriggerStatusText('Checking client accounts and active sessions...')
      const targetRes = await fetch('/api/auth/bulk-authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_targets' }),
      })
      const targetData = await targetRes.json()

      if (!targetRes.ok) {
        toast.error(targetData.error || 'Failed to identify target clients')
        setPhase('initial')
        setIsTriggering(false)
        return
      }

      setAlreadyHealthyCount(targetData.alreadyAuthenticatedCount ?? 0)
      const targets = targetData.targets || []

      if (targets.length === 0) {
        toast.info('All clients already have healthy active 6-hour sessions!')
        setPhase('finished')
        setActiveTab('authenticated')
        setIsTriggering(false)
        return
      }

      setTotalToTrigger(targets.length)
      // Switch immediately to listening phase so live UI, countdown & Gmail scanning start right away!
      setPhase('listening')
      setActiveTab('pending')

      // Process in live batches of 2 clients with progress updates
      const BATCH_SIZE = 2
      let runningTriggered = 0

      for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        if (isCancelledRef.current) break
        const chunk = targets.slice(i, i + BATCH_SIZE)
        const chunkNames = chunk.map((c: any) => c.name).join(', ')

        setTriggerStatusText(`Requesting OTP for: ${chunkNames} (${i + 1} of ${targets.length})...`)

        try {
          const batchRes = await fetch('/api/auth/bulk-authenticate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'trigger_batch',
              clientIds: chunk.map((c: any) => c.id),
            }),
          })
          const batchData = await batchRes.json()

          if (batchRes.ok && batchData.success) {
            const newlyTriggered: BulkPendingClient[] = batchData.triggeredClients || []
            const newlyFailed: BulkFailedTriggerClient[] = batchData.failedTriggers || []

            if (newlyTriggered.length > 0) {
              setPendingList((prev) => [...prev, ...newlyTriggered])
              runningTriggered += newlyTriggered.length
              setTotalTriggered(runningTriggered)
            }

            if (newlyFailed.length > 0) {
              setFailedList((prev) => [...prev, ...newlyFailed])
            }
          }
        } catch (err) {
          console.error('Error triggering batch:', err)
        }

        setTriggeredCount(Math.min(i + chunk.length, targets.length))
      }

      setIsTriggering(false)
      setTriggerStatusText(`Finished requesting OTPs for all ${targets.length} clients. Scanning Gmail...`)
    } catch (error) {
      console.error('Error in bulk auth:', error)
      toast.error('Network error initiating bulk authentication')
      setPhase('initial')
      setIsTriggering(false)
    }
  }

  function handleCopyPendingList() {
    if (pendingList.length === 0) return

    const text = [
      '📱 Action Required: Please share 6-digit GST Portal OTP',
      'The OTP request has been sent for the following client accounts, but OTP email was not automatically found in Gmail. Please provide the OTP:\n',
      ...pendingList.map(
        (c, idx) => `${idx + 1}. ${c.clientName}\n   GSTIN: ${c.gstin}\n   Username: ${c.gstUsername}`
      ),
      '\n⏳ Note: GST OTP is valid for 10 minutes from request time.',
    ].join('\n')

    navigator.clipboard.writeText(text)
    setCopiedPending(true)
    toast.success('Pending clients list copied to clipboard!')
    setTimeout(() => setCopiedPending(false), 2500)
  }

  function handleCopyFailedList() {
    const text = [
      '⚠️ Action Required: Enable API Access on GST Common Portal',
      'The following clients must enable API access so notices and OTPs can be fetched automatically:\n',
      ...failedList.map((c, idx) => `${idx + 1}. ${c.clientName}\n   GSTIN: ${c.gstin}\n   Username: ${c.gstUsername}\n   Issue: ${c.error}`),
      '\n📌 How Taxpayer Can Enable API Access:',
      '1. Log in to https://services.gst.gov.in',
      '2. Go to My Profile > Manage API Access',
      '3. Set "Enable API Access" to "Yes"',
      '4. Set duration to "30 days" and click Confirm.',
    ].join('\n')

    navigator.clipboard.writeText(text)
    setCopiedFailed(true)
    toast.success('Failed clients list copied to clipboard!')
    setTimeout(() => setCopiedFailed(false), 2500)
  }

  const progressPercent = Math.round((secondsLeft / TOTAL_WAIT_SECONDS) * 100)

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && phase !== 'initiating' && phase !== 'listening' && onClose()}>
      <div className="modal-content" style={{ maxWidth: '52rem', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgb(226, 232, 240)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '0.5rem',
                background: 'rgb(245, 243, 255)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgb(124, 58, 237)',
              }}
            >
              <Zap size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>1-Click Bulk Authenticate</h2>
              <p style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)', margin: 0 }}>
                Triggers OTP for unauthenticated/pending clients, scans Gmail for 180s, & displays results
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: '0.375rem' }} disabled={phase === 'initiating' || phase === 'listening'}>
            <X size={16} />
          </button>
        </div>

        {/* Phase 1: Initial Confirmation */}
        {phase === 'initial' && (
          <div style={{ padding: '0.5rem 0' }}>
            <div
              style={{
                background: 'rgb(248, 250, 252)',
                border: '1px solid rgb(226, 232, 240)',
                borderRadius: '0.75rem',
                padding: '1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0 0 0.5rem', color: 'rgb(15, 23, 42)' }}>
                How Targeted Bulk Authentication Works:
              </h3>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'rgb(71, 85, 105)', lineHeight: 1.6 }}>
                <li>
                  <strong>Smart Filtering:</strong> Only clients with <strong>no active session</strong> or <strong>expired session</strong> will be triggered.
                </li>
                <li>
                  <strong>Healthy Sessions Preserved:</strong> Any client whose 6-hour auth token is still valid is safely skipped.
                </li>
                <li>
                  <strong>180-Second Gmail Auto-Scan:</strong> GST emails matching each client&apos;s GSTIN will be read directly from Gmail and verified automatically.
                </li>
                <li>
                  <strong>Immediate Feedback:</strong> Any client with disabled API access on the GST portal will be flagged with exact error reasons.
                </li>
              </ul>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleStartBulkAuth}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgb(124, 58, 237)', borderColor: 'rgb(124, 58, 237)' }}
              >
                <Zap size={16} /> Start 180s Bulk Authentication
              </button>
            </div>
          </div>
        )}

        {/* Phase 2: Sending OTP Requests */}
        {phase === 'initiating' && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <Loader2 size={36} className="animate-spin" style={{ margin: '0 auto 1rem', color: 'rgb(124, 58, 237)' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
              Preparing Bulk Authentication...
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'rgb(100, 116, 139)', margin: 0 }}>
              {triggerStatusText || 'Identifying unauthenticated accounts and checking active sessions...'}
            </p>
          </div>
        )}

        {/* Phase 3 & 4: Listening / Finished */}
        {(phase === 'listening' || phase === 'finished') && (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            {/* Status bar */}
            <div
              style={{
                background: phase === 'listening' ? 'rgb(245, 243, 255)' : 'rgb(248, 250, 252)',
                border: `1px solid ${phase === 'listening' ? 'rgb(221, 214, 254)' : 'rgb(226, 232, 240)'}`,
                borderRadius: '0.5rem',
                padding: '0.875rem 1rem',
                marginBottom: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: phase === 'listening' ? '0.5rem' : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {phase === 'listening' ? (
                    <>
                      <Loader2 size={16} className="animate-spin" style={{ color: 'rgb(124, 58, 237)' }} />
                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'rgb(109, 40, 217)' }}>
                        Scanning Gmail in background...
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} style={{ color: 'rgb(22, 163, 74)' }} />
                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'rgb(22, 163, 74)' }}>
                        180-Second Cycle Completed
                      </span>
                    </>
                  )}
                </div>

                {phase === 'listening' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: 'rgb(109, 40, 217)' }}>
                    <Clock size={15} />
                    <span>{secondsLeft}s remaining</span>
                  </div>
                )}
              </div>

              {phase === 'listening' && (
                <div style={{ width: '100%', height: '6px', background: 'rgb(233, 213, 255)', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      background: 'rgb(124, 58, 237)',
                      width: `${progressPercent}%`,
                      transition: 'width 1s linear',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Live OTP Dispatch Progress */}
            {isTriggering && (
              <div
                style={{
                  background: 'rgb(245, 243, 255)',
                  border: '1px solid rgb(221, 214, 254)',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1rem',
                  marginBottom: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: 'rgb(109, 40, 217)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Loader2 size={14} className="animate-spin" />
                    <span>{triggerStatusText}</span>
                  </div>
                  <span>{triggeredCount} / {totalToTrigger}</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'rgb(233, 213, 255)', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      background: 'rgb(124, 58, 237)',
                      width: `${Math.round((triggeredCount / (totalToTrigger || 1)) * 100)}%`,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Alert banner if clients failed to trigger */}
            {failedList.length > 0 && (
              <div
                style={{
                  background: 'rgb(254, 242, 242)',
                  border: '1px solid rgb(254, 202, 202)',
                  borderRadius: '0.5rem',
                  padding: '0.625rem 0.875rem',
                  marginBottom: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.8rem',
                  color: 'rgb(185, 28, 28)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>
                    <strong>{failedList.length} client(s) failed OTP request</strong>: API Access is disabled on their GST Common Portal profile (Error AUTH002).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('failed')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgb(185, 28, 28)',
                    textDecoration: 'underline',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                  }}
                >
                  View details &rarr;
                </button>
              </div>
            )}

            {/* Stats Summary Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${failedList.length > 0 ? 4 : 3}, 1fr)`, gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ background: 'rgb(248, 250, 252)', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.5rem', padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)' }}>Triggered for OTP</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'rgb(15, 23, 42)' }}>{totalTriggered}</div>
                {alreadyHealthyCount > 0 && (
                  <div style={{ fontSize: '0.65rem', color: 'rgb(100, 116, 139)' }}>({alreadyHealthyCount} already healthy)</div>
                )}
              </div>

              <div
                onClick={() => setActiveTab('authenticated')}
                style={{
                  background: activeTab === 'authenticated' ? 'rgb(236, 253, 245)' : 'rgb(248, 250, 252)',
                  border: `1px solid ${activeTab === 'authenticated' ? 'rgb(167, 243, 208)' : 'rgb(226, 232, 240)'}`,
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'rgb(5, 150, 105)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                  <CheckCircle2 size={12} /> Authenticated
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'rgb(5, 150, 105)' }}>{authenticatedList.length}</div>
              </div>

              <div
                onClick={() => setActiveTab('pending')}
                style={{
                  background: activeTab === 'pending' ? 'rgb(254, 243, 199)' : 'rgb(248, 250, 252)',
                  border: `1px solid ${activeTab === 'pending' ? 'rgb(253, 230, 138)' : 'rgb(226, 232, 240)'}`,
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'rgb(180, 83, 9)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                  <Clock size={12} /> OTP Pending
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'rgb(180, 83, 9)' }}>{pendingList.length}</div>
              </div>

              {failedList.length > 0 && (
                <div
                  onClick={() => setActiveTab('failed')}
                  style={{
                    background: activeTab === 'failed' ? 'rgb(254, 242, 242)' : 'rgb(248, 250, 252)',
                    border: `1px solid ${activeTab === 'failed' ? 'rgb(254, 202, 202)' : 'rgb(226, 232, 240)'}`,
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: 'rgb(185, 28, 28)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                    <AlertTriangle size={12} /> Failed Trigger
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'rgb(185, 28, 28)' }}>{failedList.length}</div>
                </div>
              )}
            </div>

            {/* Tab navigation */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgb(226, 232, 240)', marginBottom: '0.75rem', overflowX: 'auto', WebkitOverflowScrolling: 'touch', whiteSpace: 'nowrap' }}>
              <button
                type="button"
                onClick={() => setActiveTab('pending')}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  border: 'none',
                  background: 'none',
                  borderBottom: activeTab === 'pending' ? '2px solid rgb(180, 83, 9)' : 'none',
                  color: activeTab === 'pending' ? 'rgb(180, 83, 9)' : 'rgb(100, 116, 139)',
                  cursor: 'pointer',
                }}
              >
                OTP Pending ({pendingList.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('authenticated')}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  border: 'none',
                  background: 'none',
                  borderBottom: activeTab === 'authenticated' ? '2px solid rgb(5, 150, 105)' : 'none',
                  color: activeTab === 'authenticated' ? 'rgb(5, 150, 105)' : 'rgb(100, 116, 139)',
                  cursor: 'pointer',
                }}
              >
                Authenticated via Gmail ({authenticatedList.length})
              </button>
              {failedList.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('failed')}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    border: 'none',
                    background: 'none',
                    borderBottom: activeTab === 'failed' ? '2px solid rgb(220, 38, 38)' : 'none',
                    color: activeTab === 'failed' ? 'rgb(220, 38, 38)' : 'rgb(100, 116, 139)',
                    cursor: 'pointer',
                  }}
                >
                  ⚠️ Failed to Trigger ({failedList.length})
                </button>
              )}
            </div>

            {/* List View */}
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.5rem', maxHeight: '280px' }}>
              {activeTab === 'pending' && (
                <div style={{ padding: pendingList.length > 0 ? '0.75rem' : 0 }}>
                  {pendingList.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'rgb(100, 116, 139)', fontSize: '0.85rem' }}>
                      🎉 Zero pending clients! All triggered clients were authenticated via Gmail.
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '0.75rem',
                          padding: '0.5rem 0.75rem',
                          background: 'rgb(254, 243, 199)',
                          borderRadius: '0.375rem',
                          border: '1px solid rgb(253, 230, 138)',
                          gap: '0.5rem',
                        }}
                      >
                        <div style={{ fontSize: '0.75rem', color: 'rgb(146, 64, 14)' }}>
                          <strong>OTP not received in Gmail:</strong> OTP was triggered, but no matching email arrived in CA Gmail. Copy list to request OTPs or enter manually.
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={handleCopyPendingList}
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.3rem 0.6rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            flexShrink: 0,
                            background: 'white',
                            borderColor: 'rgb(253, 230, 138)',
                            color: 'rgb(146, 64, 14)',
                            fontWeight: 600,
                          }}
                        >
                          {copiedPending ? <Check size={12} color="rgb(22, 163, 74)" /> : <Copy size={12} />}
                          {copiedPending ? 'Copied List!' : 'Copy Pending Clients'}
                        </button>
                      </div>

                      <table style={{ margin: 0, fontSize: '0.8rem' }}>
                        <thead>
                          <tr>
                            <th>Client Name</th>
                            <th>GSTIN / Username</th>
                            <th>Status</th>
                            <th style={{ width: 140 }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingList.map((client) => (
                            <tr key={client.clientId}>
                              <td style={{ fontWeight: 600, color: 'rgb(15, 23, 42)' }}>{client.clientName}</td>
                              <td>
                                <div><code style={{ fontSize: '0.75rem' }}>{client.gstin}</code></div>
                                <div style={{ fontSize: '0.7rem', color: 'rgb(100, 116, 139)' }}>User: {client.gstUsername}</div>
                              </td>
                              <td>
                                <span className="badge badge-pending" style={{ fontSize: '0.7rem' }}>
                                  OTP Pending
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                  <button
                                    className="btn btn-primary"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                    onClick={() => setManualOtpClient(client)}
                                  >
                                    <KeyRound size={12} /> Enter OTP
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ padding: '0.25rem 0.4rem' }}
                                    title="Copy client info"
                                    onClick={() => {
                                      navigator.clipboard.writeText(
                                        `Client: ${client.clientName}\nGSTIN: ${client.gstin}\nUsername: ${client.gstUsername}`
                                      )
                                      toast.success(`Copied ${client.clientName} details`)
                                    }}
                                  >
                                    <Copy size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'authenticated' && (
                <div>
                  {authenticatedList.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'rgb(100, 116, 139)', fontSize: '0.85rem' }}>
                      No clients were auto-authenticated in this cycle yet.
                    </div>
                  ) : (
                    <table style={{ margin: 0, fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th>Client Name</th>
                          <th>GSTIN</th>
                          <th>Matched OTP</th>
                          <th>Session</th>
                        </tr>
                      </thead>
                      <tbody>
                        {authenticatedList.map((client) => (
                          <tr key={client.clientId}>
                            <td style={{ fontWeight: 500 }}>{client.clientName}</td>
                            <td>
                              <code style={{ fontSize: '0.75rem' }}>{client.gstin}</code>
                            </td>
                            <td>
                              <code style={{ fontSize: '0.75rem', background: 'rgb(236, 253, 245)', color: 'rgb(5, 150, 105)' }}>
                                {client.otp || 'Verified'}
                              </code>
                            </td>
                            <td>
                              <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                                6 Hours Active
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === 'failed' && (
                <div style={{ padding: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgb(248, 250, 252)', borderRadius: '0.375rem', border: '1px solid rgb(226, 232, 240)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'rgb(71, 85, 105)' }}>
                      <strong>Why did this happen?</strong> These taxpayers have <strong>disabled API access</strong> on the GST Portal or the 30-day API validity expired.
                    </div>
                    <button
                      className="btn btn-secondary"
                      onClick={handleCopyFailedList}
                      style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}
                    >
                      {copiedFailed ? <Check size={12} color="rgb(22, 163, 74)" /> : <Copy size={12} />}
                      {copiedFailed ? 'Copied!' : 'Copy Client List'}
                    </button>
                  </div>

                  <table style={{ margin: 0, fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th>Client Name</th>
                        <th>GSTIN / Username</th>
                        <th>Reason for Failure</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failedList.map((client) => (
                        <tr key={client.clientId}>
                          <td style={{ fontWeight: 600, color: 'rgb(15, 23, 42)' }}>{client.clientName}</td>
                          <td>
                            <div><code style={{ fontSize: '0.75rem' }}>{client.gstin}</code></div>
                            <div style={{ fontSize: '0.7rem', color: 'rgb(100, 116, 139)' }}>User: {client.gstUsername}</div>
                          </td>
                          <td>
                            <div style={{ color: 'rgb(185, 28, 28)', fontWeight: 500, fontSize: '0.75rem' }}>
                              {client.error}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid rgb(226, 232, 240)' }}>
              <button className="btn btn-secondary" onClick={handleStartBulkAuth}>
                <RotateCcw size={14} /> Re-Run Bulk Auth (180s)
              </button>
              <button className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}

        {/* Child Manual OTP Modal for Pending Clients */}
        {manualOtpClient && (
          <OTPModal
            clientId={manualOtpClient.clientId}
            clientName={manualOtpClient.clientName}
            gstin={manualOtpClient.gstin}
            gstUsername={manualOtpClient.gstUsername}
            txn={manualOtpClient.txn || ''}
            sessionId={manualOtpClient.sessionId}
            onSuccess={() => {
              // Move from pending to authenticated
              setAuthenticatedList((prev) => [
                ...prev,
                {
                  clientId: manualOtpClient.clientId,
                  clientName: manualOtpClient.clientName,
                  gstin: manualOtpClient.gstin,
                  gstUsername: manualOtpClient.gstUsername,
                  otp: 'Manual',
                  txn: manualOtpClient.txn,
                  sessionId: manualOtpClient.sessionId,
                  message: 'Authenticated manually',
                },
              ])
              setPendingList((prev) => prev.filter((p) => p.clientId !== manualOtpClient.clientId))
              setManualOtpClient(null)
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('stats-updated'))
              }
              onSuccess()
            }}
            onClose={() => setManualOtpClient(null)}
          />
        )}
      </div>
    </div>
  )
}
