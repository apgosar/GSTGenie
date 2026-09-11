'use client'
import React, { useState, useEffect, useRef } from 'react'
import { X, KeyRound, Loader2, Sparkles, AlertCircle, CheckCircle2, RotateCcw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

interface OTPModalProps {
  clientId: string
  clientName: string
  gstin?: string
  gstUsername: string
  sessionId?: string
  txn: string
  onSuccess: () => void
  onClose: () => void
}

const TOTAL_WAIT_SECONDS = 180

export default function OTPModal({
  clientId,
  clientName,
  gstin,
  gstUsername,
  sessionId,
  txn,
  onSuccess,
  onClose,
}: OTPModalProps) {
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_WAIT_SECONDS)
  const [pollState, setPollState] = useState<'listening' | 'success' | 'timed_out' | 'error'>('listening')
  const [detectedOtp, setDetectedOtp] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  
  const isCancelledRef = useRef(false)
  const otpInputRef = useRef<HTMLInputElement>(null)

  // Countdown timer effect
  useEffect(() => {
    if (pollState !== 'listening') return

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          setPollState('timed_out')
          // Auto-focus manual input when 180s timer expires
          setTimeout(() => {
            otpInputRef.current?.focus()
          }, 100)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [pollState])

  // Background Gmail Poller with GSTIN targeting
  useEffect(() => {
    isCancelledRef.current = false

    async function runPoller() {
      while (!isCancelledRef.current && pollState === 'listening') {
        try {
          const res = await fetch('/api/auth/fetch-gmail-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientId,
              gstin,
              gstUsername,
              txn,
              sessionId,
              autoVerify: true,
              timeoutSeconds: 4,
            }),
          })

          const data = await res.json()

          if (isCancelledRef.current) break

          if (res.ok && data.success && data.otp) {
            setDetectedOtp(data.otp)
            setOtp(data.otp)
            setPollState('success')

            if (data.autoVerified) {
              toast.success(`✨ Matched OTP for ${gstin || clientName} and verified successfully!`)
              setTimeout(() => {
                onSuccess()
              }, 1200)
            } else {
              // Submit manually with the detected OTP
              await handleManualVerify(data.otp)
            }
            break
          }
        } catch {
          // Continue polling on transient network hiccup
        }

        if (isCancelledRef.current) break

        // Small interval between poll requests
        await new Promise((resolve) => setTimeout(resolve, 2500))
      }
    }

    if (pollState === 'listening') {
      runPoller()
    }

    return () => {
      isCancelledRef.current = true
    }
  }, [pollState, clientId, gstin, gstUsername, txn, sessionId])

  async function handleManualVerify(otpToVerify?: string, e?: React.FormEvent) {
    if (e) e.preventDefault()
    const code = otpToVerify || otp

    if (code.length < 4) {
      setErrorMessage('Please enter a valid 6-digit OTP')
      return
    }

    setLoading(true)
    setErrorMessage('')

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, otp: code, sessionId, txn }),
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMessage(data.error || 'OTP verification failed. Please check the code.')
        return
      }

      toast.success('Authentication successful! Session active for 6 hours.')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('stats-updated'))
      }
      onSuccess()
    } catch {
      setErrorMessage('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleRestartAutoFetch() {
    setSecondsLeft(TOTAL_WAIT_SECONDS)
    setPollState('listening')
    setErrorMessage('')
    isCancelledRef.current = false
  }

  const progressPercent = Math.round((secondsLeft / TOTAL_WAIT_SECONDS) * 100)

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: '30rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '0.5rem',
                background: 'rgb(239, 246, 255)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgb(37, 99, 235)',
              }}
            >
              <KeyRound size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'rgb(15, 23, 42)', margin: 0 }}>
                GST Authentication
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)', margin: 0 }}>
                {clientName} {gstin ? `· ${gstin}` : ''} · User: <strong>{gstUsername}</strong>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: '0.375rem' }}>
            <X size={16} />
          </button>
        </div>

        {/* State 1: Active Listening (0 - 180s) */}
        {pollState === 'listening' && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgb(245, 243, 255) 0%, rgb(239, 246, 255) 100%)',
              border: '1px solid rgb(199, 210, 254)',
              borderRadius: '0.75rem',
              padding: '1rem 1.25rem',
              marginBottom: '1.25rem',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: 'rgb(67, 56, 202)' }}>
                <Sparkles size={16} className="animate-spin" color="rgb(99, 102, 241)" />
                Auto-reading OTP from Gmail...
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgb(79, 70, 229)', fontFamily: 'monospace' }}>
                {secondsLeft}s remaining
              </span>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'rgb(79, 70, 229)', margin: '0 0 0.75rem 0' }}>
              Listening for official GST email containing <strong>{gstin || gstUsername}</strong>. It will auto-verify only when matching this client.
            </p>

            {/* Live Progress Bar */}
            <div style={{ height: 4, background: 'rgb(224, 231, 255)', borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  background: 'linear-gradient(90deg, rgb(99, 102, 241) 0%, rgb(59, 130, 246) 100%)',
                  transition: 'width 1s linear',
                }}
              />
            </div>
          </div>
        )}

        {/* State 2: Success */}
        {pollState === 'success' && (
          <div
            style={{
              background: 'rgb(236, 253, 245)',
              border: '1px solid rgb(167, 243, 208)',
              borderRadius: '0.75rem',
              padding: '1rem 1.25rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              color: 'rgb(6, 95, 70)',
            }}
          >
            <ShieldCheck size={28} color="rgb(5, 150, 105)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                Matched OTP: <code style={{ fontSize: '1rem', background: 'white', padding: '0.1rem 0.4rem', borderRadius: 4 }}>{detectedOtp}</code>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'rgb(4, 120, 87)', marginTop: '0.2rem' }}>
                Verified for GSTIN {gstin}! Session active for 6 hours.
              </div>
            </div>
          </div>
        )}

        {/* State 3: Timed Out after 180s */}
        {pollState === 'timed_out' && (
          <div
            style={{
              background: 'rgb(254, 243, 199)',
              border: '1px solid rgb(253, 230, 138)',
              borderRadius: '0.75rem',
              padding: '0.875rem 1rem',
              marginBottom: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'rgb(146, 64, 14)', fontWeight: 600, fontSize: '0.85rem' }}>
              <AlertCircle size={16} /> OTP for {gstin || clientName} not received after 180s
            </div>
            <p style={{ fontSize: '0.75rem', color: 'rgb(180, 83, 9)', margin: '0.25rem 0 0.5rem 0' }}>
              GST may have sent the OTP via SMS or experienced a delivery delay. Please enter the OTP manually below.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleRestartAutoFetch}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <RotateCcw size={12} /> Retry Gmail Listener (180s)
            </button>
          </div>
        )}

        {/* Manual OTP Form */}
        <form onSubmit={(e) => handleManualVerify(undefined, e)}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label htmlFor="manual-otp" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>6-Digit OTP</span>
              {pollState === 'listening' && (
                <span style={{ fontSize: '0.7rem', color: 'rgb(100, 116, 139)' }}>
                  (or type manually anytime)
                </span>
              )}
            </label>
            <input
              ref={otpInputRef}
              id="manual-otp"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 123456"
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                setErrorMessage('')
              }}
              style={{
                fontSize: '1.35rem',
                textAlign: 'center',
                letterSpacing: '0.35em',
                fontWeight: 700,
              }}
            />
          </div>

          {errorMessage && (
            <div
              style={{
                background: 'rgb(254, 226, 226)',
                color: 'rgb(185, 28, 28)',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.5rem',
                fontSize: '0.8rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <AlertCircle size={14} /> {errorMessage}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || otp.length < 4}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Verifying...' : 'Verify OTP Manually'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
