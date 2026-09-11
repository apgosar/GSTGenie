'use client'
import { useEffect, useState, useCallback } from 'react'
import { Users, Bell, Shield, AlertTriangle, RefreshCw, Loader2, Plus, Zap } from 'lucide-react'
import Link from 'next/link'
import StatsCard from '@/components/StatsCard'
import NoticeTable from '@/components/NoticeTable'
import BulkAuthenticateModal from '@/components/BulkAuthenticateModal'
import ScheduledTaskCountdown from '@/components/ScheduledTaskCountdown'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

interface Stats {
  totalClients: number
  totalNotices: number
  newNotices: number
  authIssues: number
  activeSessions: number
  expiringSoon: number
  recentActivity: {
    id: string
    fetchedAt: string
    status: string
    noticesFound: number
    newNotices: number
    logType: string
    client: { name: string; gstin: string }
  }[]
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

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [showBulkAuth, setShowBulkAuth] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [statsRes, noticesRes] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/notices'),
      ])
      const [statsData, noticesData] = await Promise.all([statsRes.json(), noticesRes.json()])
      setStats(statsData)
      setNotices(Array.isArray(noticesData) ? noticesData : [])
    } catch {
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    // Auto-refresh every 5 minutes
    const interval = setInterval(loadData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [loadData])

  async function fetchAllNotices() {
    setFetching(true)
    try {
      // Get all authenticated clients
      const res = await fetch('/api/clients')
      const clients = await res.json()
      const authenticated = clients.filter((c: { status: string }) => c.status === 'authenticated')

      if (authenticated.length === 0) {
        toast.warning('No authenticated clients. Please authenticate clients first.')
        return
      }

      let totalNew = 0
      for (const client of authenticated) {
        const fetchRes = await fetch('/api/notices/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: client.id }),
        })
        if (fetchRes.ok) {
          const data = await fetchRes.json()
          totalNew += data.newNotices ?? 0
        }
      }

      toast.success(`Sync complete! ${totalNew > 0 ? `${totalNew} new notice(s) found.` : 'No new notices.'}`)
      await loadData()
    } catch {
      toast.error('Failed to fetch all notices')
    } finally {
      setFetching(false)
    }
  }

  const newNotices = notices.filter((n) => n.isNew)
  const otherNotices = notices.filter((n) => !n.isNew)
  const displayNotices = [...newNotices, ...otherNotices].slice(0, 50)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '0.75rem', color: 'rgb(100, 116, 139)' }}>
        <Loader2 size={24} className="animate-spin" />
        Loading dashboard...
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Dashboard</h1>
          <p style={{ color: 'rgb(100, 116, 139)', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>
            GST Notice management for all clients
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowBulkAuth(true)}
            style={{
              background: 'rgb(245, 243, 255)',
              borderColor: 'rgb(196, 181, 253)',
              color: 'rgb(109, 40, 217)',
              fontWeight: 600,
            }}
          >
            <Zap size={16} color="rgb(124, 58, 237)" /> Authenticate All
          </button>
          <Link href="/clients" className="btn btn-secondary">
            <Plus size={16} /> Add Client
          </Link>
          <button className="btn btn-primary" onClick={fetchAllNotices} disabled={fetching}>
            {fetching ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {fetching ? 'Syncing...' : 'Fetch All Notices'}
          </button>
        </div>
      </div>

      {/* Scheduled Automation Countdown Timer */}
      <ScheduledTaskCountdown />

      {/* Auth issues banner */}
      {stats && stats.authIssues > 0 && (
        <div
          style={{
            background: 'rgb(254, 226, 226)',
            border: '1px solid rgb(252, 165, 165)',
            borderRadius: '0.75rem',
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'rgb(185, 28, 28)' }}>
            <AlertTriangle size={20} />
            <div>
              <div style={{ fontWeight: 600 }}>Authentication Required</div>
              <div style={{ fontSize: '0.85rem', color: 'rgb(220, 38, 38)' }}>
                {stats.authIssues} client{stats.authIssues > 1 ? 's' : ''} need re-authentication to continue receiving notice updates.
              </div>
            </div>
          </div>
          <button
            className="btn btn-danger"
            onClick={() => setShowBulkAuth(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Zap size={15} /> 1-Click Authenticate All
          </button>
        </div>
      )}

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <StatsCard
          title="Total Clients"
          value={stats?.totalClients ?? 0}
          icon={<Users size={22} />}
          subtitle="Registered clients"
        />
        <StatsCard
          title="New Notices"
          value={stats?.newNotices ?? 0}
          icon={<Bell size={22} />}
          subtitle="Unread notices"
          highlight={(stats?.newNotices ?? 0) > 0}
          color="rgb(37, 99, 235)"
        />
        <StatsCard
          title="Active Sessions"
          value={stats?.activeSessions ?? 0}
          icon={<Shield size={22} />}
          subtitle={stats?.expiringSoon ? `${stats.expiringSoon} expiring soon` : 'All healthy'}
          color="rgb(22, 163, 74)"
        />
        <StatsCard
          title="Auth Issues"
          value={stats?.authIssues ?? 0}
          icon={<AlertTriangle size={22} />}
          subtitle="Need re-authentication"
          highlight={(stats?.authIssues ?? 0) > 0}
          color="rgb(220, 38, 38)"
        />
      </div>

      {/* Notices table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgb(241, 245, 249)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Recent Notices</h2>
            <p style={{ fontSize: '0.8rem', color: 'rgb(100, 116, 139)', margin: '0.25rem 0 0' }}>
              {newNotices.length > 0 ? (
                <span style={{ color: 'rgb(37, 99, 235)', fontWeight: 500 }}>
                  {newNotices.length} new notice{newNotices.length > 1 ? 's' : ''} · {' '}
                </span>
              ) : null}
              {notices.length} total across all clients
            </p>
          </div>
          <button className="btn btn-secondary" onClick={loadData} style={{ padding: '0.375rem 0.625rem' }}>
            <RefreshCw size={14} />
          </button>
        </div>

        <NoticeTable notices={displayNotices} showClient={true} onUpdate={loadData} />
      </div>

      {/* Recent activity */}
      {stats?.recentActivity && stats.recentActivity.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Recent Activity</h2>
            <Link
              href="/activity"
              style={{ fontSize: '0.8rem', color: 'rgb(37, 99, 235)', textDecoration: 'none', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              View Full Activity Log & Payload Details →
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {stats.recentActivity.map((log) => {
              let actionText = ''
              if (log.logType === 'token_refresh') {
                actionText = '🔄 Session token refreshed'
              } else if (log.logType === 'notice_fetch') {
                if (log.status === 'success') {
                  actionText = log.noticesFound > 0
                    ? `📋 ${log.noticesFound} notice(s) fetched${log.newNotices > 0 ? ` (${log.newNotices} new)` : ''}`
                    : '📋 Notice check: 0 notices (No records found)'
                } else {
                  actionText = `⚠️ Notice fetch failed`
                }
              } else {
                actionText = `Activity (${log.status})`
              }

              return (
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
                    <span style={{ fontWeight: 600, color: 'rgb(15, 23, 42)' }}>{log.client.name}</span>
                    <span style={{ color: 'rgb(100, 116, 139)', marginLeft: '0.5rem' }}>
                      {actionText}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      className={`badge ${log.status === 'success' ? 'badge-success' : 'badge-error'}`}
                      style={{ fontSize: '0.65rem' }}
                    >
                      {log.status === 'success' ? (log.noticesFound === 0 ? 'Checked' : 'Success') : 'Error'}
                    </span>
                    <span style={{ color: 'rgb(148, 163, 184)', fontSize: '0.75rem' }}>
                      {formatDistanceToNow(new Date(log.fetchedAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Bulk Authenticate Modal */}
      {showBulkAuth && (
        <BulkAuthenticateModal
          onClose={() => setShowBulkAuth(false)}
          onSuccess={() => {
            loadData()
          }}
        />
      )}
    </div>
  )
}
