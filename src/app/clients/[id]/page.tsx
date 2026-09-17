'use client'
import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Bell, RefreshCw, Shield, AlertTriangle, Loader2, Clock, CheckCircle, Bug, Eye } from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'
import NoticeTable from '@/components/NoticeTable'
import OTPModal from '@/components/OTPModal'
import DebugNoticeModal from '@/components/DebugNoticeModal'
import { toast } from 'sonner'
import { formatDistanceToNow, format, isAfter } from 'date-fns'
import { getStateNameByCode } from '@/lib/utils'

interface Session {
  id: string
  txn: string
  ipAddress: string
  lastRefreshedAt: string
  expiresAt: string
  authError?: string
  isActive: boolean
  createdAt: string
}

interface Notice {
  id: string
  clientId: string
  refId: string
  noticeType?: string
  section?: string
  taxPeriod?: string
  dueDate?: string
  issuedDate?: string
  description?: string
  status?: string
  isNew: boolean
  createdAt: string
  rawData: string
  client?: { id: string; name: string; gstin: string }
}

interface FetchLog {
  id: string
  fetchedAt: string
  noticesFound: number
  newNotices: number
  status: string
  errorMessage?: string
  rawResponse?: string
  logType: string
}

interface ClientDetail {
  id: string
  name: string
  gstin: string
  gstUsername: string
  email: string
  phone?: string
  stateCode: string
  status: string
  createdAt: string
  sessions: Session[]
  notices: Notice[]
  fetchLogs: FetchLog[]
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [client, setClient] = useState<ClientDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [requestingOTP, setRequestingOTP] = useState(false)
  const [otpModal, setOtpModal] = useState<{ txn: string; sessionId?: string } | null>(null)
  const [debugModal, setDebugModal] = useState(false)
  const [selectedRawResponse, setSelectedRawResponse] = useState<string | null>(null)

