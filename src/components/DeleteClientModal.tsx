'use client'
import React, { useState } from 'react'
import { X, Loader2, Trash2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

export interface DeletableClient {
  id: string
  name: string
  gstin: string
  totalNotices?: number
}

interface DeleteClientModalProps {
  client: DeletableClient
  onClose: () => void
  onSuccess: () => void
}

export default function DeleteClientModal({
  client,
  onClose,
  onSuccess,
}: DeleteClientModalProps) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to delete client')
        return
      }

      toast.success(`Client "${client.name}" has been permanently deleted.`)
      onSuccess()
    } catch {
      toast.error('Network error while deleting client')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: '28rem', width: '100%' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgb(226, 232, 240)',
            paddingBottom: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '0.5rem',
                background: 'rgb(254, 242, 242)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgb(220, 38, 38)',
              }}
            >
              <Trash2 size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'rgb(153, 27, 27)' }}>
                Delete Client
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)', margin: 0 }}>
                This action is permanent and cannot be undone
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '0.375rem' }}
            onClick={onClose}
            disabled={deleting}
          >
            <X size={16} />
          </button>
        </div>

        {/* Client Summary Box */}
        <div
          style={{
            background: 'rgb(248, 250, 252)',
            border: '1px solid rgb(226, 232, 240)',
            borderRadius: '0.5rem',
            padding: '0.875rem 1rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ fontWeight: 600, color: 'rgb(15, 23, 42)', fontSize: '0.95rem' }}>
            {client.name}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem', fontSize: '0.8rem', color: 'rgb(100, 116, 139)' }}>
            <span>GSTIN: <code style={{ fontWeight: 600 }}>{client.gstin}</code></span>
            {typeof client.totalNotices === 'number' && (
              <span>• {client.totalNotices} notice{client.totalNotices !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>

        {/* Warning Details */}
        <div
          style={{
            background: 'rgb(254, 242, 242)',
            border: '1px solid rgb(254, 202, 202)',
            borderRadius: '0.5rem',
            padding: '0.75rem 1rem',
            fontSize: '0.8rem',
            color: 'rgb(153, 27, 27)',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, marginBottom: '0.35rem' }}>
            <AlertTriangle size={15} />
            <span>Are you sure you want to delete this client?</span>
          </div>
          <div style={{ fontSize: '0.75rem', lineHeight: 1.5, color: 'rgb(185, 28, 28)' }}>
            Deleting this client will permanently erase:
            <ul style={{ margin: '0.35rem 0 0 1.25rem', padding: 0 }}>
              <li>Client credentials & GST configuration</li>
              <li>All fetched notices, tax periods & history</li>
              <li>All active and historical auth sessions</li>
              <li>All sync and fetch logs</li>
            </ul>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              fontWeight: 600,
              fontSize: '0.875rem',
              color: '#ffffff',
              background: 'rgb(220, 38, 38)',
              border: 'none',
              cursor: deleting ? 'not-allowed' : 'pointer',
              opacity: deleting ? 0.7 : 1,
            }}
          >
            {deleting ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Deleting...
              </>
            ) : (
              <>
                <Trash2 size={14} /> Delete Client
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
