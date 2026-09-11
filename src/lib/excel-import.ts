import * as XLSX from 'xlsx'
import { validateGSTIN, getStateCodeFromGSTIN, DEFAULT_CA_EMAIL } from './utils'

export interface ParsedClientRow {
  name: string
  gstin: string
  gstUsername: string
  email: string
  phone?: string
  stateCode: string
}

export interface InvalidRow {
  rowNumber: number
  reason: string
  data: Record<string, any>
}

export interface ParseResult {
  valid: ParsedClientRow[]
  invalid: InvalidRow[]
  totalRows: number
}

function normalizeHeader(h: string): string {
  return String(h || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function parseClientSpreadsheet(buffer: ArrayBuffer | Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    return { valid: [], invalid: [], totalRows: 0 }
  }

  const sheet = workbook.Sheets[firstSheetName]
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

  const valid: ParsedClientRow[] = []
  const invalid: InvalidRow[] = []
  const seenGSTINs = new Set<string>()

  rows.forEach((row, index) => {
    const rowNumber = index + 2 // 1-based index accounting for header

    // Normalize keys
    const normalizedRow: Record<string, string> = {}
    for (const [key, value] of Object.entries(row)) {
      normalizedRow[normalizeHeader(key)] = String(value ?? '').trim()
    }

    // Smart Column Matching
    const name =
      normalizedRow['name'] ||
      normalizedRow['clientname'] ||
      normalizedRow['businessname'] ||
      normalizedRow['tradename'] ||
      normalizedRow['taxpayername'] ||
      normalizedRow['companyname'] ||
      ''

    const rawGSTIN = (
      normalizedRow['gstin'] ||
      normalizedRow['gstno'] ||
      normalizedRow['gstnumber'] ||
      normalizedRow['gst'] ||
      ''
    ).toUpperCase()

    const gstUsername =
      normalizedRow['gstusername'] ||
      normalizedRow['username'] ||
      normalizedRow['portalusername'] ||
      normalizedRow['gstuser'] ||
      normalizedRow['loginid'] ||
      normalizedRow['user'] ||
      ''

    const email =
      normalizedRow['email'] ||
      normalizedRow['emailid'] ||
      normalizedRow['clientemail'] ||
      normalizedRow['mail'] ||
      DEFAULT_CA_EMAIL

    const phone =
      normalizedRow['phone'] ||
      normalizedRow['mobile'] ||
      normalizedRow['contact'] ||
      normalizedRow['phonenumber'] ||
      normalizedRow['mobilenumber'] ||
      ''

    const stateCode =
      normalizedRow['statecode'] ||
      normalizedRow['statecd'] ||
      normalizedRow['state'] ||
      (rawGSTIN ? getStateCodeFromGSTIN(rawGSTIN) : '')

    // Validate
    if (!name) {
      invalid.push({ rowNumber, reason: 'Missing Client/Business Name', data: row })
      return
    }

    if (!rawGSTIN) {
      invalid.push({ rowNumber, reason: 'Missing GSTIN', data: row })
      return
    }

    if (rawGSTIN.length !== 15) {
      invalid.push({ rowNumber, reason: `GSTIN must be 15 characters (got ${rawGSTIN.length})`, data: row })
      return
    }

    if (!validateGSTIN(rawGSTIN)) {
      invalid.push({ rowNumber, reason: `Invalid GSTIN format: ${rawGSTIN}`, data: row })
      return
    }

    if (seenGSTINs.has(rawGSTIN)) {
      invalid.push({ rowNumber, reason: `Duplicate GSTIN in sheet: ${rawGSTIN}`, data: row })
      return
    }

    if (!gstUsername) {
      invalid.push({ rowNumber, reason: 'Missing GST Username', data: row })
      return
    }

    seenGSTINs.add(rawGSTIN)

    valid.push({
      name,
      gstin: rawGSTIN,
      gstUsername,
      email: email || DEFAULT_CA_EMAIL,
      phone: phone || undefined,
      stateCode: stateCode || rawGSTIN.slice(0, 2),
    })
  })

  return {
    valid,
    invalid,
    totalRows: rows.length,
  }
}

export function generateClientTemplateWorkbook(): Buffer {
  const data = [
    {
      'Client Name': 'SCALE THE DESIGNER CONCEPT',
      'GSTIN': '27AFNPN4879E1ZW',
      'GST Username': 'shivam_mavji',
      'Email': DEFAULT_CA_EMAIL,
      'Phone': '9876543210',
    },
    {
      'Client Name': 'Sample Enterprise Pvt Ltd',
      'GSTIN': '27AABCU9603R1ZM',
      'GST Username': 'sample_user',
      'Email': DEFAULT_CA_EMAIL,
      'Phone': '9812345678',
    },
  ]

  const worksheet = XLSX.utils.json_to_sheet(data)

  // Set column widths
  worksheet['!cols'] = [
    { wch: 32 }, // Client Name
    { wch: 20 }, // GSTIN
    { wch: 20 }, // GST Username
    { wch: 32 }, // Email
    { wch: 16 }, // Phone
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Clients')

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}
