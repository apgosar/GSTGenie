'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { Activity, Search, RefreshCw, Loader2, CheckCircle2, AlertCircle, Eye, Filter, ArrowRight, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import LogDetailModal from '@/components/LogDetailModal'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'

interface LogItem {
  id: string
  clientId: string
  fetchedAt: string
  noticesFound: number
  newNotices: number
  status: string
  errorMessage?: string | null
  rawResponse?: string | null
  logType: string
  client: {
    id: string
    name: string
    gstin: string
    gstUsername: string
    stateCode: string
  }
}

interface Stats {
  total: number
  noticeFetches: number
  tokenRefreshes: number
  otpEvents: number
  errors: number
}

export default function ActivityPage() {
  const [logs, setLogs] = useState<LogItem[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [logTypeFilter, setLogTypeFilter] = useState<'all' | 'notice_fetch' | 'token_refresh' | 'otp_request' | 'error'>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedLog, setSelectedLog] = useState<LogItem | null>(null)

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '50')

      if (logTypeFilter === 'error') {
        params.set('status', 'error')
      } else if (logTypeFilter !== 'all') {
        params.set('logType', logTypeFilter)
      }

      if (search.trim()) {
        params.set('search', search.trim())
      }

      const res = await fetch(`/api/activity?${params.toString()}`)
      const data = await res.json()

      if (res.ok) {
        setLogs(data.logs || [])
        setTotalPages(data.totalPages || 1)
        setStats(data.stats || null)
      } else {
        toast.error('Failed to load activity logs')
      }
    } catch {
      toast.error('Network error loading activity logs')
    } finally {
      setLoading(false)
    }
  }, [page, logTypeFilter, search])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  function getEventLabel(log: LogItem) {
    if (log.logType === 'notice_fetch') {
      if (log.status === 'success') {
        return log.noticesFound > 0
          ? `📋 ${log.noticesFound} notice(s) fetched${log.newNotices > 0 ? ` (${log.newNotices} new)` : ''}`
          : '📋 Notice check: 0 notices (No records found)'
      }
      return `⚠️ Notice fetch failed: ${log.errorMessage || 'Error'}`
    }

    if (log.logType === 'token_refresh') {
      return log.status === 'success'
        ? '🔄 Token refreshed (6h active)'
        : `⚠️ Token refresh failed: ${log.errorMessage || 'Error'}`
    }

    if (log.logType === 'otp_request') {
      return '🔑 OTP Request sent'
    }

    if (log.logType === 'otp_verify') {
      return '🛡️ OTP Verified & Authenticated'
    }

    return `Activity: ${log.logType}`
  }

  function getBadgeColor(logType: string) {
    switch (logType) {
      case 'notice_fetch':
        return { bg: 'rgb(239, 246, 255)', color: 'rgb(37, 99, 235)', border: 'rgb(191, 219, 254)' }
      case 'token_refresh':
        return { bg: 'rgb(243, 232, 255)', color: 'rgb(126, 34, 206)', border: 'rgb(216, 180, 254)' }
      case 'otp_request':
      case 'otp_verify':
        return { bg: 'rgb(254, 243, 199)', color: 'rgb(180, 83, 9)', border: 'rgb(253, 230, 138)' }
      default:
        return { bg: 'rgb(241, 245, 249)', color: 'rgb(71, 85, 105)', border: 'rgb(226, 232, 240)' }
    }
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Full Activity & API Log</h1>
          <p style={{ color: 'rgb(100, 116, 139)', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>
            Complete audit trail of all API requests, notice checks, and authentication responses
          </p>
        </div>
        <button className="btn btn-secondary" onClick={loadLogs} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <RefreshCw size={14} /> Refresh Logs
        </button>
      </div>

      {/* Stats Summary Bar */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <div style={{ background: 'white', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.5rem', padding: '0.75rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)' }}>Total Requests</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'rgb(15, 23, 42)' }}>{stats.total}</div>
          </div>

          <div style={{ background: 'white', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.5rem', padding: '0.75rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'rgb(37, 99, 235)' }}>Notice Fetches</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'rgb(37, 99, 235)' }}>{stats.noticeFetches}</div>
          </div>

          <div style={{ background: 'white', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.5rem', padding: '0.75rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'rgb(126, 34, 206)' }}>Token Refreshes</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'rgb(126, 34, 206)' }}>{stats.tokenRefreshes}</div>
          </div>

          <div style={{ background: 'white', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.5rem', padding: '0.75rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'rgb(180, 83, 9)' }}>OTP Events</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'rgb(180, 83, 9)' }}>{stats.otpEvents}</div>
          </div>

          <div style={{ background: 'white', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.5rem', padding: '0.75rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'rgb(220, 38, 38)' }}>Errors</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'rgb(220, 38, 38)' }}>{stats.errors}</div>
          </div>
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', minWidth: 320, flex: 1, maxWidth: 450 }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'rgb(148, 163, 184)' }} />
          <input
            type="text"
            placeholder="Search by client name, GSTIN, or username..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            className={`btn ${logTypeFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
            onClick={() => { setLogTypeFilter('all'); setPage(1) }}
          >
            All Logs
          </button>
          <button
            className={`btn ${logTypeFilter === 'notice_fetch' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
            onClick={() => { setLogTypeFilter('notice_fetch'); setPage(1) }}
          >
            📋 Notice Fetches
          </button>
          <button
            className={`btn ${logTypeFilter === 'token_refresh' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
            onClick={() => { setLogTypeFilter('token_refresh'); setPage(1) }}
          >
            🔄 Token Refreshes
          </button>
          <button
            className={`btn ${logTypeFilter === 'otp_request' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
            onClick={() => { setLogTypeFilter('otp_request'); setPage(1) }}
          >
            🔑 OTP Events
          </button>
          <button
            className={`btn ${logTypeFilter === 'error' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
            onClick={() => { setLogTypeFilter('error'); setPage(1) }}
          >
            🔴 Errors
          </button>
        </div>
      </div>

      {/* Main Table */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '250px', gap: '0.75rem', color: 'rgb(100, 116, 139)' }}>
          <Loader2 size={24} className="animate-spin" /> Loading activity logs...
        </div>
      ) : logs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'rgb(100, 116, 139)' }}>
          <Activity size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
          <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.5rem', color: 'rgb(15, 23, 42)' }}>
            No activity logs found
          </div>
          <div style={{ fontSize: '0.875rem' }}>Try clearing filters or initiate a notice check to generate activity.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive">
            <table style={{ margin: 0, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ minWidth: 170 }}>Timestamp</th>
                <th style={{ minWidth: 220 }}>Client / Taxpayer</th>
                <th style={{ minWidth: 120 }}>Event Type</th>
                <th style={{ minWidth: 240 }}>Action / Result Details</th>
                <th style={{ minWidth: 100 }}>Status</th>
                <th style={{ minWidth: 100, textAlign: 'right' }}>Payload</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const badge = getBadgeColor(log.logType)
                const isSuccess = log.status === 'success'

                return (
                  <tr key={log.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedLog(log)}>
                    {/* Timestamp */}
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'rgb(15, 23, 42)' }}>
                        {format(new Date(log.fetchedAt), 'dd MMM yyyy')}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'rgb(100, 116, 139)', marginTop: '0.15rem' }}>
                        {format(new Date(log.fetchedAt), 'hh:mm:ss a')} ({formatDistanceToNow(new Date(log.fetchedAt), { addSuffix: true })})
                      </div>
                    </td>

                    {/* Client */}
                    <td>
                      <Link
                        href={`/clients/${log.client.id}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontWeight: 600, color: 'rgb(37, 99, 235)', textDecoration: 'none', fontSize: '0.85rem' }}
                      >
                        {log.client.name}
                      </Link>
                      <div style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)', marginTop: '0.15rem' }}>
                        <code style={{ fontSize: '0.75rem' }}>{log.client.gstin}</code>
                      </div>
                    </td>

                    {/* Event Type */}
                    <td>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '0.375rem',
                          background: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                          textTransform: 'uppercase',
                        }}
                      >
                        {log.logType.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Result details */}
                    <td>
                      <div style={{ fontSize: '0.8rem', color: 'rgb(51, 65, 85)', fontWeight: 500 }}>
                        {getEventLabel(log)}
                      </div>
                    </td>

                    {/* Status */}
                    <td>
                      <span className={`badge ${isSuccess ? 'badge-success' : 'badge-error'}`} style={{ fontSize: '0.7rem' }}>
                        {isSuccess ? 'Success' : 'Error'}
                      </span>
                    </td>

                    {/* Inspect Payload Action */}
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedLog(log)
                        }}
                      >
                        <Eye size={12} /> Inspect
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>

          {/* Pagination bar */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.25rem', borderTop: '1px solid rgb(226, 232, 240)', background: 'rgb(248, 250, 252)' }}>
              <div style={{ fontSize: '0.8rem', color: 'rgb(100, 116, 139)' }}>
                Page <strong>{page}</strong> of <strong>{totalPages}</strong>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ArrowLeft size={12} /> Prev
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ArrowRight size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Inspect Log Modal */}
      {selectedLog && (
        <LogDetailModal
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
        />
      )}
    </div>
  )
}
