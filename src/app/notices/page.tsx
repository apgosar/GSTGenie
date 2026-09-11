'use client'
import { useEffect, useState, useCallback } from 'react'
import { Bell, RefreshCw, Loader2, Filter } from 'lucide-react'
import NoticeTable from '@/components/NoticeTable'
import { toast } from 'sonner'

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

export default function NoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'new'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = filter === 'new' ? '/api/notices?isNew=true' : '/api/notices'
      const res = await fetch(url)
      const data = await res.json()
      setNotices(Array.isArray(data) ? data : [])
    } catch {
      toast.error('Failed to load notices')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const newCount = notices.filter((n) => n.isNew).length

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Bell size={22} /> All Notices
            {newCount > 0 && (
              <span className="badge badge-info badge-new" style={{ fontSize: '0.75rem' }}>
                {newCount} new
              </span>
            )}
          </h1>
          <p style={{ color: 'rgb(100, 116, 139)', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>
            {notices.length} total notices across all clients
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'white', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.5rem', overflow: 'hidden' }}>
            <button
              onClick={() => setFilter('all')}
              style={{
                padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 500, border: 'none', cursor: 'pointer',
                background: filter === 'all' ? 'rgb(37, 99, 235)' : 'transparent',
                color: filter === 'all' ? 'white' : 'rgb(100, 116, 139)',
              }}
            >
              All
            </button>
            <button
              onClick={() => setFilter('new')}
              style={{
                padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 500, border: 'none', cursor: 'pointer',
                background: filter === 'new' ? 'rgb(37, 99, 235)' : 'transparent',
                color: filter === 'new' ? 'white' : 'rgb(100, 116, 139)',
                display: 'flex', alignItems: 'center', gap: '0.375rem',
              }}
            >
              <Filter size={13} /> New Only
            </button>
          </div>
          <button className="btn btn-secondary" onClick={load} style={{ padding: '0.5rem 0.75rem' }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '3rem', justifyContent: 'center', color: 'rgb(100, 116, 139)' }}>
            <Loader2 size={20} className="animate-spin" /> Loading notices...
          </div>
        ) : (
          <NoticeTable notices={notices} showClient={true} onUpdate={load} />
        )}
      </div>
    </div>
  )
}
