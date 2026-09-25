import { DEFAULT_CA_EMAIL, DEFAULT_CA_IP, getStateCodeFromGSTIN } from './utils'

const BASE_URL = process.env.WHITEBOOKS_BASE_URL || 'https://api.whitebooks.in'
const CLIENT_ID = process.env.WHITEBOOKS_CLIENT_ID || ''
const CLIENT_SECRET = process.env.WHITEBOOKS_CLIENT_SECRET || ''

interface AuthHeaders {
  gst_username: string
  state_cd: string
  ip_address?: string
  txn?: string
}

export interface OTPRequestResult {
  success: boolean
  txn?: string
  message?: string
  raw?: unknown
  rawText?: string
  debug?: Record<string, unknown>
}

export interface AuthTokenResult {
  success: boolean
  txn?: string
  authToken?: string
  message?: string
  raw?: unknown
  rawText?: string
  debug?: Record<string, unknown>
}

export interface RefreshTokenResult {
  success: boolean
  message?: string
  raw?: unknown
  rawText?: string
  debug?: Record<string, unknown>
}

export interface NoticeListItem {
  refId?: string
  ref_id?: string
  noticeType?: string
  notice_type?: string
  section?: string
  taxPeriod?: string
  tax_period?: string
  dueDate?: string
  due_date?: string
  issuedDate?: string
  issued_date?: string
  description?: string
  status?: string
  [key: string]: unknown
}

export interface NoticeDetail {
  refId?: string
  [key: string]: unknown
}

export interface NoticeListResult {
  success: boolean
  notices: NoticeListItem[]
  message?: string
  raw?: unknown
  rawText?: string
  debug?: {
    url: string
    params: Record<string, string>
    headers: Record<string, string>
    httpStatus: number
    statusText: string
    rawBody: string
    parsedData: unknown
    extractedCount: number
  }
}

function buildHeaders(auth: AuthHeaders): Record<string, string> {
  const headers: Record<string, string> = {
    'gst_username': auth.gst_username,
    'gst-username': auth.gst_username,
    'state_cd': auth.state_cd,
    'state-cd': auth.state_cd,
    'ip_address': auth.ip_address || DEFAULT_CA_IP,
    'ip-usr': auth.ip_address || DEFAULT_CA_IP,
    'client_id': CLIENT_ID,
    'client_secret': CLIENT_SECRET,
  }
  if (auth.txn) headers['txn'] = auth.txn
  return headers
}

function extractErrorMessage(data: unknown, rawText: string): string {
  if (!data || typeof data !== 'object') return rawText || 'Unknown error'
  const obj = data as Record<string, unknown>

  if (obj.error && typeof obj.error === 'object') {
    const err = obj.error as Record<string, unknown>
    const code = String(err.errorCode || err.error_cd || err.code || '').trim()
    const msg = String(err.errorMessage || err.error_desc || err.message || err.msg || '').trim()
    const statusDesc = obj.status_desc ? String(obj.status_desc).trim() : ''

    // Specifically handle AUTH4041 with status_desc context
    if (code === 'AUTH4041') {
      const extra = statusDesc ? ` (${statusDesc})` : ''
      return `[AUTH4041] Invalid Parameter state-cd in request header${extra} — GST Portal could not find this GST Username for this state. Please verify the GST Username on services.gst.gov.in.`
    }

    if (code && msg) {
      const extra = statusDesc && !msg.toLowerCase().includes(statusDesc.toLowerCase()) ? ` (${statusDesc})` : ''
      return `[${code}] ${msg}${extra}`
    }
    if (msg) return msg
    if (code) return `Error code: ${code}`
  }

  if (obj.errorMessage) return String(obj.errorMessage)
  if (obj.message) return String(obj.message)
  if (obj.status_desc) return String(obj.status_desc)
  if (obj.error && typeof obj.error === 'string') return obj.error

  return rawText || 'Unknown error'
}

export function isNoRecordsFound(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>

  if (obj.error && typeof obj.error === 'object') {
    const err = obj.error as Record<string, unknown>
    const code = String(err.errorCode || err.error_cd || err.code || '').toUpperCase()
    const msg = String(err.errorMessage || err.error_desc || err.message || err.msg || '').toLowerCase()
    if (['NOTC_010', 'NOTC_011', 'NOTC_012', 'NOTC_008', 'RT-11AA1002'].includes(code)) {
      return true
    }
    if (/no\s*(?:records?|data|notices?)\s*found/i.test(msg)) {
      return true
    }
  }

  const topMsg = String(obj.errorMessage || obj.message || obj.status_desc || '').toLowerCase()
  if (/no\s*(?:records?|data|notices?)\s*found/i.test(topMsg)) {
    return true
  }

  return false
}

