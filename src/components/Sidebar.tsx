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
  Menu,
  X,
} from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'

interface Stats {
  newNotices: number
  authIssues: number
}

export default function Sidebar() {
  const pathname = usePathname()
  const [stats, setStats] = useState<Stats>({ newNotices: 0, authIssues: 0 })
  const [drawerOpen, setDrawerOpen] = useState(false)

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
    fetchStats()
    const interval = setInterval(fetchStats, 15000)
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

  // Automatically close drawer when route changes
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  const links = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/clients', label: 'Clients', icon: Users },
    { href: '/notices', label: 'All Notices', icon: Bell, badge: stats.newNotices },
    { href: '/activity', label: 'Activity Log', icon: Activity },
    { href: '/settings', label: 'Settings', icon: Settings },
  ]

  const bottomNavItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/clients', label: 'Clients', icon: Users, badge: stats.authIssues > 0 ? stats.authIssues : undefined, badgeColor: 'rgb(220, 38, 38)' },
    { href: '/notices', label: 'Notices', icon: Bell, badge: stats.newNotices > 0 ? stats.newNotices : undefined, badgeColor: 'rgb(37, 99, 235)' },
    { href: '/settings', label: 'Settings', icon: Settings },
  ]

  return (
    <>
      {/* ============================================================== */}
      {/* 1. MOBILE TOP HEADER (< 768px)                                */}
      {/* ============================================================== */}
      <header className="mobile-top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              padding: '0.35rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '0.375rem',
            }}
          >
            <Menu size={22} />
          </button>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '0.375rem',
                background: 'rgb(37, 99, 235)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 700,
                fontSize: '0.85rem',
              }}
            >
              G
            </div>
            <span style={{ color: 'white', fontWeight: 700, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
              GST Genie
            </span>
          </Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {stats.authIssues > 0 && (
            <Link
              href="/clients"
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: 'rgb(252, 165, 165)',
                padding: '0.2rem 0.5rem',
                borderRadius: '9999px',
                fontSize: '0.7rem',
                fontWeight: 600,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              <AlertTriangle size={12} />
              <span>{stats.authIssues} re-auth</span>
            </Link>
          )}
          {stats.newNotices > 0 && (
            <Link
              href="/notices"
              style={{
                background: 'rgb(37, 99, 235)',
                color: 'white',
                padding: '0.2rem 0.5rem',
                borderRadius: '9999px',
                fontSize: '0.7rem',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              {stats.newNotices} new
            </Link>
          )}
        </div>
      </header>

      {/* ============================================================== */}
      {/* 2. MOBILE DRAWER SLIDE-OUT MENU (< 768px)                     */}
      {/* ============================================================== */}
      {drawerOpen && (
        <div
          className="mobile-drawer-overlay"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        >
          <div
            className="mobile-drawer-content"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '0.5rem',
                    background: 'rgb(37, 99, 235)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                  }}
                >
                  G
                </div>
                <div>
                  <div style={{ color: 'white', fontWeight: 700, fontSize: '0.95rem' }}>GST Genie</div>
                  <div style={{ color: 'rgb(148, 163, 184)', fontSize: '0.7rem' }}>CA Notice Automation</div>
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: 'none',
                  color: 'rgb(148, 163, 184)',
                  cursor: 'pointer',
                  padding: '0.35rem',
                  borderRadius: '0.375rem',
                  display: 'flex',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Nav Links */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
              {links.map(({ href, label, icon: Icon, badge }) => (
                <Link
                  key={href}
                  href={href}
                  className={`sidebar-link${pathname === href ? ' active' : ''}`}
                  onClick={() => setDrawerOpen(false)}
                  style={{ padding: '0.75rem 1rem' }}
                >
                  <Icon size={18} />
                  <span style={{ flex: 1, fontSize: '0.9rem' }}>{label}</span>
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

            {/* Bottom Alert inside drawer */}
            {stats.authIssues > 0 && (
              <Link
                href="/clients"
                onClick={() => setDrawerOpen(false)}
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
                  marginBottom: '1rem',
                }}
              >
                <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                <span>{stats.authIssues} client{stats.authIssues > 1 ? 's' : ''} need re-auth</span>
              </Link>
            )}

            {/* Footer info in drawer */}
            <div
              style={{
                borderTop: '1px solid rgba(255,255,255,0.08)',
                paddingTop: '0.75rem',
                color: 'rgb(100, 116, 139)',
                fontSize: '0.7rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                <RefreshCw size={11} />
                <span>Token refresh: every 5 hours</span>
              </div>
              <div>Connected to WhiteBooks GST API</div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. MOBILE BOTTOM NAVIGATION BAR (< 768px)                      */}
      {/* ============================================================== */}
      <nav className="mobile-bottom-bar" aria-label="Mobile Navigation">
        <div style={{ display: 'flex', height: '100%', alignItems: 'center' }}>
          {bottomNavItems.map(({ href, label, icon: Icon, badge, badgeColor }) => {
            const isActive = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`mobile-bottom-nav-item${isActive ? ' active' : ''}`}
              >
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={20} />
                  {badge !== undefined && (
                    <span
                      style={{
                        position: 'absolute',
                        top: -4,
                        right: -8,
                        background: badgeColor || 'rgb(37, 99, 235)',
                        color: 'white',
                        borderRadius: '9999px',
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        padding: '0.05rem 0.35rem',
                        minWidth: 16,
                        height: 16,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {badge}
                    </span>
                  )}
                </div>
                <span>{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* ============================================================== */}
      {/* 4. DESKTOP SIDEBAR (>= 768px)                                  */}
      {/* ============================================================== */}
      <aside
        className="desktop-sidebar"
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
    </>
  )
}
