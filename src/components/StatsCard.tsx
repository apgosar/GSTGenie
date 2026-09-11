'use client'
import { ReactNode } from 'react'

interface StatsCardProps {
  title: string
  value: number | string
  icon: ReactNode
  subtitle?: string
  highlight?: boolean
  color?: string
}

export default function StatsCard({
  title,
  value,
  icon,
  subtitle,
  highlight,
  color = 'rgb(37, 99, 235)',
}: StatsCardProps) {
  return (
    <div
      className="card"
      style={{
        borderLeft: highlight ? `4px solid ${color}` : undefined,
        background: highlight ? `rgba(${color === 'rgb(37, 99, 235)' ? '37, 99, 235' : '220, 38, 38'}, 0.04)` : 'white',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: '0.75rem', fontWeight: 500, color: 'rgb(100, 116, 139)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            {title}
          </p>
          <p
            style={{
              fontSize: '2rem',
              fontWeight: 700,
              color: highlight ? color : 'rgb(15, 23, 42)',
              lineHeight: 1,
              marginBottom: subtitle ? '0.375rem' : 0,
            }}
          >
            {value}
          </p>
          {subtitle && (
            <p style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)' }}>{subtitle}</p>
          )}
        </div>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '0.625rem',
            background: `rgba(${color === 'rgb(37, 99, 235)' ? '37, 99, 235' : color === 'rgb(220, 38, 38)' ? '220, 38, 38' : color === 'rgb(22, 163, 74)' ? '22, 163, 74' : '234, 179, 8'}, 0.1)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color,
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  )
}