  const loadClient = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${id}`)
      if (!res.ok) {
        toast.error('Client not found')
        return
      }
      const data = await res.json()
      setClient(data)
    } catch {
      toast.error('Failed to load client details')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadClient()
  }, [loadClient])

  async function handleRequestOTP() {
    setRequestingOTP(true)
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
      setRequestingOTP(false)
    }
  }

  async function handleFetchNotices() {
    setFetching(true)
    try {
      const res = await fetch('/api/notices/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to fetch notices')
        return
      }
      toast.success(`Fetched ${data.total} notices${data.newNotices > 0 ? ` (${data.newNotices} new!)` : ''}`)
      loadClient()
    } catch {
      toast.error('Network error')
    } finally {
      setFetching(false)
    }
  }

  async function handleRefreshToken() {
    setRefreshing(true)
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
      toast.success('Token extended successfully')
      loadClient()
    } catch {
      toast.error('Network error')
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '0.75rem', color: 'rgb(100, 116, 139)' }}>
        <Loader2 size={24} className="animate-spin" /> Loading client details...
      </div>
    )
  }

  if (!client) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Client not found</h2>
        <Link href="/clients" className="btn btn-primary" style={{ marginTop: '1rem' }}>
          Back to Clients
        </Link>
      </div>
    )
  }

  const activeSession = client.sessions.find((s) => s.isActive)
  const tokenExpiry = activeSession?.expiresAt ? new Date(activeSession.expiresAt) : null
  const isExpiringSoon = tokenExpiry && isAfter(tokenExpiry, new Date()) && !isAfter(tokenExpiry, new Date(Date.now() + 60 * 60 * 1000))
  const newNoticesCount = client.notices.filter((n) => n.isNew).length
  const latestFetchLogWithRaw = client.fetchLogs.find((l) => l.rawResponse)

  return (
    <div className="page-container">
      {/* Back button */}
      <Link href="/clients" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'rgb(100, 116, 139)', textDecoration: 'none', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        <ArrowLeft size={16} /> Back to Clients
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>{client.name}</h1>
            <StatusBadge status={client.status} />
            {newNoticesCount > 0 && (
              <span className="badge badge-info badge-new">
                {newNoticesCount} NEW NOTICE{newNoticesCount > 1 ? 'S' : ''}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '1rem', color: 'rgb(100, 116, 139)', fontSize: '0.875rem', flexWrap: 'wrap' }}>
            <span>GSTIN: <strong style={{ fontFamily: 'monospace', color: 'rgb(15, 23, 42)' }}>{client.gstin}</strong></span>
            <span>Username: <strong style={{ color: 'rgb(15, 23, 42)' }}>{client.gstUsername}</strong></span>
            <span>State: <strong style={{ color: 'rgb(15, 23, 42)' }}>{client.stateCode} ({getStateNameByCode(client.stateCode)})</strong></span>
            <span>Email: <strong style={{ color: 'rgb(15, 23, 42)' }}>{client.email}</strong></span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleFetchNotices} disabled={fetching || client.status !== 'authenticated'}>
            {fetching ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
            {fetching ? 'Fetching...' : 'Fetch Notices'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setSelectedRawResponse(latestFetchLogWithRaw?.rawResponse || null)
              setDebugModal(true)
            }}
            title="Inspect API Response / Debug Mode"
            style={{ color: 'rgb(180, 83, 9)', background: 'rgb(254, 243, 199)', border: '1px solid rgb(253, 230, 138)' }}
          >
            <Bug size={16} /> Debug / Inspect API
          </button>
          <button className="btn btn-secondary" onClick={handleRefreshToken} disabled={refreshing || !activeSession} title="Extend Token (Refresh)">
            {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {refreshing ? 'Extending...' : 'Extend Token'}
          </button>
          <button className="btn btn-secondary" onClick={handleRequestOTP} disabled={requestingOTP}>
            {requestingOTP ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
            {requestingOTP ? 'Sending OTP...' : 'Re-authenticate'}
          </button>
        </div>
      </div>

      {/* Auth Status Panel */}
      <div className="card" style={{ marginBottom: '2rem', borderLeft: client.status === 'error' || client.status === 'expired' ? '4px solid rgb(220, 38, 38)' : '4px solid rgb(37, 99, 235)' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Shield size={18} color="rgb(37, 99, 235)" /> Authentication & Token Status
        </h2>

        {activeSession?.authError && (
          <div style={{ background: 'rgb(254, 226, 226)', border: '1px solid rgb(252, 165, 165)', borderRadius: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1rem', color: 'rgb(185, 28, 28)', fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <AlertTriangle size={16} />
            <span><strong>Authentication Issue:</strong> {activeSession.authError}</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Status</div>
            <div style={{ marginTop: '0.25rem' }}><StatusBadge status={client.status} /></div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Token Refreshed</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 500, marginTop: '0.25rem' }}>
              {activeSession ? `${format(new Date(activeSession.lastRefreshedAt), 'dd MMM yyyy, hh:mm a')} (${formatDistanceToNow(new Date(activeSession.lastRefreshedAt), { addSuffix: true })})` : 'Never'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Token Expiration (6h window)</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 500, marginTop: '0.25rem', color: isExpiringSoon ? 'rgb(220, 38, 38)' : 'inherit', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              {isExpiringSoon && <Clock size={14} color="rgb(220, 38, 38)" />}
              {tokenExpiry && isAfter(tokenExpiry, new Date())
                ? `Expires in ${formatDistanceToNow(tokenExpiry)}`
                : activeSession ? 'Expired' : 'No active token'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Auto-Extension</div>
            <div style={{ fontSize: '0.85rem', color: 'rgb(22, 163, 74)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <CheckCircle size={14} /> Background job active (every 5h 45m)
            </div>
          </div>
        </div>
      </div>

      {/* Notices Section */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '2rem' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgb(241, 245, 249)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Notices for {client.name}</h2>
            <p style={{ fontSize: '0.8rem', color: 'rgb(100, 116, 139)', margin: '0.25rem 0 0' }}>
              {client.notices.length} total notice{client.notices.length !== 1 ? 's' : ''} on record
            </p>
          </div>
          <button className="btn btn-secondary" onClick={loadClient} style={{ padding: '0.375rem 0.625rem' }}>
            <RefreshCw size={14} />
          </button>
        </div>
        <NoticeTable notices={client.notices} showClient={false} onUpdate={loadClient} />
      </div>

      {/* Activity / Fetch Logs */}
      {client.fetchLogs.length > 0 && (
        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Fetch & Token History</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {client.fetchLogs.map((log) => (
              <div
                key={log.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.625rem 0.75rem',
                  background: 'rgb(248, 250, 252)',
                  borderRadius: '0.5rem',
                  fontSize: '0.8rem',
                }}
              >
                <div>
                  <span style={{ fontWeight: 500 }}>
                    {log.logType === 'token_refresh' ? '🔄 Token Refreshed' : `📋 Notice Fetch: ${log.noticesFound} total (${log.newNotices} new)`}
                  </span>
                  {log.errorMessage && (
                    <span style={{ color: 'rgb(220, 38, 38)', marginLeft: '0.5rem' }}>
                      — {log.errorMessage}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {log.rawResponse && (
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      onClick={() => {
                        setSelectedRawResponse(log.rawResponse || null)
                        setDebugModal(true)
                      }}
                      title="View API response for this fetch"
                    >
                      <Eye size={11} /> View Raw API Response
                    </button>
                  )}
                  <span className={`badge ${log.status === 'success' ? 'badge-success' : 'badge-error'}`} style={{ fontSize: '0.65rem' }}>
                    {log.status}
                  </span>
                  <span style={{ color: 'rgb(148, 163, 184)' }}>
                    {formatDistanceToNow(new Date(log.fetchedAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OTP Modal */}
      {otpModal && (
        <OTPModal
          clientId={client.id}
          clientName={client.name}
          gstin={client.gstin}
          gstUsername={client.gstUsername}
          txn={otpModal.txn}
          sessionId={otpModal.sessionId}
          onSuccess={() => {
            setOtpModal(null)
            loadClient()
          }}
          onClose={() => setOtpModal(null)}
        />
      )}

      {/* Debug Modal */}
      {debugModal && (
        <DebugNoticeModal
          clientId={client.id}
          clientName={client.name}
          gstin={client.gstin}
          gstUsername={client.gstUsername}
          initialRaw={selectedRawResponse}
          onClose={() => {
            setDebugModal(false)
            setSelectedRawResponse(null)
          }}
          onRefresh={loadClient}
        />
      )}
    </div>
  )
}
