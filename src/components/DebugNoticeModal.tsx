'use client'
import { useState } from 'react'
import { X, Bug, RefreshCw, Copy, Check, Play, AlertCircle, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { format, subDays } from 'date-fns'

interface DebugInfo {
  url?: string
  params?: Record<string, string>
  headers?: Record<string, string>
  httpStatus?: number
  statusText?: string
  rawBody?: string
  parsedData?: unknown
  extractedCount?: number
}

interface DebugNoticeModalProps {
  clientId: string
  clientName: string
  gstin: string
  gstUsername: string
  initialDebug?: DebugInfo | null
  initialRaw?: string | null
  onClose: () => void
  onRefresh?: () => void
}

export default function DebugNoticeModal({
  clientId,
  clientName,
  gstin,
  gstUsername,
  initialDebug,
  initialRaw,
  onClose,
  onRefresh,
}: DebugNoticeModalProps) {
  // Default to (Today - 60 days) formatted as DD/MM/YYYY
  const [customDate, setCustomDate] = useState(() => {
    return format(subDays(new Date(), 60), 'dd/MM/yyyy')
  })
  const [loading, setLoading] = useState(false)
  const [debugData, setDebugData] = useState<DebugInfo | null>(initialDebug || null)
  const [rawText, setRawText] = useState<string>(
    initialRaw || (initialDebug?.rawBody ? initialDebug.rawBody : '')
  )
  const [lastError, setLastError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleTestFetch(dateToTest?: string) {
    const targetDate = dateToTest || customDate
    setLoading(true)
    setLastError(null)

    try {
      const res = await fetch('/api/notices/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, customDate: targetDate }),
      })

      const data = await res.json()
      if (data.debug) {
        setDebugData(data.debug)
        setRawText(data.debug.rawBody || JSON.stringify(data.raw || {}, null, 2))
      } else {
        setRawText(JSON.stringify(data, null, 2))
      }

      if (res.ok && data.success) {
        toast.success(`Success! Fetched ${data.total} notices (${data.newNotices} new)`)
        onRefresh?.()
      } else {
        const msg = data.error || 'API request failed'
        setLastError(msg)
        toast.error(msg)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network request failed'
      setLastError(msg)
      toast.error(msg)
      setRawText(String(err))
    } finally {
      setLoading(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(rawText)
    setCopied(true)
    toast.success('Raw JSON copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  const datePresets = [
    { label: 'Today - 60 days (Auto)', value: format(subDays(new Date(), 60), 'dd/MM/yyyy') },
    { label: '26/06/2026', value: '26/06/2026' },
    { label: '02/05/2025', value: '02/05/2025' },
    { label: 'Today', value: format(new Date(), 'dd/MM/yyyy') },
  ]

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: '52rem', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgb(226, 232, 240)', paddingBottom: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '0.5rem',
                background: 'rgb(254, 243, 199)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgb(180, 83, 9)',
              }}
            >
              <Bug size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                WhiteBooks API Inspector & Tester
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)', margin: 0 }}>
                {clientName} · GSTIN: <strong>{gstin}</strong> · User: <strong>{gstUsername}</strong>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: '0.375rem' }}>
            <X size={16} />
          </button>
        </div>

        {/* Controls */}
        <div style={{ background: 'rgb(248, 250, 252)', borderRadius: '0.5rem', padding: '0.875rem 1rem', marginBottom: '1rem', border: '1px solid rgb(226, 232, 240)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Query Date (Today - 60 days):</label>
              <input
                type="text"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                placeholder="e.g. 26/06/2026 or 02/05/2025"
                style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={() => handleTestFetch()}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: 38 }}
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
              {loading ? 'Calling API...' : 'Test getnotices API'}
            </button>
          </div>

          {/* Quick presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem', color: 'rgb(100, 116, 139)' }}>Quick Date Presets:</span>
            {datePresets.map((p) => (
              <button
                key={p.label}
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                onClick={() => {
                  setCustomDate(p.value)
                  handleTestFetch(p.value)
                }}
              >
                <Calendar size={11} /> {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error diagnosis callout */}
        {lastError && (
          <div style={{ background: 'rgb(254, 226, 226)', border: '1px solid rgb(252, 165, 165)', borderRadius: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1rem', color: 'rgb(185, 28, 28)', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              <AlertCircle size={16} /> API Error: {lastError}
            </div>
          </div>
        )}

        {/* Debug Overview Card */}
        {debugData && (
          <div style={{ background: 'rgb(240, 249, 255)', border: '1px solid rgb(186, 230, 253)', borderRadius: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.8rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
              <div>
                <strong>HTTP Status:</strong>{' '}
                <span className={`badge ${debugData.httpStatus === 200 ? 'badge-success' : 'badge-error'}`}>
                  {debugData.httpStatus} {debugData.statusText}
                </span>
              </div>
              <div>
                <strong>Notices Found:</strong>{' '}
                <span style={{ fontWeight: 700, color: debugData.extractedCount && debugData.extractedCount > 0 ? 'rgb(22, 163, 74)' : 'rgb(220, 38, 38)' }}>
                  {debugData.extractedCount ?? 0} notices
                </span>
              </div>
              <div style={{ gridColumn: '1 / -1', wordBreak: 'break-all', fontSize: '0.75rem', color: 'rgb(71, 85, 105)' }}>
                <strong>Request URL:</strong> {debugData.url}
              </div>
            </div>
          </div>
        )}

        {/* Raw Response Viewer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgb(51, 65, 85)' }}>
              Raw Response Payload:
            </span>
            <button className="btn btn-secondary" onClick={handleCopy} disabled={!rawText} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
              {copied ? <Check size={12} color="green" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy Response'}
            </button>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              background: 'rgb(15, 23, 42)',
              color: 'rgb(226, 232, 240)',
              borderRadius: '0.5rem',
              padding: '1rem',
              fontFamily: 'Consolas, Monaco, monospace',
              fontSize: '0.75rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              maxHeight: '300px',
              border: '1px solid rgb(51, 65, 85)',
            }}
          >
            {rawText ? (
              (() => {
                try {
                  return JSON.stringify(JSON.parse(rawText), null, 2)
                } catch {
                  return rawText
                }
              })()
            ) : (
              <span style={{ color: 'rgb(100, 116, 139)' }}>
                Click &quot;Test getnotices API&quot; above to inspect the live response from WhiteBooks.
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgb(226, 232, 240)' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