function isErrorResponse(status: number, data: unknown): boolean {
  if (status >= 400) return true
  if (!data || typeof data !== 'object') return false

  // "No Records Found" is a successful 0-notice response from GSTN/WhiteBooks
  if (isNoRecordsFound(data)) return false

  const obj = data as Record<string, unknown>

  // GST / WhiteBooks returns status_cd: "0" on failure
  if (obj.status_cd === '0' || obj.status_cd === 0) return true
  if (obj.status === '0' || obj.status === 0 || obj.status === 'FAIL' || obj.status === 'ERROR') return true
  if (Boolean(obj.error)) return true

  return false
}

function extractNoticesArray(data: unknown): NoticeListItem[] {
  if (!data || typeof data !== 'object') return []
  if (Array.isArray(data)) return data

  const obj = data as Record<string, unknown>

  // If there's an error object, no notices
  if (obj.error && (obj.status_cd === '0' || obj.status_cd === 0)) {
    return []
  }

  // Direct arrays
  if (Array.isArray(obj.data)) return obj.data
  if (Array.isArray(obj.notices)) return obj.notices
  if (Array.isArray(obj.noticelist)) return obj.noticelist
  if (Array.isArray(obj.notice_list)) return obj.notice_list
  if (Array.isArray(obj.items)) return obj.items
  if (Array.isArray(obj.result)) return obj.result
  if (Array.isArray(obj.records)) return obj.records

  // Nested in data object
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    const dataObj = obj.data as Record<string, unknown>
    if (Array.isArray(dataObj.notices)) return dataObj.notices
    if (Array.isArray(dataObj.noticelist)) return dataObj.noticelist
    if (Array.isArray(dataObj.notice_list)) return dataObj.notice_list
    if (Array.isArray(dataObj.items)) return dataObj.items
    if (Array.isArray(dataObj.records)) return dataObj.records
    if (Array.isArray(dataObj.result)) return dataObj.result
    if (Array.isArray(dataObj.noticeList)) return dataObj.noticeList
    if (Array.isArray(dataObj.list)) return dataObj.list

    for (const key of Object.keys(dataObj)) {
      if (Array.isArray(dataObj[key])) {
        return dataObj[key] as NoticeListItem[]
      }
    }
  }

  // Check any top-level key that is an array
  for (const key of Object.keys(obj)) {
    if (Array.isArray(obj[key])) {
      return obj[key] as NoticeListItem[]
    }
  }

  return []
}

// Step 1: Request OTP
// GET /authentication/otprequest?email=...
// Returns txn to be used for authtoken
export async function requestOTP(
  email: string = DEFAULT_CA_EMAIL,
  gstUsername: string,
  stateCode: string,
  ipAddress: string = DEFAULT_CA_IP
): Promise<OTPRequestResult> {
  const reqEmail = DEFAULT_CA_EMAIL || email
  const reqIp = DEFAULT_CA_IP || ipAddress

  try {
    const url = new URL(`${BASE_URL}/authentication/otprequest`)
    url.searchParams.set('email', reqEmail)
    const headers = buildHeaders({ gst_username: gstUsername, state_cd: stateCode, ip_address: reqIp })

    console.log(`\n======================================================`)
    console.log(`[WhiteBooks API] >>> STEP 1: OTP REQUEST`)
    console.log(`URL: ${url.toString()}`)
    console.log(`Headers:`, { ...headers, client_secret: '***' })
    console.log(`======================================================`)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
    })

    const rawText = await response.text()
    console.log(`[WhiteBooks API] <<< Status: ${response.status} ${response.statusText}`)
    console.log(`[WhiteBooks API] Response:`, rawText)

    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(rawText)
    } catch {
      data = { rawText }
    }

    if (isErrorResponse(response.status, data)) {
      const errMsg = extractErrorMessage(data, rawText)
      return {
        success: false,
        message: errMsg,
        raw: data,
        rawText,
        debug: { url: url.toString(), httpStatus: response.status, rawText },
      }
    }

    const dataObj = (data.data || data) as Record<string, unknown>
    const txn = String(dataObj?.txn || data?.txn || dataObj?.txnid || dataObj?.transaction || '')

    return {
      success: true,
      txn,
      message: (data?.message as string) || (dataObj?.message as string) || 'OTP sent successfully to taxpayer credentials',
      raw: data,
      rawText,
      debug: { url: url.toString(), httpStatus: response.status, rawText, txn },
    }
  } catch (error) {
    console.error(`[WhiteBooks API] Error in requestOTP:`, error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Network error',
    }
  }
}

