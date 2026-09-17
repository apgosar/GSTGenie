'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { Plus, Search, Loader2, X, Users, FileSpreadsheet, Zap, KeyRound, RefreshCw, Eye, AlertTriangle, CheckCircle2, Clock, ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import OTPModal from '@/components/OTPModal'
import ImportClientsModal from '@/components/ImportClientsModal'
import BulkAuthenticateModal from '@/components/BulkAuthenticateModal'
import { toast } from 'sonner'
import { INDIAN_STATES, validateGSTIN, getStateCodeFromGSTIN, getStateNameByCode, DEFAULT_CA_EMAIL } from '@/lib/utils'
import { format, differenceInMinutes, formatDistanceToNow } from 'date-fns'

interface Session {
  id: string
  txn: string
  ipAddress: string
  lastRefreshedAt: string
  expiresAt: string
  authError?: string
  isActive: boolean
}

interface Client {
  id: string
  name: string
  gstin: string
  gstUsername: string
  email: string
  phone?: string
  stateCode: string
  status: string
  newNoticeCount: number
  totalNotices: number
  activeSession?: Session | null
  lastNoticeFetchedAt?: string | null
  lastFetchStatus?: string | null
}

const EMPTY_FORM = {
  name: '',
  gstin: '',
  gstUsername: '',
  email: DEFAULT_CA_EMAIL,
  phone: '',
  stateCode: '',
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'authenticated' | 'pending' | 'new_notices'>('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showBulkAuthModal, setShowBulkAuthModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [fetchingClientId, setFetchingClientId] = useState<string | null>(null)
  const [refreshingClientId, setRefreshingClientId] = useState<string | null>(null)

  const [otpModal, setOtpModal] = useState<{
    clientId: string
    clientName: string
    gstin?: string
    gstUsername: string
    txn: string
    sessionId?: string
  } | null>(null)

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch('/api/clients')
      const data = await res.json()
      setClients(Array.isArray(data) ? data : [])
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('stats-updated'))
      }
    } catch {
      toast.error('Failed to load clients')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadClients()
  }, [loadClients])

  const filtered = clients.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.gstin.toLowerCase().includes(search.toLowerCase()) ||
      c.gstUsername.toLowerCase().includes(search.toLowerCase())

    if (!matchesSearch) return false

    if (statusFilter === 'authenticated') return c.status === 'authenticated'
    if (statusFilter === 'pending') return c.status !== 'authenticated'
    if (statusFilter === 'new_notices') return c.newNoticeCount > 0
    return true
  })

  function handleGSTINChange(val: string) {
    const uppercase = val.toUpperCase().slice(0, 15)
    const autoStateCode = getStateCodeFromGSTIN(uppercase)
    setForm((f) => ({
      ...f,
      gstin: uppercase,
      stateCode: autoStateCode || f.stateCode,
    }))
    setErrors((er) => ({ ...er, gstin: '', stateCode: '' }))
  }

  function validate() {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    if (!form.gstin.trim()) errs.gstin = 'GSTIN is required'
    else if (form.gstin.length !== 15) errs.gstin = 'GSTIN must be 15 characters'
    else if (!validateGSTIN(form.gstin)) errs.gstin = 'Invalid GSTIN format'
    if (!form.gstUsername.trim()) errs.gstUsername = 'GST Username is required'
    if (!form.email.trim()) errs.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email'
    if (!form.stateCode) errs.stateCode = 'State is required'
    return errs
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to add client')
        return
      }

      const clientId = data.id
      setShowAddModal(false)
      setForm({ ...EMPTY_FORM, email: DEFAULT_CA_EMAIL })
      await loadClients()

      toast.info('Client added! Initiating OTP request...')
      const otpRes = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const otpData = await otpRes.json()

      if (!otpRes.ok) {
        toast.error(otpData.error || 'Failed to send OTP. Please authenticate manually.')
        return
      }

      setOtpModal({
        clientId,
        clientName: form.name,
        gstin: form.gstin,
        gstUsername: form.gstUsername,
        txn: otpData.txn,
        sessionId: otpData.sessionId,
      })

      toast.success('OTP request sent! Enter the received OTP to activate.')
    } catch {
      toast.error('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRequestOTP(client: Client) {
    toast.info(`Requesting OTP for ${client.name}...`)
    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to request OTP')
        return
      }

      setOtpModal({
        clientId: client.id,
        clientName: client.name,
        gstin: client.gstin,
        gstUsername: client.gstUsername,
        txn: data.txn,
        sessionId: data.sessionId,
      })
      await loadClients()
    } catch {
      toast.error('Failed to request OTP')
    }
  }

  async function handleFetchNotices(clientId: string) {
    setFetchingClientId(clientId)
    try {
      const res = await fetch('/api/notices/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to fetch notices')
        return
      }

      const total = data.total ?? 0
      const newN = data.newNotices ?? 0
      if (newN > 0) {
        toast.success(`Found ${newN} new notice(s)! (${total} total)`)
      } else if (total > 0) {
        toast.info(`Notice check complete: ${total} notice(s) up to date.`)
      } else {
        toast.info('Notice check complete: No records found.')
      }

      await loadClients()
    } catch {
      toast.error('Failed to fetch notices')
    } finally {
      setFetchingClientId(null)
    }
  }

  async function handleRefreshToken(clientId: string) {
    setRefreshingClientId(clientId)
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Token refresh failed')
        return
      }

      toast.success('Token refreshed! Extended for 6 more hours.')
      await loadClients()
    } catch {
      toast.error('Failed to refresh token')
    } finally {
      setRefreshingClientId(null)
    }
  }

  // Calculate session remaining time
  function getSessionRemainingText(client: Client) {
    if (client.status !== 'authenticated' || !client.activeSession?.expiresAt) {
      return null
    }
    const expiresAt = new Date(client.activeSession.expiresAt)
    const now = new Date()
    const minsLeft = differenceInMinutes(expiresAt, now)

    if (minsLeft <= 0) return 'Expired'
    const hrs = Math.floor(minsLeft / 60)
    const mins = minsLeft % 60
    return hrs > 0 ? `${hrs}h ${mins}m left` : `${mins}m left`
  }

  // Format last fetched date
  function formatLastFetched(dateStr?: string | null) {
    if (!dateStr) return { primary: 'Never fetched', secondary: '' }
    try {
      const d = new Date(dateStr)
      return {
        primary: format(d, 'dd MMM yyyy, hh:mm a'),
        secondary: formatDistanceToNow(d, { addSuffix: true }),
      }
    } catch {
      return { primary: dateStr, secondary: '' }
    }
  }

  const authenticatedCount = clients.filter((c) => c.status === 'authenticated').length
  const pendingCount = clients.length - authenticatedCount
  const totalNoticesCount = clients.reduce((acc, c) => acc + (c.totalNotices || 0), 0)

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Clients Directory</h1>
          <p style={{ color: 'rgb(100, 116, 139)', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>
            {clients.length} registered client{clients.length !== 1 ? 's' : ''} · {authenticatedCount} authenticated · {totalNoticesCount} total notices
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowBulkAuthModal(true)}
            style={{
              background: 'rgb(245, 243, 255)',
              borderColor: 'rgb(196, 181, 253)',
              color: 'rgb(109, 40, 217)',
              fontWeight: 600,
            }}
          >
            <Zap size={16} color="rgb(124, 58, 237)" /> Authenticate All
          </button>
          <button className="btn btn-secondary" onClick={() => setShowImportModal(true)}>
            <FileSpreadsheet size={16} /> Import Excel / CSV
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={16} /> Add Client
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', gap: '0.75rem', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', minWidth: 220, flex: 1, maxWidth: 450 }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'rgb(148, 163, 184)' }} />
          <input
            type="text"
            placeholder="Search by client name, GSTIN, or username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', overflowX: 'auto', paddingBottom: '0.25rem' }}>
          <button
            className={`btn ${statusFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            onClick={() => setStatusFilter('all')}
          >
            All ({clients.length})
          </button>
          <button
            className={`btn ${statusFilter === 'authenticated' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            onClick={() => setStatusFilter('authenticated')}
          >
            🟢 Authenticated ({authenticatedCount})
          </button>
          <button
            className={`btn ${statusFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            onClick={() => setStatusFilter('pending')}
          >
            🟠 OTP Pending ({pendingCount})
          </button>
          <button
            className={`btn ${statusFilter === 'new_notices' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            onClick={() => setStatusFilter('new_notices')}
          >
            📬 Has New Notices
          </button>
        </div>
      </div>

      {/* Main Client Table */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '250px', gap: '0.75rem', color: 'rgb(100, 116, 139)' }}>
          <Loader2 size={24} className="animate-spin" /> Loading clients...
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'rgb(100, 116, 139)' }}>
          <Users size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
          <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.5rem', color: 'rgb(15, 23, 42)' }}>
            {search ? 'No clients match your filter criteria' : 'No clients registered yet'}
          </div>
          {!search && (
            <div style={{ marginBottom: '1.5rem', fontSize: '0.875rem' }}>Import your spreadsheet or add your first client to start monitoring GST notices.</div>
          )}
          {!search && (
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setShowImportModal(true)}>
                <FileSpreadsheet size={16} /> Import Excel / CSV
              </button>
              <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                <Plus size={16} /> Add Client
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive">
            <table style={{ margin: 0, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Client / Business Name</th>
                <th style={{ minWidth: 170 }}>GSTIN & State</th>
                <th style={{ minWidth: 150 }}>Auth Status</th>
                <th style={{ minWidth: 180 }}>Last Notice Fetched</th>
                <th style={{ minWidth: 120 }}>Notices</th>
                <th style={{ minWidth: 180, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => {
                const isAuth = client.status === 'authenticated'
                const remainingTime = getSessionRemainingText(client)
                const lastFetch = formatLastFetched(client.lastNoticeFetchedAt)
                const isFetching = fetchingClientId === client.id
                const isRefreshing = refreshingClientId === client.id

                return (
                  <tr key={client.id}>
                    {/* Client Name & Username */}
                    <td>
                      <Link
                        href={`/clients/${client.id}`}
                        style={{ fontWeight: 600, color: 'rgb(37, 99, 235)', textDecoration: 'none', fontSize: '0.9rem' }}
                      >
                        {client.name}
                      </Link>
                      <div style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)', marginTop: '0.15rem' }}>
                        User: <strong style={{ color: 'rgb(51, 65, 85)' }}>{client.gstUsername}</strong>
                      </div>
                    </td>

                    {/* GSTIN & State */}
                    <td>
                      <code style={{ fontSize: '0.8rem', fontWeight: 600 }}>{client.gstin}</code>
                      <div style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)', marginTop: '0.15rem' }}>
                        {getStateNameByCode(client.stateCode)} ({client.stateCode})
                      </div>
                    </td>

                    {/* Auth Status */}
                    <td>
                      {isAuth ? (
                        <div>
                          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            <CheckCircle2 size={11} /> Authenticated
                          </span>
                          {remainingTime && (
                            <div style={{ fontSize: '0.7rem', color: 'rgb(22, 101, 52)', marginTop: '0.2rem', fontFamily: 'monospace' }}>
                              ⏱️ {remainingTime}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <span className="badge badge-pending" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Clock size={11} /> OTP Pending
                          </span>
                          <div style={{ fontSize: '0.7rem', color: 'rgb(180, 83, 9)', marginTop: '0.2rem' }}>
                            Session required
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Last Notice Fetched */}
                    <td>
                      <div style={{ fontWeight: 500, fontSize: '0.8rem', color: client.lastNoticeFetchedAt ? 'rgb(15, 23, 42)' : 'rgb(148, 163, 184)' }}>
                        {lastFetch.primary}
                      </div>
                      {lastFetch.secondary && (
                        <div style={{ fontSize: '0.7rem', color: 'rgb(100, 116, 139)', marginTop: '0.15rem' }}>
                          {lastFetch.secondary}
                        </div>
                      )}
                    </td>

                    {/* Notices */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{client.totalNotices}</span>
                        {client.newNoticeCount > 0 && (
                          <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>
                            {client.newNoticeCount} new
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                        {isAuth ? (
                          <>
                            <button
                              className="btn btn-primary"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                              onClick={() => handleFetchNotices(client.id)}
                              disabled={isFetching}
                              title="Fetch recent notices from GST portal"
                            >
                              {isFetching ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                              {isFetching ? 'Fetching...' : 'Fetch Notices'}
                            </button>

                            <button
                              className="btn btn-secondary"
                              style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
                              onClick={() => handleRefreshToken(client.id)}
                              disabled={isRefreshing}
                              title="Refresh 6-hour session token"
                            >
                              {isRefreshing ? <Loader2 size={12} className="animate-spin" /> : '🔄'}
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', borderColor: 'rgb(253, 230, 138)', background: 'rgb(254, 252, 232)', color: 'rgb(180, 83, 9)' }}
                            onClick={() => handleRequestOTP(client)}
                            title="Request OTP to activate 6-hour session"
                          >
                            <KeyRound size={12} /> Request OTP
                          </button>
                        )}

                        <Link
                          href={`/clients/${client.id}`}
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
                          title="View client details and notices"
                        >
                          <Eye size={12} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Add Client Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="modal-content" style={{ maxWidth: '32rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Add New Client</h2>
              <button className="btn btn-secondary" style={{ padding: '0.375rem' }} onClick={() => { setShowAddModal(false); setErrors({}) }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label>Client / Business Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. ABC Enterprises"
                    value={form.name}
                    onChange={(e) => { setForm(f => ({ ...f, name: e.target.value })); setErrors(er => ({ ...er, name: '' })) }}
                    style={{ borderColor: errors.name ? 'rgb(220, 38, 38)' : undefined }}
                  />
                  {errors.name && <div style={{ color: 'rgb(220, 38, 38)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.name}</div>}
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label>GSTIN * (State auto-populates from first 2 digits)</label>
                  <input
                    type="text"
                    placeholder="e.g. 27AABCU9603R1ZM"
                    value={form.gstin}
                    onChange={(e) => handleGSTINChange(e.target.value)}
                    style={{ fontFamily: 'monospace', letterSpacing: '0.05em', borderColor: errors.gstin ? 'rgb(220, 38, 38)' : undefined }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                    {errors.gstin ? <span style={{ color: 'rgb(220, 38, 38)', fontSize: '0.75rem' }}>{errors.gstin}</span> : <span />}
                    <span style={{ fontSize: '0.7rem', color: 'rgb(148, 163, 184)' }}>{form.gstin.length}/15</span>
                  </div>
                </div>

                <div>
                  <label>GST Username *</label>
                  <input
                    type="text"
                    placeholder="GST portal username"
                    value={form.gstUsername}
                    onChange={(e) => { setForm(f => ({ ...f, gstUsername: e.target.value })); setErrors(er => ({ ...er, gstUsername: '' })) }}
                    style={{ borderColor: errors.gstUsername ? 'rgb(220, 38, 38)' : undefined }}
                  />
                  {errors.gstUsername && <div style={{ color: 'rgb(220, 38, 38)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.gstUsername}</div>}
                </div>

                <div>
                  <label>State Code *</label>
                  <select
                    value={form.stateCode}
                    onChange={(e) => { setForm(f => ({ ...f, stateCode: e.target.value })); setErrors(er => ({ ...er, stateCode: '' })) }}
                    style={{ borderColor: errors.stateCode ? 'rgb(220, 38, 38)' : undefined }}
                  >
                    <option value="">Select state...</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                    ))}
                  </select>
                  {errors.stateCode && <div style={{ color: 'rgb(220, 38, 38)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.stateCode}</div>}
                </div>

                <div>
                  <label>Email *</label>
                  <input
                    type="email"
                    placeholder="ankur.gosar@vdsadvisory.com"
                    value={form.email}
                    onChange={(e) => { setForm(f => ({ ...f, email: e.target.value })); setErrors(er => ({ ...er, email: '' })) }}
                    style={{ borderColor: errors.email ? 'rgb(220, 38, 38)' : undefined }}
                  />
                  {errors.email && <div style={{ color: 'rgb(220, 38, 38)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.email}</div>}
                </div>

                <div>
                  <label>Phone (optional)</label>
                  <input
                    type="tel"
                    placeholder="+91 XXXXX XXXXX"
                    value={form.phone}
                    onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ background: 'rgb(240, 249, 255)', borderRadius: '0.5rem', padding: '0.625rem 0.875rem', fontSize: '0.75rem', color: 'rgb(12, 74, 110)', marginBottom: '1.25rem' }}>
                On save, an OTP request will be initiated. Enter the received OTP to obtain a 6-hour authorized session for fetching notices.
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ flex: 1, justifyContent: 'center' }}>
                  {submitting ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Plus size={14} /> Add & Request OTP</>}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowAddModal(false); setErrors({}) }} disabled={submitting}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Excel Modal */}
      {showImportModal && (
        <ImportClientsModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            loadClients()
          }}
        />
      )}

      {/* Bulk Authenticate Modal */}
      {showBulkAuthModal && (
        <BulkAuthenticateModal
          onClose={() => setShowBulkAuthModal(false)}
          onSuccess={() => {
            loadClients()
          }}
        />
      )}

      {/* OTP Modal */}
      {otpModal && (
        <OTPModal
          clientId={otpModal.clientId}
          clientName={otpModal.clientName}
          gstin={otpModal.gstin}
          gstUsername={otpModal.gstUsername}
          txn={otpModal.txn}
          sessionId={otpModal.sessionId}
          onSuccess={() => {
            setOtpModal(null)
            loadClients()
          }}
          onClose={() => setOtpModal(null)}
        />
      )}
    </div>
  )
}
