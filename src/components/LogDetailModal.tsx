'use client'
import React, { useState } from 'react'
import { X, Check, Copy, Activity, ArrowUpRight, ArrowDownLeft, Clock, ShieldCheck, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'

interface LogItem {
  id: string
  clientId: string
  fetchedAt: string
  noticesFound: number
  newNotices: number
  status: string
  errorMessage?: string | null
  rawResponse?: string | null
  logType: string
  client: {
    id: string
    name: string
    gstin: string
    gstUsername: string
    stateCode: string
  }
}

interface LogDetailModalProps {
  log: LogItem
  onClose: () => void
}

export default function LogDetailModal({ log, onClose }: LogDetailModalProps) {
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'response' | 'request' | 'all'>('response')

  let parsed: any = null
  let requestObj: any = null
  let responseObj: any = null

  if (log.rawResponse) {
    try {
      parsed = JSON.parse(log.rawResponse)
      if (parsed?.request) requestObj = parsed.request
      if (parsed?.response) responseObj = parsed.response
    } catch {
      parsed = log.rawResponse
    }
  }

  const rawJsonText = log.rawResponse
    ? (() => {
        try {
          return JSON.stringify(JSON.parse(log.rawResponse), null, 2)
        } catch {
          return log.rawResponse
        }
      })()
    : 'No raw payload recorded for this event.'

  function handleCopy() {
    navigator.clipboard.writeText(rawJsonText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: '48rem', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgb(226, 232, 240)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '0.5rem',
                background: log.status === 'success' ? 'rgb(240, 253, 244)' : 'rgb(254, 242, 242)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: log.status === 'success' ? 'rgb(22, 163, 74)' : 'rgb(220, 38, 38)',
              }}
            >
              <Activity size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>API Request & Response Details</h2>
                <span className={`badge ${log.status === 'success' ? 'badge-success' : 'badge-error'}`} style={{ fontSize: '0.7rem' }}>
                  {log.status.toUpperCase()}
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)', margin: '0.2rem 0 0' }}>
                {log.client.name} ({log.client.gstin}) · {format(new Date(log.fetchedAt), 'dd MMM yyyy, hh:mm:ss a')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: '0.375rem' }}>
            <X size={16} />
          </button>
        </div>

        {/* Quick summary grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ background: 'rgb(248, 250, 252)', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.5rem', padding: '0.625rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'rgb(100, 116, 139)' }}>Action Type</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '0.15rem' }}>
              {log.logType === 'notice_fetch' ? '📋 Notice Fetch' : log.logType === 'token_refresh' ? '🔄 Token Refresh' : log.logType === 'otp_request' ? '🔑 OTP Request' : '🛡️ Auth Token'}
            </div>
          </div>

          <div style={{ background: 'rgb(248, 250, 252)', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.5rem', padding: '0.625rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'rgb(100, 116, 139)' }}>GST Username</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '0.15rem' }}>{log.client.gstUsername}</div>
          </div>

          <div style={{ background: 'rgb(248, 250, 252)', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.5rem', padding: '0.625rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'rgb(100, 116, 139)' }}>Notices Returned</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '0.15rem' }}>
              {log.noticesFound} found ({log.newNotices} new)
            </div>
          </div>

          <div style={{ background: 'rgb(248, 250, 252)', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.5rem', padding: '0.625rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'rgb(100, 116, 139)' }}>Timestamp</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 500, marginTop: '0.15rem' }}>
              {format(new Date(log.fetchedAt), 'hh:mm:ss a')}
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgb(226, 232, 240)', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setActiveTab('response')}
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: 'none',
                background: 'none',
                borderBottom: activeTab === 'response' ? '2px solid rgb(37, 99, 235)' : 'none',
                color: activeTab === 'response' ? 'rgb(37, 99, 235)' : 'rgb(100, 116, 139)',
                cursor: 'pointer',
              }}
            >
              📥 Response Payload
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('request')}
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: 'none',
                background: 'none',
                borderBottom: activeTab === 'request' ? '2px solid rgb(37, 99, 235)' : 'none',
                color: activeTab === 'request' ? 'rgb(37, 99, 235)' : 'rgb(100, 116, 139)',
                cursor: 'pointer',
              }}
            >
              📡 Request Details
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: 'none',
                background: 'none',
                borderBottom: activeTab === 'all' ? '2px solid rgb(37, 99, 235)' : 'none',
                color: activeTab === 'all' ? 'rgb(37, 99, 235)' : 'rgb(100, 116, 139)',
                cursor: 'pointer',
              }}
            >
              🔍 Raw Combined JSON
            </button>
          </div>

          <button className="btn btn-secondary" onClick={handleCopy} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            {copied ? <Check size={12} color="rgb(22, 163, 74)" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy JSON'}
          </button>
        </div>

        {/* Tab 1: Response */}
        {activeTab === 'response' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {log.errorMessage && (
              <div
                style={{
                  background: 'rgb(254, 242, 242)',
                  border: '1px solid rgb(254, 202, 202)',
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  fontSize: '0.8rem',
                  color: 'rgb(185, 28, 28)',
                  marginBottom: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <AlertCircle size={15} /> {log.errorMessage}
              </div>
            )}

            <pre
              style={{
                flex: 1,
                overflow: 'auto',
                background: 'rgb(15, 23, 42)',
                color: 'rgb(226, 232, 240)',
                padding: '1rem',
                borderRadius: '0.5rem',
                fontSize: '0.8rem',
                lineHeight: 1.5,
                margin: 0,
                fontFamily: 'monospace',
                maxHeight: '350px',
              }}
            >
              {responseObj ? JSON.stringify(responseObj, null, 2) : rawJsonText}
            </pre>
          </div>
        )}

        {/* Tab 2: Request */}
        {activeTab === 'request' && (
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '350px' }}>
            {requestObj ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {requestObj.endpoint && (
                  <div style={{ background: 'rgb(248, 250, 252)', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.5rem', padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgb(100, 116, 139)' }}>API Endpoint</div>
                    <code style={{ fontSize: '0.85rem', color: 'rgb(37, 99, 235)' }}>{requestObj.endpoint}</code>
                  </div>
                )}

                {requestObj.url && (
                  <div style={{ background: 'rgb(248, 250, 252)', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.5rem', padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgb(100, 116, 139)' }}>Full Target URL</div>
                    <code style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{requestObj.url}</code>
                  </div>
                )}

                <div style={{ background: 'rgb(248, 250, 252)', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.5rem', padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgb(100, 116, 139)', marginBottom: '0.35rem' }}>Request Headers & Parameters</div>
                  <pre style={{ margin: 0, fontSize: '0.75rem', background: 'white', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid rgb(226, 232, 240)' }}>
                    {JSON.stringify({ ...requestObj.params, ...requestObj.headers, ...requestObj }, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'rgb(100, 116, 139)', fontSize: '0.85rem' }}>
                Request parameters were not recorded for this legacy log entry.
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Raw All */}
        {activeTab === 'all' && (
          <pre
            style={{
              flex: 1,
              overflow: 'auto',
              background: 'rgb(15, 23, 42)',
              color: 'rgb(226, 232, 240)',
              padding: '1rem',
              borderRadius: '0.5rem',
              fontSize: '0.8rem',
              lineHeight: 1.5,
              margin: 0,
              fontFamily: 'monospace',
              maxHeight: '350px',
            }}
          >
            {rawJsonText}
          </pre>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid rgb(226, 232, 240)' }}>
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