// Step 2: Get Authorization Token
// GET /authentication/authtoken?email=...&otp=...
// Returns authtoken which is valid for 6 hours and used as `txn` in getnotices/noticedetails
export async function getAuthToken(
  email: string = DEFAULT_CA_EMAIL,
  otp: string,
  txn: string, // txn received from Step 1 otprequest
  gstUsername: string,
  stateCode: string,
  ipAddress: string = DEFAULT_CA_IP
): Promise<AuthTokenResult> {
  const reqEmail = DEFAULT_CA_EMAIL || email
  const reqIp = DEFAULT_CA_IP || ipAddress

  try {
    const url = new URL(`${BASE_URL}/authentication/authtoken`)
    url.searchParams.set('email', reqEmail)
    url.searchParams.set('otp', otp)
    const headers = buildHeaders({ gst_username: gstUsername, state_cd: stateCode, ip_address: reqIp, txn })

    console.log(`\n======================================================`)
    console.log(`[WhiteBooks API] >>> STEP 2: AUTH TOKEN REQUEST`)
    console.log(`URL: ${url.toString()}`)
    console.log(`Headers:`, { ...headers, client_secret: '***' })
    console.log(`======================================================`)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
    })

    const rawText = await response.text()
    console.log(`[WhiteBooks API] <<< Status: ${response.status} ${response.statusText}`)
    console.log(`[WhiteBooks API] Response:`, rawText)

    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(rawText)
    } catch {
      data = { rawText }
    }

    if (isErrorResponse(response.status, data)) {
      const errMsg = extractErrorMessage(data, rawText)
      return {
        success: false,
        message: errMsg,
        raw: data,
        rawText,
        debug: { url: url.toString(), httpStatus: response.status, rawText },
      }
    }

    const dataObj = (data.data || data) as Record<string, unknown>
    // Extract authtoken/txn - this token is valid for 6 hours and will be passed as txn to data endpoints
    const authToken = String(
      dataObj.auth_token ||
      dataObj.authToken ||
      dataObj.token ||
      dataObj.txn ||
      data.auth_token ||
      data.txn ||
      txn
    )

    return {
      success: true,
      txn: authToken,
      authToken,
      message: 'Authentication successful! Session valid for 6 hours.',
      raw: data,
      rawText,
      debug: { url: url.toString(), httpStatus: response.status, rawText, authToken },
    }
  } catch (error) {
    console.error(`[WhiteBooks API] Error in getAuthToken:`, error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Network error',
    }
  }
}

// Step 3: Refresh Authorization Token
// GET /authentication/refreshtoken?email=...
export async function refreshToken(
  email: string = DEFAULT_CA_EMAIL,
  txn: string,
  gstUsername: string,
  stateCode: string,
  ipAddress: string = DEFAULT_CA_IP
): Promise<RefreshTokenResult> {
  const reqEmail = DEFAULT_CA_EMAIL || email
  const reqIp = DEFAULT_CA_IP || ipAddress

  try {
    const url = new URL(`${BASE_URL}/authentication/refreshtoken`)
    url.searchParams.set('email', reqEmail)
    const headers = buildHeaders({ gst_username: gstUsername, state_cd: stateCode, ip_address: reqIp, txn })

    console.log(`[WhiteBooks API] >>> REFRESH TOKEN: ${url.toString()}`)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
    })

    const rawText = await response.text()
    console.log(`[WhiteBooks API] <<< Status: ${response.status} ${response.statusText}`)

    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(rawText)
    } catch {
      data = { rawText }
    }

    if (isErrorResponse(response.status, data)) {
      const errMsg = extractErrorMessage(data, rawText)
      return {
        success: false,
        message: errMsg,
        raw: data,
        rawText,
        debug: { url: url.toString(), httpStatus: response.status, rawText },
      }
    }

    return { success: true, message: 'Token refreshed successfully', raw: data, rawText }
  } catch (error) {
    console.error(`[WhiteBooks API] Error in refreshToken:`, error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Network error',
    }
  }
}

