'use client'
import React, { useState } from 'react'
import { format } from 'date-fns'
import { ChevronDown, ChevronUp, Eye, EyeOff, FileText, Calendar, Paperclip, Info, Folder } from 'lucide-react'
import NewNoticeBadge from './NewNoticeBadge'
import { toast } from 'sonner'

interface NoticeDoc {
  dcupdtls?: {
    ct?: string
    docName?: string
    ty?: string
    id?: string
    hash?: string
  }
}

interface Notice {
  id: string
  clientId: string
  refId: string
  noticeType?: string
  section?: string
  taxPeriod?: string
  dueDate?: string
  issuedDate?: string
  description?: string
  status?: string
  isNew: boolean
  createdAt: string
  rawData: string
  client?: { id: string; name: string; gstin: string }
}

interface NoticeTableProps {
  notices: Notice[]
  showClient?: boolean
  onUpdate?: () => void
}

function formatTaxPeriodDisplay(rawTaxPeriod: any, savedTaxPeriod?: string): string {
  if (typeof rawTaxPeriod === 'object' && rawTaxPeriod !== null) {
    const { fromMonth, fromYear, toMonth, toYear } = rawTaxPeriod
    if (fromMonth && fromYear && toMonth && toYear) {
      const fy = fromYear !== toYear ? ` (FY ${fromYear}-${String(toYear).slice(-2)})` : ` (FY ${fromYear})`
      return `${fromMonth} ${fromYear} - ${toMonth} ${toYear}${fy}`
    }
  }
  if (savedTaxPeriod && savedTaxPeriod !== '[object Object]' && savedTaxPeriod.trim() !== '') {
    return savedTaxPeriod
  }
  return '—'
}

