'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Bell,
  Activity,
  RefreshCw,
  AlertTriangle,
  Settings,
} from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'

interface Stats {
  newNotices: number
  authIssues: number
}

export default function Sidebar() {
  const pathname = usePathname()
  const [stats, setStats] = useState<Stats>({ newNotices: 0, authIssues: 0 })

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch('/api/dashboard/stats', { cache: 'no-store' })
      if (r.ok) {
        const d = await r.json()
        setStats({
          newNotices: d.newNotices ?? 0,
          authIssues: d.authIssues ?? 0,
        })
      }
    } catch {
      // Ignore network hiccup
    }
  }, [])

  useEffect(() => {
    // 1. Fetch immediately on mount & whenever route changes
    fetchStats()

    // 2. Poll every 15 seconds
    const interval = setInterval(fetchStats, 15000)

    // 3. Listen to window focus & custom stats update events
    const handleFocus = () => fetchStats()
    const handleStatsUpdated = () => fetchStats()

    window.addEventListener('focus', handleFocus)
    window.addEventListener('stats-updated', handleStatsUpdated)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('stats-updated', handleStatsUpdated)
    }
  }, [fetchStats, pathname])

  const links = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/clients', label: 'Clients', icon: Users },
    { href: '/notices', label: 'All Notices', icon: Bell, badge: stats.newNotices },
    { href: '/activity', label: 'Activity Log', icon: Activity },
    { href: '/settings', label: 'Settings', icon: Settings },
  ]

  return (
    <aside
      style={{
        width: 240,
        minHeight: '100vh',
        backgroundColor: 'rgb(15, 23, 42)',
        padding: '1.5rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 40,
      }}
    >
      {/* Logo */}
      <div style={{ padding: '0.5rem 1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '0.5rem',
              background: 'rgb(37, 99, 235)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 700,
              fontSize: '1rem',
            }}
          >
            G
          </div>
          <div>
            <div style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem' }}>GST Genie</div>
            <div style={{ color: 'rgb(100, 116, 139)', fontSize: '0.7rem' }}>CA Dashboard</div>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
        {links.map(({ href, label, icon: Icon, badge }) => (
          <Link
            key={href}
            href={href}
            className={`sidebar-link${pathname === href ? ' active' : ''}`}
          >
            <Icon size={18} />
            <span style={{ flex: 1 }}>{label}</span>
            {badge !== undefined && badge > 0 && (
              <span
                style={{
                  background: 'rgb(37, 99, 235)',
                  color: 'white',
                  borderRadius: '9999px',
                  padding: '0.1rem 0.5rem',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                }}
              >
                {badge}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {/* Auth issues alert at bottom */}
      {stats.authIssues > 0 && (
        <Link
          href="/clients"
          style={{
            background: 'rgba(220, 38, 38, 0.15)',
            border: '1px solid rgba(220, 38, 38, 0.3)',
            borderRadius: '0.5rem',
            padding: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'rgb(252, 165, 165)',
            fontSize: '0.75rem',
            textDecoration: 'none',
            transition: 'background 0.2s',
          }}
        >
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span>{stats.authIssues} client{stats.authIssues > 1 ? 's' : ''} need re-auth</span>
        </Link>
      )}

      {/* Footer */}
      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          paddingTop: '1rem',
          color: 'rgb(100, 116, 139)',
          fontSize: '0.7rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <RefreshCw size={12} />
          Token refresh: every 5 hours
        </div>
        <div>API: api.whitebooks.in</div>
      </div>
    </aside>
  )
}