// Step 4: Get Notice List
// GET /notices/noticelist?gstin=...&date=...&email=...
// Passes the 6-hour authtoken in the `txn` header
export async function getNoticeList(
  gstin: string,
  date: string,
  email: string = DEFAULT_CA_EMAIL,
  txn: string, // the 6h auth token
  gstUsername: string,
  stateCode: string,
  ipAddress: string = DEFAULT_CA_IP
): Promise<NoticeListResult> {
  const reqEmail = DEFAULT_CA_EMAIL || email
  const reqIp = DEFAULT_CA_IP || ipAddress
  const stateCd = getStateCodeFromGSTIN(gstin) || stateCode

  const url = new URL(`${BASE_URL}/notices/noticelist`)
  url.searchParams.set('gstin', gstin)
  url.searchParams.set('date', date)
  url.searchParams.set('email', reqEmail)

  const headers = buildHeaders({
    gst_username: gstUsername,
    state_cd: stateCd,
    ip_address: reqIp,
    txn,
  })

  const debugInfo = {
    url: url.toString(),
    params: { gstin, date, email: reqEmail },
    headers: { ...headers, client_secret: headers.client_secret ? `${headers.client_secret.slice(0, 4)}***` : '' },
    httpStatus: 0,
    statusText: '',
    rawBody: '',
    parsedData: null as unknown,
    extractedCount: 0,
  }

  try {
    console.log(`\n======================================================`)
    console.log(`[WhiteBooks API] >>> STEP 3: GET NOTICES REQUEST`)
    console.log(`URL: ${url.toString()}`)
    console.log(`Headers:`, { ...headers, client_secret: '***' })
    console.log(`======================================================`)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
    })

    debugInfo.httpStatus = response.status
    debugInfo.statusText = response.statusText

    const rawText = await response.text()
    debugInfo.rawBody = rawText

    console.log(`\n======================================================`)
    console.log(`[WhiteBooks API] <<< GET NOTICES RESPONSE (HTTP ${response.status})`)
    console.log(`Raw Body:\n${rawText}`)
    console.log(`======================================================\n`)

    let data: unknown = {}
    try {
      data = JSON.parse(rawText)
      debugInfo.parsedData = data
    } catch {
      data = { rawText }
      debugInfo.parsedData = data
    }

    if (isErrorResponse(response.status, data)) {
      const errMsg = extractErrorMessage(data, rawText)
      console.error(`[WhiteBooks API] ✗ API returned failure: ${errMsg}`)
      return {
        success: false,
        notices: [],
        message: errMsg,
        raw: data,
        rawText,
        debug: debugInfo,
      }
    }

    const notices = extractNoticesArray(data)
    debugInfo.extractedCount = notices.length

    console.log(`[WhiteBooks API] Extracted ${notices.length} notices from payload structure`)

    return {
      success: true,
      notices,
      message: isNoRecordsFound(data) ? 'No notices found for this period' : undefined,
      raw: data,
      rawText,
      debug: debugInfo,
    }
  } catch (error) {
    console.error(`[WhiteBooks API] Exception in getNoticeList:`, error)
    return {
      success: false,
      notices: [],
      message: error instanceof Error ? error.message : 'Network error',
      debug: { ...debugInfo, rawBody: error instanceof Error ? error.message : String(error) },
    }
  }
}

// Step 5: Get Notice Details
// GET /notices/noticedetails?gstin=...&refId=...&email=...
// Passes the 6-hour authtoken in the `txn` header
export async function getNoticeDetails(
  gstin: string,
  refId: string,
  email: string = DEFAULT_CA_EMAIL,
  txn: string, // the 6h auth token
  gstUsername: string,
  stateCode: string,
  ipAddress: string = DEFAULT_CA_IP
): Promise<{ success: boolean; detail?: NoticeDetail; message?: string; raw?: unknown; debug?: Record<string, unknown> }> {
  const reqEmail = DEFAULT_CA_EMAIL || email
  const reqIp = DEFAULT_CA_IP || ipAddress
  const stateCd = getStateCodeFromGSTIN(gstin) || stateCode

  try {
    const url = new URL(`${BASE_URL}/notices/noticedetails`)
    url.searchParams.set('gstin', gstin)
    url.searchParams.set('refId', refId)
    url.searchParams.set('email', reqEmail)

    const headers = buildHeaders({
      gst_username: gstUsername,
      state_cd: stateCd,
      ip_address: reqIp,
      txn,
    })

    console.log(`[WhiteBooks API] >>> GET NOTICE DETAILS: ${refId}`)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
    })

    const rawText = await response.text()
    console.log(`[WhiteBooks API] <<< Details status: ${response.status}, body length: ${rawText.length}`)

    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(rawText)
    } catch {
      data = { rawText }
    }

    if (isErrorResponse(response.status, data)) {
      const errMsg = extractErrorMessage(data, rawText)
      return {
        success: false,
        message: errMsg,
        raw: data,
      }
    }

    const detailObj = (data?.data as NoticeDetail) || (data as NoticeDetail)
    return { success: true, detail: detailObj, raw: data }
  } catch (error) {
    console.error(`[WhiteBooks API] Error in getNoticeDetails:`, error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Network error',
    }
  }
}
