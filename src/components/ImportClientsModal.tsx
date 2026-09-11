'use client'
import { useState, useRef } from 'react'
import { X, Upload, FileSpreadsheet, Download, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { parseClientSpreadsheet, ParsedClientRow, InvalidRow } from '@/lib/excel-import'

interface ImportClientsModalProps {
  onClose: () => void
  onSuccess: () => void
}

export default function ImportClientsModal({ onClose, onSuccess }: ImportClientsModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [validClients, setValidClients] = useState<ParsedClientRow[]>([])
  const [invalidRows, setInvalidRows] = useState<InvalidRow[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(selectedFile: File) {
    setFile(selectedFile)
    setParsing(true)
    setValidClients([])
    setInvalidRows([])

    try {
      const buffer = await selectedFile.arrayBuffer()
      const result = parseClientSpreadsheet(buffer)
      setValidClients(result.valid)
      setInvalidRows(result.invalid)

      if (result.valid.length === 0) {
        toast.error('No valid client rows detected in the spreadsheet.')
      } else {
        toast.info(`Found ${result.valid.length} valid client(s) ready to import.`)
      }
    } catch (err) {
      console.error('Error parsing file:', err)
      toast.error('Failed to parse spreadsheet. Please ensure it is a valid .xlsx, .xls, or .csv file.')
    } finally {
      setParsing(false)
    }
  }

  async function handleConfirmImport() {
    if (validClients.length === 0) return

    setImporting(true)
    try {
      const res = await fetch('/api/clients/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clients: validClients }),
      })

      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to import clients')
        return
      }

      toast.success(data.message || `Successfully imported ${validClients.length} clients!`)
      onSuccess()
      onClose()
    } catch {
      toast.error('Network error during import.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: '50rem', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgb(226, 232, 240)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '0.5rem',
                background: 'rgb(236, 253, 245)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgb(5, 150, 105)',
              }}
            >
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Import Clients from Excel / CSV</h2>
              <p style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)', margin: 0 }}>
                Bulk import your 70+ clients in seconds (.xlsx, .xls, .csv)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: '0.375rem' }}>
            <X size={16} />
          </button>
        </div>

        {/* Upload Zone & Template Bar */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'stretch' }}>
          {/* Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              flex: 1,
              border: '2px dashed rgb(203, 213, 225)',
              borderRadius: '0.75rem',
              padding: '1.25rem',
              textAlign: 'center',
              cursor: 'pointer',
              background: 'rgb(248, 250, 252)',
              transition: 'border-color 0.2s',
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".xlsx, .xls, .csv"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileChange(e.target.files[0])
              }}
            />
            <Upload size={24} style={{ color: 'rgb(37, 99, 235)', margin: '0 auto 0.5rem' }} />
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgb(15, 23, 42)' }}>
              {file ? file.name : 'Click or Drag & Drop Excel spreadsheet'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'rgb(100, 116, 139)', marginTop: '0.25rem' }}>
              Supports .xlsx, .xls, and .csv formats
            </div>
          </div>

          {/* Template Download Box */}
          <div
            style={{
              width: 220,
              border: '1px solid rgb(226, 232, 240)',
              borderRadius: '0.75rem',
              padding: '1rem',
              background: 'white',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', color: 'rgb(51, 65, 85)' }}>
              Need the format?
            </div>
            <a
              href="/api/clients/template"
              download="clients_import_template.xlsx"
              className="btn btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <Download size={13} /> Download Template
            </a>
          </div>
        </div>

        {/* Parsing Loader */}
        {parsing && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '2rem', color: 'rgb(100, 116, 139)' }}>
            <Loader2 size={20} className="animate-spin" />
            Reading & validating spreadsheet...
          </div>
        )}

        {/* Validation & Preview Summary */}
        {!parsing && (validClients.length > 0 || invalidRows.length > 0) && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Status counters */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'rgb(5, 150, 105)',
                  background: 'rgb(236, 253, 245)',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '0.375rem',
                }}
              >
                <CheckCircle size={14} /> {validClients.length} Valid Client{validClients.length !== 1 ? 's' : ''}
              </div>

              {invalidRows.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'rgb(220, 38, 38)',
                    background: 'rgb(254, 242, 242)',
                    padding: '0.35rem 0.65rem',
                    borderRadius: '0.375rem',
                  }}
                >
                  <AlertCircle size={14} /> {invalidRows.length} Row{invalidRows.length !== 1 ? 's' : ''} Skipped
                </div>
              )}
            </div>

            {/* Invalid rows warnings */}
            {invalidRows.length > 0 && (
              <div
                style={{
                  background: 'rgb(254, 242, 242)',
                  border: '1px solid rgb(254, 202, 202)',
                  borderRadius: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  marginBottom: '0.75rem',
                  maxHeight: '90px',
                  overflowY: 'auto',
                  fontSize: '0.75rem',
                  color: 'rgb(185, 28, 28)',
                }}
              >
                <strong>Skipped Rows:</strong>
                <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1.2rem' }}>
                  {invalidRows.map((inv, i) => (
                    <li key={i}>
                      Row {inv.rowNumber}: {inv.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Preview Table */}
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid rgb(226, 232, 240)', borderRadius: '0.5rem', maxHeight: '260px' }}>
              <table style={{ margin: 0, fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Client Name</th>
                    <th>GSTIN</th>
                    <th>GST Username</th>
                    <th>Email</th>
                    <th>Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {validClients.map((client, idx) => (
                    <tr key={idx}>
                      <td style={{ color: 'rgb(148, 163, 184)' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 500 }}>{client.name}</td>
                      <td>
                        <code style={{ fontSize: '0.75rem' }}>{client.gstin}</code>
                      </td>
                      <td>{client.gstUsername}</td>
                      <td style={{ fontSize: '0.75rem', color: 'rgb(71, 85, 105)' }}>{client.email}</td>
                      <td>{client.phone || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid rgb(226, 232, 240)' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={importing}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleConfirmImport}
            disabled={validClients.length === 0 || importing}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            {importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {importing ? 'Importing Clients...' : `Import ${validClients.length} Client${validClients.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
