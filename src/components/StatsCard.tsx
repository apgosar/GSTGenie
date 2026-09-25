'use client'
import { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: number | string
  icon: ReactNode
  subtitle?: string
  highlight?: boolean
  color?: string
  href?: string
  onClick?: () => void
}

export default function StatsCard({
  title,
  value,
  icon,
  subtitle,
  highlight,
  color = 'rgb(37, 99, 235)',
  href,
  onClick,
}: StatsCardProps) {
  const isClickable = Boolean(href || onClick)

  const cardContent = (
    <div
      className={`card ${isClickable ? 'card-clickable' : ''}`}
      onClick={onClick}
      role={onClick && !href ? 'button' : undefined}
      tabIndex={onClick && !href ? 0 : undefined}
      style={{
        borderLeft: highlight ? `4px solid ${color}` : undefined,
        background: highlight
          ? `rgba(${color === 'rgb(37, 99, 235)' ? '37, 99, 235' : '220, 38, 38'}, 0.04)`
          : 'white',
        position: 'relative',
        height: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.5rem' }}>
            <p
              style={{
                fontSize: '0.75rem',
                fontWeight: 500,
                color: 'rgb(100, 116, 139)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                margin: 0,
              }}
            >
              {title}
            </p>
            {isClickable && (
              <ArrowUpRight
                size={13}
                style={{ color: 'rgb(148, 163, 184)', opacity: 0.8 }}
              />
            )}
          </div>
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
            <p style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)', margin: 0 }}>
              {subtitle}
            </p>
          )}
        </div>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '0.625rem',
            background: `rgba(${
              color === 'rgb(37, 99, 235)'
                ? '37, 99, 235'
                : color === 'rgb(220, 38, 38)'
                ? '220, 38, 38'
                : color === 'rgb(22, 163, 74)'
                ? '22, 163, 74'
                : '234, 179, 8'
            }, 0.1)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  )

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        {cardContent}
      </Link>
    )
  }

  return cardContent
}