export default function NoticeTable({ notices, showClient = false, onUpdate }: NoticeTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [markingRead, setMarkingRead] = useState<string | null>(null)

  async function handleMarkRead(noticeId: string, e: React.MouseEvent) {
    e.stopPropagation()
    setMarkingRead(noticeId)
    try {
      const res = await fetch(`/api/notices/${noticeId}/mark-read`, { method: 'PUT' })
      if (res.ok) {
        toast.success('Marked as read')
        onUpdate?.()
      }
    } catch {
      toast.error('Failed to mark as read')
    } finally {
      setMarkingRead(null)
    }
  }

  if (notices.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'rgb(100, 116, 139)' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
        <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>No notices found</div>
        <div style={{ fontSize: '0.85rem' }}>Fetch notices from an authenticated client to see them here.</div>
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            {showClient && <th>Client</th>}
            <th>Notice Type</th>
            <th>Section</th>
            <th>Tax Period</th>
            <th>Issued Date</th>
            <th>Due Date of Reply</th>
            <th>Status</th>
            <th style={{ width: 80 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {notices.map((notice) => {
            let rawObj: Record<string, any> = {}
            try {
              rawObj = JSON.parse(notice.rawData || '{}')
            } catch {
              rawObj = {}
            }

            const dataNest = rawObj.data || {}

            const maindocs: NoticeDoc[] = Array.isArray(rawObj.maindocs)
              ? rawObj.maindocs
              : Array.isArray(dataNest.maindocs)
              ? dataNest.maindocs
              : []

            const suppdocs: NoticeDoc[] = Array.isArray(rawObj.suppdocs)
              ? rawObj.suppdocs
              : Array.isArray(dataNest.suppdocs)
              ? dataNest.suppdocs
              : []

            const dueDate =
              notice.dueDate && notice.dueDate.trim() !== ''
                ? notice.dueDate
                : String(rawObj.dueDateOfReply || rawObj.dueDate || dataNest.dueDateOfReply || dataNest.dueDate || '')

            const issuedDate =
              notice.issuedDate && notice.issuedDate.trim() !== ''
                ? notice.issuedDate
                : String(rawObj.dateOfIssue || rawObj.issuedDate || dataNest.dateOfIssue || dataNest.issuedDate || '')

            const arn = String(rawObj.arn || dataNest.arn || notice.refId)
            const rawTaxPeriod = rawObj.taxPeriod || dataNest.taxPeriod
            const taxPeriodDisplay = formatTaxPeriodDisplay(rawTaxPeriod, notice.taxPeriod)

            return (
              <React.Fragment key={notice.id}>
                <tr
                  className={notice.isNew ? 'notice-row-new' : ''}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setExpanded(expanded === notice.id ? null : notice.id)}
                >
                  {showClient && (
                    <td>
                      <div style={{ fontWeight: 500 }}>{notice.client?.name ?? '—'}</div>
                      <div style={{ fontSize: '0.7rem', color: 'rgb(100, 116, 139)', fontFamily: 'monospace' }}>
                        {notice.client?.gstin}
                      </div>
                    </td>
                  )}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {notice.isNew && <NewNoticeBadge />}
                      <span style={{ fontWeight: notice.isNew ? 600 : 500, color: 'rgb(15, 23, 42)' }}>
                        {notice.noticeType || '—'}
                      </span>
                    </div>
                    {(maindocs.length > 0 || suppdocs.length > 0) && (
                      <div style={{ fontSize: '0.7rem', color: 'rgb(37, 99, 235)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {maindocs.length > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                            <FileText size={11} /> {maindocs.length} Main Doc{maindocs.length > 1 ? 's' : ''}
                          </span>
                        )}
                        {suppdocs.length > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: 'rgb(100, 116, 139)' }}>
                            <Paperclip size={11} /> {suppdocs.length} Supporting Doc{suppdocs.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td>{notice.section || '—'}</td>
                  <td>{taxPeriodDisplay}</td>
                  <td>
                    {issuedDate || (notice.createdAt ? format(new Date(notice.createdAt), 'dd MMM yyyy') : '—')}
                  </td>
                  <td>
                    <span
                      style={{
                        color: dueDate ? 'rgb(220, 38, 38)' : 'rgb(100, 116, 139)',
                        fontWeight: dueDate ? 600 : 400,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      {dueDate && <Calendar size={12} />}
                      {dueDate || '—'}
                    </span>
                  </td>
                  <td>
                    {notice.status ? (
                      <span className="badge badge-pending" style={{ fontSize: '0.7rem' }}>
                        {notice.status}
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                      {notice.isNew && (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem' }}
                          onClick={(e) => handleMarkRead(notice.id, e)}
                          disabled={markingRead === notice.id}
                          title="Mark as read"
                        >
                          {markingRead === notice.id ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      )}
                      {expanded === notice.id ? (
                        <ChevronUp size={14} style={{ color: 'rgb(100, 116, 139)' }} />
                      ) : (
                        <ChevronDown size={14} style={{ color: 'rgb(100, 116, 139)' }} />
                      )}
                    </div>
                  </td>
                </tr>

                {/* Expanded details row */}
                {expanded === notice.id && (
                  <tr>
                    <td colSpan={showClient ? 8 : 7} style={{ background: 'rgb(248, 250, 252)', padding: '1.25rem' }}>
                      {/* Notice Key Metadata */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem', background: 'white', padding: '1rem', borderRadius: '0.5rem', border: '1px solid rgb(226, 232, 240)' }}>
                        <div>
                          <div style={{ fontSize: '0.7rem', color: 'rgb(100, 116, 139)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Notice Type</div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{notice.noticeType || '—'}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.7rem', color: 'rgb(100, 116, 139)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Reference / ARN</div>
                          <code style={{ fontSize: '0.8rem', background: 'rgb(241, 245, 249)', padding: '0.1rem 0.3rem', borderRadius: '0.25rem' }}>
                            {arn}
                          </code>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.7rem', color: 'rgb(100, 116, 139)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Due Date of Reply</div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: dueDate ? 'rgb(220, 38, 38)' : 'inherit' }}>
                            {dueDate || '—'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.7rem', color: 'rgb(100, 116, 139)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Tax Period</div>
                          <div style={{ fontSize: '0.85rem' }}>{taxPeriodDisplay}</div>
                        </div>
                      </div>

                      {/* Main Documents Section */}
                      {maindocs.length > 0 && (
                        <div style={{ marginBottom: '1.25rem' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgb(30, 58, 138)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Folder size={15} color="rgb(37, 99, 235)" /> Main Documents ({maindocs.length})
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
                            {maindocs.map((doc, idx) => {
                              const dtls = doc.dcupdtls || {}
                              return (
                                <div
                                  key={idx}
                                  style={{
                                    background: 'white',
                                    border: '1px solid rgb(191, 219, 254)',
                                    borderRadius: '0.5rem',
                                    padding: '0.75rem 1rem',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '0.75rem',
                                  }}
                                >
                                  <div
                                    style={{
                                      width: 32,
                                      height: 32,
                                      borderRadius: '0.375rem',
                                      background: 'rgb(239, 246, 255)',
                                      color: 'rgb(37, 99, 235)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0,
                                    }}
                                  >
                                    <FileText size={16} />
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, wordBreak: 'break-all', color: 'rgb(15, 23, 42)' }}>
                                      {dtls.docName || `MainDocument-${idx + 1}.pdf`}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'rgb(100, 116, 139)', marginTop: '0.2rem' }}>
                                      Doc ID: <code>{dtls.id || 'N/A'}</code> · Type: {dtls.ty || 'PDF'}
                                    </div>
                                    {dtls.hash && (
                                      <div style={{ fontSize: '0.65rem', color: 'rgb(148, 163, 184)', marginTop: '0.2rem', fontFamily: 'monospace' }}>
                                        SHA-256: {dtls.hash.slice(0, 16)}...
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Supporting Documents Section */}
                      {suppdocs.length > 0 && (
                        <div style={{ marginBottom: '1.25rem' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgb(71, 85, 105)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Paperclip size={15} color="rgb(100, 116, 139)" /> Supporting Documents & Annexures ({suppdocs.length})
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
                            {suppdocs.map((doc, idx) => {
                              const dtls = doc.dcupdtls || {}
                              return (
                                <div
                                  key={idx}
                                  style={{
                                    background: 'white',
                                    border: '1px solid rgb(226, 232, 240)',
                                    borderRadius: '0.5rem',
                                    padding: '0.75rem 1rem',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '0.75rem',
                                  }}
                                >
                                  <div
                                    style={{
                                      width: 32,
                                      height: 32,
                                      borderRadius: '0.375rem',
                                      background: 'rgb(241, 245, 249)',
                                      color: 'rgb(71, 85, 105)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0,
                                    }}
                                  >
                                    <Paperclip size={16} />
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, wordBreak: 'break-all', color: 'rgb(15, 23, 42)' }}>
                                      {dtls.docName || `SupportingDoc-${idx + 1}.pdf`}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'rgb(100, 116, 139)', marginTop: '0.2rem' }}>
                                      Doc ID: <code>{dtls.id || 'N/A'}</code> · Type: {dtls.ty || 'PDF'}
                                    </div>
                                    {dtls.hash && (
                                      <div style={{ fontSize: '0.65rem', color: 'rgb(148, 163, 184)', marginTop: '0.2rem', fontFamily: 'monospace' }}>
                                        SHA-256: {dtls.hash.slice(0, 16)}...
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Informational Disclaimer on Document Download */}
                      {(maindocs.length > 0 || suppdocs.length > 0) && (
                        <div
                          style={{
                            background: 'rgb(241, 245, 249)',
                            border: '1px solid rgb(203, 213, 225)',
                            borderRadius: '0.5rem',
                            padding: '0.625rem 0.875rem',
                            marginBottom: '1rem',
                            fontSize: '0.75rem',
                            color: 'rgb(71, 85, 105)',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.5rem',
                          }}
                        >
                          <Info size={15} style={{ flexShrink: 0, marginTop: 2, color: 'rgb(100, 116, 139)' }} />
                          <div>
                            <strong>Document Metadata Notice:</strong> The document names, IDs, and cryptographic hashes listed above are metadata returned by the GST Portal. The PDF files themselves are stored on the GST portal servers and are <em>not available for direct binary download</em> through this API endpoint.
                          </div>
                        </div>
                      )}

                      {/* Raw Data Toggle */}
                      <details style={{ marginTop: '0.5rem' }}>
                        <summary style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)', cursor: 'pointer' }}>
                          View raw JSON payload
                        </summary>
                        <pre
                          style={{
                            fontSize: '0.7rem',
                            background: 'white',
                            padding: '0.75rem',
                            borderRadius: '0.375rem',
                            overflowX: 'auto',
                            marginTop: '0.5rem',
                            border: '1px solid rgb(226, 232, 240)',
                          }}
                        >
                          {JSON.stringify(rawObj, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
