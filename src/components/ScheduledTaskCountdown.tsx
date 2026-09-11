'use client'
import React, { useState, useEffect } from 'react'
import { Clock, Calendar, Zap, RefreshCw } from 'lucide-react'

interface TimeRemaining {
  days: number
  hours: number
  minutes: number
  seconds: number
  totalMs: number
}

function calculateTimeRemaining(targetDate: Date): TimeRemaining {
  const diff = Math.max(0, targetDate.getTime() - Date.now())
  const totalSeconds = Math.floor(diff / 1000)

  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return { days, hours, minutes, seconds, totalMs: diff }
}

function formatCountdown(t: TimeRemaining, includeDays: boolean = true): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  if (includeDays && t.days > 0) {
    return `${t.days}d ${pad(t.hours)}h ${pad(t.minutes)}m ${pad(t.seconds)}s`
  }
  return `${pad(t.hours + (t.days * 24))}h ${pad(t.minutes)}m ${pad(t.seconds)}s`
}

function getNextTokenRefreshIST(): Date {
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  const istNow = new Date(now.getTime() + istOffset)

  const istHours = istNow.getUTCHours()
  const istMinutes = istNow.getUTCMinutes()
  const istSeconds = istNow.getUTCSeconds()

  const scheduleHours = [0, 5, 10, 15, 20]
  const nextHour = scheduleHours.find((h) => h > istHours || (h === istHours && istMinutes === 0 && istSeconds === 0))

  let targetDateIST: Date
  if (nextHour !== undefined) {
    targetDateIST = new Date(istNow)
    targetDateIST.setUTCHours(nextHour, 0, 0, 0)
  } else {
    // Tomorrow at 00:00 IST
    targetDateIST = new Date(istNow)
    targetDateIST.setUTCDate(targetDateIST.getUTCDate() + 1)
    targetDateIST.setUTCHours(0, 0, 0, 0)
  }

  return new Date(targetDateIST.getTime() - istOffset)
}

function getNextMonday10AmIST(): Date {
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  const istNow = new Date(now.getTime() + istOffset)

  const dayOfWeek = istNow.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const istHours = istNow.getUTCHours()
  const istMinutes = istNow.getUTCMinutes()

  let daysUntilMonday = 0
  if (dayOfWeek === 1 && (istHours < 10 || (istHours === 10 && istMinutes === 0))) {
    daysUntilMonday = 0
  } else {
    daysUntilMonday = ((1 - dayOfWeek + 7) % 7) || 7
  }

  const targetDateIST = new Date(istNow)
  targetDateIST.setUTCDate(targetDateIST.getUTCDate() + daysUntilMonday)
  targetDateIST.setUTCHours(10, 0, 0, 0)

  return new Date(targetDateIST.getTime() - istOffset)
}

export default function ScheduledTaskCountdown({ variant = 'dashboard' }: { variant?: 'dashboard' | 'compact' }) {
  const [tokenTime, setTokenTime] = useState<TimeRemaining>({ days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 })
  const [noticeTime, setNoticeTime] = useState<TimeRemaining>({ days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)

    function update() {
      const nextToken = getNextTokenRefreshIST()
      const nextNotice = getNextMonday10AmIST()

      setTokenTime(calculateTimeRemaining(nextToken))
      setNoticeTime(calculateTimeRemaining(nextNotice))
    }

    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [])

  if (!mounted) {
    return null
  }

  if (variant === 'compact') {
    return (
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ background: 'rgb(245, 243, 255)', border: '1px solid rgb(221, 214, 254)', borderRadius: '0.375rem', padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'rgb(109, 40, 217)' }}>
          <Zap size={13} />
          <span>Next Refresh: <strong>{formatCountdown(tokenTime, false)}</strong></span>
        </div>
        <div style={{ background: 'rgb(239, 246, 255)', border: '1px solid rgb(191, 219, 254)', borderRadius: '0.375rem', padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'rgb(29, 78, 216)' }}>
          <Calendar size={13} />
          <span>Monday 10 AM Run: <strong>{formatCountdown(noticeTime, true)}</strong></span>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgb(248, 250, 252) 0%, rgb(241, 245, 249) 100%)',
        border: '1px solid rgb(226, 232, 240)',
        borderRadius: '0.75rem',
        padding: '0.875rem 1.25rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
      }}
    >
      {/* Left: Earliest Task Banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '0.5rem',
            background: 'rgb(238, 242, 255)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgb(79, 70, 229)',
          }}
        >
          <Clock size={18} />
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
            Scheduled Automation Countdown
          </div>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'rgb(15, 23, 42)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>Next Task:</span>
            <span style={{ color: 'rgb(79, 70, 229)' }}>Token Refresh in {formatCountdown(tokenTime, false)}</span>
          </div>
        </div>
      </div>

      {/* Right: Individual Task Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {/* Token Refresh Badge */}
        <div
          style={{
            background: 'white',
            border: '1px solid rgb(221, 214, 254)',
            borderRadius: '0.5rem',
            padding: '0.4rem 0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.8rem',
          }}
        >
          <Zap size={14} color="rgb(124, 58, 237)" />
          <div>
            <span style={{ color: 'rgb(100, 116, 139)', fontSize: '0.7rem' }}>5-Hr Refresh: </span>
            <strong style={{ color: 'rgb(109, 40, 217)', fontFamily: 'ui-monospace, monospace' }}>
              {formatCountdown(tokenTime, false)}
            </strong>
          </div>
        </div>

        {/* Monday Notice Check Badge */}
        <div
          style={{
            background: 'white',
            border: '1px solid rgb(191, 219, 254)',
            borderRadius: '0.5rem',
            padding: '0.4rem 0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.8rem',
          }}
        >
          <Calendar size={14} color="rgb(37, 99, 235)" />
          <div>
            <span style={{ color: 'rgb(100, 116, 139)', fontSize: '0.7rem' }}>Monday 10 AM Run: </span>
            <strong style={{ color: 'rgb(29, 78, 216)', fontFamily: 'ui-monospace, monospace' }}>
              {formatCountdown(noticeTime, true)}
            </strong>
          </div>
        </div>
      </div>
    </div>
  )
}
