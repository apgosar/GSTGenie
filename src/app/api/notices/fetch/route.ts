import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getNoticeList, getNoticeDetails } from '@/lib/whitebooks-api'
import { format, subDays } from 'date-fns'
import { DEFAULT_CA_EMAIL, DEFAULT_CA_IP, getStateCodeFromGSTIN } from '@/lib/utils'

function formatTaxPeriod(tp: unknown): string {
  if (!tp) return ''
  if (typeof tp === 'string') {
    if (tp === '[object Object]') return ''
    return tp
  }
  if (typeof tp === 'object' && tp !== null) {
    const obj = tp as Record<string, unknown>
    if (obj.fromMonth && obj.fromYear && obj.toMonth && obj.toYear) {
      const fy = obj.fromYear !== obj.toYear ? ` (FY ${obj.fromYear}-${String(obj.toYear).slice(-2)})` : ` (FY ${obj.fromYear})`
      return `${obj.fromMonth} ${obj.fromYear} - ${obj.toMonth} ${obj.toYear}${fy}`
    }
  }
  return ''
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { clientId, customDate } = body

    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } })
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const session = await prisma.authSession.findFirst({
      where: { clientId, isActive: true },
      orderBy: { createdAt: 'desc' },
    })

    if (!session || !session.txn) {
      return NextResponse.json(
        { error: 'No active session. Please authenticate this client with OTP first.' },
        { status: 400 }
      )
    }

    // Default to (Today - 60 days) in DD/MM/YYYY format
    const default60DaysAgo = format(subDays(new Date(), 60), 'dd/MM/yyyy')
    const queryDate = customDate || default60DaysAgo
    const stateCode = getStateCodeFromGSTIN(client.gstin) || client.stateCode || client.gstin.slice(0, 2)

    console.log(`[NoticeFetch] Fetching notices for ${client.name} (${client.gstin}) with date: ${queryDate} (today - 60 days)`)

    const result = await getNoticeList(
      client.gstin,
      queryDate,
      DEFAULT_CA_EMAIL,
      session.txn, // Passing 6-hour auth token in txn header
      client.gstUsername,
      stateCode,
      DEFAULT_CA_IP
    )

    if (!result.success) {
      const errorLogPayload = JSON.stringify({
        request: {
          endpoint: 'GET /notices/noticelist',
          url: result.debug?.url,
          params: result.debug?.params,
          headers: result.debug?.headers,
        },
        response: {
          httpStatus: result.debug?.httpStatus,
          statusText: result.debug?.statusText,
          error: result.message,
          data: result.raw,
          rawBody: result.rawText,
        },
      })

      try {
        await prisma.fetchLog.create({
          data: {
            clientId,
            status: 'error',
            errorMessage: result.message || 'API request failed',
            logType: 'notice_fetch',
            rawResponse: errorLogPayload,
          },
        })
      } catch (logErr) {
        console.error('Failed to create fetch log:', logErr)
      }

      return NextResponse.json({
        error: result.message || 'Failed to fetch notices',
        debug: result.debug,
        raw: result.raw,
      }, { status: 400 })
    }

    // Find existing refIds to detect truly new notices
    const existingRefs = await prisma.notice.findMany({
      where: { clientId },
      select: { refId: true },
    })
    const existingRefIdSet = new Set(existingRefs.map((n) => n.refId))

    let newCount = 0

    for (const notice of result.notices) {
      const refId = String(
        notice.refId ||
        notice.ref_id ||
        notice.id ||
        notice.ntc_id ||
        notice.notice_id ||
        notice.reference_id ||
        `notice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      )

      const isNew = !existingRefIdSet.has(refId)

      // Query existing notice record to preserve existing rich fields (maindocs, suppdocs, etc.)
      const existingNotice = await prisma.notice.findUnique({
        where: { clientId_refId: { clientId, refId } },
      })

      let existingData: Record<string, unknown> = {}
      if (existingNotice?.rawData) {
        try {
          existingData = JSON.parse(existingNotice.rawData)
        } catch {}
      }

      // Check if existing data already has full details
      const hasFullDetails = Boolean(
        existingData.maindocs ||
        existingData.suppdocs ||
        existingData.dueDateOfReply ||
        (existingData.data as any)?.maindocs ||
        (existingData.data as any)?.suppdocs
      )

      // Fetch notice details from WhiteBooks if it's new OR if details were not yet captured
      let detail: Record<string, unknown> = {}
      if (refId && (isNew || !hasFullDetails)) {
        const detailResult = await getNoticeDetails(
          client.gstin,
          refId,
          DEFAULT_CA_EMAIL,
          session.txn,
          client.gstUsername,
          stateCode,
          DEFAULT_CA_IP
        )
        if (detailResult.success && detailResult.detail) {
          detail = detailResult.detail as Record<string, unknown>
        }
      }

      // Merge order: existingData -> shallow notice from noticelist -> detail from noticedetails
      const merged = { ...existingData, ...notice, ...detail }

      // Smart extraction for WhiteBooks / GST System notice details format
      const noticeType = String(
        detail.noticeType ||
        (detail.data as any)?.noticeType ||
        merged.noticeType ||
        merged.notice_type ||
        merged.type ||
        existingNotice?.noticeType ||
        'Notice'
      )

      const dueDate = String(
        detail.dueDateOfReply ||
        detail.dueDate ||
        (detail.data as any)?.dueDateOfReply ||
        merged.dueDateOfReply ||
        merged.dueDate ||
        merged.due_date ||
        existingNotice?.dueDate ||
        ''
      )

      const issuedDate = String(
        detail.dateOfIssue ||
        detail.issuedDate ||
        (detail.data as any)?.dateOfIssue ||
        merged.dateOfIssue ||
        merged.issuedDate ||
        merged.issued_date ||
        existingNotice?.issuedDate ||
        ''
      )

      const rawTaxPeriod = detail.taxPeriod || (detail.data as any)?.taxPeriod || merged.taxPeriod || existingNotice?.taxPeriod
      const taxPeriod = formatTaxPeriod(rawTaxPeriod) || String(existingNotice?.taxPeriod || '')

      const arn = String(detail.arn || (detail.data as any)?.arn || merged.arn || '')
      const description = arn ? `ARN: ${arn}` : String(merged.description || existingNotice?.description || '')

      await prisma.notice.upsert({
        where: { clientId_refId: { clientId, refId } },
        create: {
          clientId,
          refId,
          noticeType,
          section: String(merged.section || existingNotice?.section || ''),
          taxPeriod,
          dueDate,
          issuedDate,
          description,
          status: String(merged.status || existingNotice?.status || ''),
          isNew: true,
          rawData: JSON.stringify(merged),
        },
        update: {
          noticeType: noticeType !== 'Notice' ? noticeType : (existingNotice?.noticeType || noticeType),
          dueDate: dueDate || (existingNotice?.dueDate || ''),
          issuedDate: issuedDate || (existingNotice?.issuedDate || ''),
          taxPeriod: taxPeriod || (existingNotice?.taxPeriod || ''),
          description: description || (existingNotice?.description || ''),
          status: String(merged.status || existingNotice?.status || ''),
          rawData: JSON.stringify(merged),
        },
      })

      if (isNew) newCount++
    }

    const successLogPayload = JSON.stringify({
      request: {
        endpoint: 'GET /notices/noticelist',
        url: result.debug?.url,
        params: result.debug?.params,
        headers: result.debug?.headers,
      },
      response: {
        httpStatus: result.debug?.httpStatus,
        statusText: result.debug?.statusText,
        data: result.raw,
        rawBody: result.rawText,
        noticesFound: result.notices.length,
        newNotices: newCount,
      },
    })

    try {
      await prisma.fetchLog.create({
        data: {
          clientId,
          status: 'success',
          noticesFound: result.notices.length,
          newNotices: newCount,
          errorMessage: null,
          logType: 'notice_fetch',
          rawResponse: successLogPayload,
        },
      })
    } catch (logErr) {
      console.error('Failed to create success fetch log:', logErr)
    }

    return NextResponse.json({
      success: true,
      total: result.notices.length,
      newNotices: newCount,
      debug: result.debug,
      raw: result.raw,
    })
  } catch (error) {
    console.error('POST /api/notices/fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch notices', details: String(error) }, { status: 500 })
  }
}
