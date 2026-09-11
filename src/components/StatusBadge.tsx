'use client'
import { CheckCircle, Clock, XCircle, AlertTriangle, Loader } from 'lucide-react'

type Status = 'authenticated' | 'pending' | 'expired' | 'error' | string

interface StatusBadgeProps {
  status: Status
  size?: 'sm' | 'md'
}

const STATUS_CONFIG: Record<string, { label: string; class: string; icon: React.ElementType }> = {
  authenticated: { label: 'Active', class: 'badge-success', icon: CheckCircle },
  pending: { label: 'Pending OTP', class: 'badge-pending', icon: Loader },
  expired: { label: 'Expired', class: 'badge-error', icon: XCircle },
  error: { label: 'Auth Error', class: 'badge-error', icon: AlertTriangle },
}

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, class: 'badge-pending', icon: Clock }
  const Icon = config.icon

  return (
    <span className={`badge ${config.class}`} style={{ fontSize: size === 'sm' ? '0.7rem' : '0.75rem' }}>
      <Icon size={size === 'sm' ? 10 : 12} />
      {config.label}
    </span>
  )
}
