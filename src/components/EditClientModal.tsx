'use client'
import React, { useState } from 'react'
import { X, Loader2, Edit3, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { INDIAN_STATES, validateGSTIN, getStateCodeFromGSTIN } from '@/lib/utils'

export interface EditableClient {
  id: string
  name: string
  gstin: string
  gstUsername: string
  email: string
  phone?: string | null
  stateCode: string
}

interface EditClientModalProps {
  client: EditableClient
  onClose: () => void
  onSuccess: (updated: EditableClient) => void
}

export default function EditClientModal({ client, onClose, onSuccess }: EditClientModalProps) {
  const [form, setForm] = useState({
    name: client.name || '',
    gstin: client.gstin || '',
    gstUsername: client.gstUsername || '',
    email: client.email || '',
    phone: client.phone || '',
    stateCode: client.stateCode || '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const isCredentialsChanged =
    form.gstin.trim().toUpperCase() !== client.gstin.toUpperCase() ||
    form.gstUsername.trim() !== client.gstUsername.trim()

  function handleGSTINChange(val: string) {
    const uppercase = val.toUpperCase().slice(0, 15)
    const autoStateCode = getStateCodeFromGSTIN(uppercase)
    setForm((f) => ({
      ...f,
      gstin: uppercase,
      stateCode: autoStateCode || f.stateCode,
    }))
    setErrors((er) => ({ ...er, gstin: '', stateCode: '' }))
  }

  function validate() {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Client / Business Name is required'
    if (!form.gstin.trim()) errs.gstin = 'GSTIN is required'
    else if (form.gstin.length !== 15) errs.gstin = 'GSTIN must be exactly 15 characters'
    else if (!validateGSTIN(form.gstin)) errs.gstin = 'Invalid GSTIN format'
    if (!form.gstUsername.trim()) errs.gstUsername = 'GST Username is required'
    if (!form.email.trim()) errs.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email address'
    if (!form.stateCode) errs.stateCode = 'State is required'
    return errs
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationErrors = validate()
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          gstin: form.gstin.trim().toUpperCase(),
          gstUsername: form.gstUsername.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          stateCode: form.stateCode,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to update client')
        return
      }

      toast.success(`Client "${form.name}" updated successfully!`)
      onSuccess(data)
    } catch {
      toast.error('Network error while updating client')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: '32rem', width: '100%' }}>
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
                background: 'rgb(239, 246, 255)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgb(37, 99, 235)',
              }}
            >
              <Edit3 size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Edit Client Details</h2>
              <p style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)', margin: 0 }}>
                Update GST credentials and contact information
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '0.375rem' }}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Client / Business Name *</label>
              <input
                type="text"
                placeholder="e.g. ABC Enterprises"
                value={form.name}
                onChange={(e) => {
                  setForm((f) => ({ ...f, name: e.target.value }))
                  setErrors((er) => ({ ...er, name: '' }))
                }}
                style={{ borderColor: errors.name ? 'rgb(220, 38, 38)' : undefined }}
              />
              {errors.name && (
                <div style={{ color: 'rgb(220, 38, 38)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {errors.name}
                </div>
              )}
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label>GSTIN * (State auto-populates from first 2 digits)</label>
              <input
                type="text"
                placeholder="e.g. 27AABCU9603R1ZM"
                value={form.gstin}
                onChange={(e) => handleGSTINChange(e.target.value)}
                style={{
                  fontFamily: 'monospace',
                  letterSpacing: '0.05em',
                  borderColor: errors.gstin ? 'rgb(220, 38, 38)' : undefined,
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                {errors.gstin ? (
                  <span style={{ color: 'rgb(220, 38, 38)', fontSize: '0.75rem' }}>{errors.gstin}</span>
                ) : (
                  <span />
                )}
                <span style={{ fontSize: '0.7rem', color: 'rgb(148, 163, 184)' }}>
                  {form.gstin.length}/15
                </span>
              </div>
            </div>

            <div>
              <label>GST Username *</label>
              <input
                type="text"
                placeholder="GST portal username"
                value={form.gstUsername}
                onChange={(e) => {
                  setForm((f) => ({ ...f, gstUsername: e.target.value }))
                  setErrors((er) => ({ ...er, gstUsername: '' }))
                }}
                style={{ borderColor: errors.gstUsername ? 'rgb(220, 38, 38)' : undefined }}
              />
              {errors.gstUsername && (
                <div style={{ color: 'rgb(220, 38, 38)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {errors.gstUsername}
                </div>
              )}
            </div>

            <div>
              <label>State Code *</label>
              <select
                value={form.stateCode}
                onChange={(e) => {
                  setForm((f) => ({ ...f, stateCode: e.target.value }))
                  setErrors((er) => ({ ...er, stateCode: '' }))
                }}
                style={{ borderColor: errors.stateCode ? 'rgb(220, 38, 38)' : undefined }}
              >
                <option value="">Select state...</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
              {errors.stateCode && (
                <div style={{ color: 'rgb(220, 38, 38)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {errors.stateCode}
                </div>
              )}
            </div>

            <div>
              <label>Email *</label>
              <input
                type="email"
                placeholder="ca@example.com"
                value={form.email}
                onChange={(e) => {
                  setForm((f) => ({ ...f, email: e.target.value }))
                  setErrors((er) => ({ ...er, email: '' }))
                }}
                style={{ borderColor: errors.email ? 'rgb(220, 38, 38)' : undefined }}
              />
              {errors.email && (
                <div style={{ color: 'rgb(220, 38, 38)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {errors.email}
                </div>
              )}
            </div>

            <div>
              <label>Phone (optional)</label>
              <input
                type="tel"
                placeholder="+91 XXXXX XXXXX"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
          </div>

          {/* Credential change notice */}
          {isCredentialsChanged && (
            <div
              style={{
                background: 'rgb(254, 243, 199)',
                border: '1px solid rgb(253, 230, 138)',
                borderRadius: '0.5rem',
                padding: '0.625rem 0.875rem',
                fontSize: '0.75rem',
                color: 'rgb(146, 64, 14)',
                marginBottom: '1.25rem',
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'flex-start',
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
              <div>
                <strong>Notice:</strong> Changing the GSTIN or GST Username will invalidate any current active session for this client. You will need to trigger a fresh OTP authentication afterwards.
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ minWidth: '120px', justifyContent: 'center' }}
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
