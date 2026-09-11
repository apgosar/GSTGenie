'use client'
import { useState } from 'react'
import { formatDistanceToNow, isAfter } from 'date-fns'
import {
  MoreVertical, RefreshCw, Trash2, Shield, Bell, Loader2,
  AlertTriangle, Clock, Bug, ExternalLink
} from 'lucide-react'
import Link from 'next/link'
import StatusBadge from './StatusBadge'
import OTPModal from './OTPModal'
import DebugNoticeModal from './DebugNoticeModal'
import { toast } from 'sonner'

interface Session {
  id: string
  txn: string
  ipAddress: string
  lastRefreshedAt: string
  expiresAt: string
  authError?: string
  isActive: boolean
}

interface ClientCardProps {
  id: string
  name: string
  gstin: string
  gstUsername: string
  email: string
  stateCode: string
  status: string
  newNoticeCount: number
  totalNotices: number
  activeSession?: Session
  onRefresh: () => void
}

export default function ClientCard({
  id,
  name,
  gstin,
  gstUsername,
  email,
  stateCode,
  status,
  newNoticeCount,
  totalNotices,
  activeSession,
  onRefresh,
}: ClientCardProps) {
  const [otpModal, setOtpModal] = useState<{ txn: string; sessionId?: string } | null>(null)
  const [debugModal, setDebugModal] = useState<boolean>(false)
  const [lastDebugInfo, setLastDebugInfo] = useState<any>(null)
  const [loadingOTP, setLoadingOTP] = useState(false)
  const [loadingFetch, setLoadingFetch] = useState(false)
  const [loadingRefresh, setLoadingRefresh] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const isAuthError = status === 'error' || status === 'expired'
  const isAuthenticated = status === 'authenticated' && activeSession?.isActive

  const tokenExpiry = activeSession?.expiresAt ? new Date(activeSession.expiresAt) : null
  const isExpiringSoon = tokenExpiry && isAfter(tokenExpiry, new Date()) &&
    !isAfter(tokenExpiry, new Date(Date.now() + 60 * 60 * 1000))

  async function handleRequestOTP() {
    setLoadingOTP(true)
    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to send OTP')
        return
      }
      setOtpModal({ txn: data.txn, sessionId: data.sessionId })
    } catch {
      toast.error('Network error')
    } finally {
      setLoadingOTP(false)
    }
  }

  async function handleFetchNotices() {
    setLoadingFetch(true)
    try {
      const res = await fetch('/api/notices/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: id }),
      })
      const data = await res.json()

      if (data.debug) {
        setLastDebugInfo(data.debug)
      }

      if (!res.ok) {
        toast.error(data.error || 'Failed to fetch notices')
        return
      }

      toast.success(`Fetched ${data.total} notices${data.newNotices > 0 ? ` (${data.newNotices} new!)` : ''}`)
      onRefresh()
    } catch {
      toast.error('Network error')
    } finally {
      setLoadingFetch(false)
    }
  }

  async function handleRefreshToken() {
    setLoadingRefresh(true)
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Token refresh failed')
        return
      }
      toast.success('Token refreshed successfully')
      onRefresh()
    } catch {
      toast.error('Network error')
    } finally {
      setLoadingRefresh(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete client "${name}"? This will remove all notices and sessions.`)) return
    const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success(`${name} deleted`)
      onRefresh()
    } else {
      toast.error('Failed to delete client')
    }
    setShowMenu(false)
  }

  return (
    <>
      <div
        className="card"
        style={{
          borderLeft: isAuthError ? '4px solid rgb(220, 38, 38)' : newNoticeCount > 0 ? '4px solid rgb(37, 99, 235)' : undefined,
          position: 'relative',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <Link href={`/clients/${id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  {name} <ExternalLink size={12} style={{ opacity: 0.5 }} />
                </h3>
              </Link>
              {newNoticeCount > 0 && (
                <span className="badge badge-info badge-new" style={{ fontSize: '0.65rem' }}>
                  {newNoticeCount} NEW
                </span>
              )}
            </div>
            <code style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)', background: 'rgb(248, 250, 252)', padding: '0.1rem 0.4rem', borderRadius: '0.25rem' }}>
              {gstin}
            </code>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <StatusBadge status={status} size="sm" />
            <div style={{ position: 'relative' }}>
              <button className="btn btn-secondary" style={{ padding: '0.375rem' }} onClick={() => setShowMenu(!showMenu)}>
                <MoreVertical size={14} />
              </button>
              {showMenu && (
                <div style={{
                  position: 'absolute', right: 0, top: '100%', marginTop: '0.25rem',
                  background: 'white', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.5rem',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, minWidth: 160, padding: '0.25rem',
                }}>
                  <button
                    className="btn"
                    style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem 0.75rem', gap: '0.5rem', fontSize: '0.8rem', color: 'rgb(180, 83, 9)' }}
                    onClick={() => { setShowMenu(false); setDebugModal(true) }}
                  >
                    <Bug size={14} /> Inspect API Response
                  </button>
                  <Link
                    href={`/clients/${id}`}
                    className="btn"
                    style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem 0.75rem', gap: '0.5rem', fontSize: '0.8rem', textDecoration: 'none', color: 'inherit' }}
                    onClick={() => setShowMenu(false)}
                  >
                    <ExternalLink size={14} /> View Details
                  </Link>
                  <button
                    className="btn"
                    style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem 0.75rem', color: 'rgb(220, 38, 38)', gap: '0.5rem', fontSize: '0.8rem' }}
                    onClick={handleDelete}
                  >
                    <Trash2 size={14} /> Delete Client
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Auth error banner */}
        {activeSession?.authError && (
          <div style={{ background: 'rgb(254, 226, 226)', border: '1px solid rgb(252, 165, 165)', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', marginBottom: '0.75rem', fontSize: '0.75rem', color: 'rgb(185, 28, 28)', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            {activeSession.authError}
          </div>
        )}

        {/* Token info */}
        {activeSession && (
          <div style={{ background: 'rgb(248, 250, 252)', borderRadius: '0.5rem', padding: '0.625rem 0.75rem', marginBottom: '0.875rem', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgb(71, 85, 105)' }}>
              <span style={{ color: 'rgb(100, 116, 139)' }}>Last refreshed:</span>
              <span>{formatDistanceToNow(new Date(activeSession.lastRefreshedAt), { addSuffix: true })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgb(100, 116, 139)' }}>Expires:</span>
              <span style={{ color: isExpiringSoon ? 'rgb(220, 38, 38)' : 'rgb(71, 85, 105)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {isExpiringSoon && <Clock size={11} />}
                {tokenExpiry && isAfter(tokenExpiry, new Date())
                  ? formatDistanceToNow(tokenExpiry, { addSuffix: true })
                  : 'Expired'}
              </span>
            </div>
          </div>
        )}

        {/* Notice count */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', fontSize: '0.8rem', color: 'rgb(100, 116, 139)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Bell size={13} /> {totalNotices} total notices
          </span>
          <span style={{ color: 'rgb(37, 99, 235)', fontWeight: 500 }}>
            {gstUsername} · State {stateCode}
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {!isAuthenticated ? (
            <button className="btn btn-primary" onClick={handleRequestOTP} disabled={loadingOTP} style={{ flex: 1, justifyContent: 'center', minWidth: 140 }}>
              {loadingOTP ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
              {loadingOTP ? 'Sending OTP...' : isAuthError ? 'Re-authenticate' : 'Authenticate'}
            </button>
          ) : (
            <>
              <button className="btn btn-primary" onClick={handleFetchNotices} disabled={loadingFetch} style={{ flex: 1, justifyContent: 'center' }}>
                {loadingFetch ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
                {loadingFetch ? 'Fetching...' : 'Fetch Notices'}
              </button>
              <button className="btn btn-secondary" onClick={handleRefreshToken} disabled={loadingRefresh} title="Refresh token">
                {loadingRefresh ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setDebugModal(true)}
                title="Inspect API response / Debug"
                style={{ color: 'rgb(180, 83, 9)', background: 'rgb(254, 243, 199)', border: '1px solid rgb(253, 230, 138)' }}
              >
                <Bug size={14} />
              </button>
              <button className="btn btn-secondary" onClick={handleRequestOTP} disabled={loadingOTP} title="Re-authenticate">
                {loadingOTP ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
              </button>
            </>
          )}
        </div>
      </div>

      {otpModal && (
        <OTPModal
          clientId={id}
          clientName={name}
          gstin={gstin}
          gstUsername={gstUsername}
          txn={otpModal.txn}
          sessionId={otpModal.sessionId}
          onSuccess={() => {
            setOtpModal(null)
            onRefresh()
          }}
          onClose={() => setOtpModal(null)}
        />
      )}

      {debugModal && (
        <DebugNoticeModal
          clientId={id}
          clientName={name}
          gstin={gstin}
          gstUsername={gstUsername}
          initialDebug={lastDebugInfo}
          onClose={() => setDebugModal(false)}
          onRefresh={onRefresh}
        />
      )}
    </>
  )
}
