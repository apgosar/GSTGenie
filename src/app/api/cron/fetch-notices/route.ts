import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getNoticeList, getNoticeDetails } from '@/lib/whitebooks-api'
import { format, subDays } from 'date-fns'
import { DEFAULT_CA_EMAIL, DEFAULT_CA_IP, getStateCodeFromGSTIN } from '@/lib/utils'
import { sendNoticeRunReportEmail } from '@/lib/email-service'

function isAuthorizedCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true

  const authHeader = req.headers.get('authorization')
  const customHeader = req.headers.get('x-cron-secret')
  const token = authHeader?.replace(/^Bearer\s+/i, '') || customHeader

  return token === cronSecret
}

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
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 })
  }

  const now = new Date()
  const queryDate = format(subDays(now, 60), 'dd/MM/yyyy') // Today - 60 days

  console.log(`[Cron NoticeFetch] Starting automated notice fetch cycle (date: ${queryDate})...`)

  try {
    // Find all authenticated clients with active sessions
    const clients = await prisma.client.findMany({
      where: {
        status: 'authenticated',
        sessions: {
          some: {
            isActive: true,
            expiresAt: { gt: now },
          },
        },
      },
      include: {
        sessions: {
          where: { isActive: true, expiresAt: { gt: now } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    if (clients.length === 0) {
      console.log('[Cron NoticeFetch] No authenticated clients with active sessions. Sending alert email report...')
      const emailResult = await sendNoticeRunReportEmail({
        runDate: now,
        totalClientsChecked: 0,
        totalNoticesFound: 0,
        totalNewNotices: 0,
        newNoticeItems: [],
        failedClients: [
          {
            clientName: 'All Client Sessions Expired / Inactive',
            gstin: 'Action Needed',
            error: '0 active sessions available at scheduled run. Please open GST Genie and click "1-Click Authenticate All" to re-authenticate accounts.',
          },
        ],
      })

      return NextResponse.json({
        success: true,
        message: 'No authenticated clients with active sessions. Alert report sent to CA emails.',
        clientsProcessed: 0,
        totalNoticesFound: 0,
        totalNewNotices: 0,
        emailReport: emailResult,
      })
    }

    console.log(`[Cron NoticeFetch] Processing ${clients.length} authenticated client(s)...`)

    let totalNoticesFound = 0
    let totalNewNotices = 0
    const results: any[] = []
    const newNoticeItems: any[] = []
    const failedClients: any[] = []

    // Process clients in parallel batches of 4 for speed and reliability
    const BATCH_SIZE = 4
    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      const chunk = clients.slice(i, i + BATCH_SIZE)
      await Promise.all(
        chunk.map(async (client) => {
          const session = client.sessions[0]
          if (!session?.txn) return

      const stateCode = getStateCodeFromGSTIN(client.gstin) || client.stateCode || client.gstin.slice(0, 2)

      try {
        const result = await getNoticeList(
          client.gstin,
          queryDate,
          DEFAULT_CA_EMAIL,
          session.txn,
          client.gstUsername,
          stateCode,
          DEFAULT_CA_IP
        )

        if (!result.success) {
          await prisma.fetchLog.create({
            data: {
              clientId: client.id,
              status: 'error',
              errorMessage: result.message || 'Cron fetch failed',
              logType: 'notice_fetch',
              rawResponse: JSON.stringify({ action: 'cron_notice_fetch', result }),
            },
          })
          results.push({ clientId: client.id, name: client.name, status: 'error', error: result.message })
          failedClients.push({
            clientName: client.name,
            gstin: client.gstin,
            error: result.message || 'Notice fetch failed',
          })
          return
        }

        // Detect new notices
        const existingRefs = await prisma.notice.findMany({
          where: { clientId: client.id },
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
            `notice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          )

          const isNew = !existingRefIdSet.has(refId)
          const existingNotice = await prisma.notice.findUnique({
            where: { clientId_refId: { clientId: client.id, refId } },
          })

          let detail: Record<string, unknown> = {}
          if (refId && isNew) {
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

          const merged = { ...notice, ...detail }
          const noticeType = String(detail.noticeType || merged.noticeType || merged.notice_type || existingNotice?.noticeType || 'Notice')
          const dueDate = String(detail.dueDateOfReply || detail.dueDate || merged.dueDate || existingNotice?.dueDate || '')
          const issuedDate = String(detail.dateOfIssue || detail.issuedDate || merged.issuedDate || existingNotice?.issuedDate || '')
          const rawTaxPeriod = detail.taxPeriod || merged.taxPeriod || existingNotice?.taxPeriod
          const taxPeriod = formatTaxPeriod(rawTaxPeriod) || String(existingNotice?.taxPeriod || '')
          const arn = String(detail.arn || merged.arn || '')
          const description = arn ? `ARN: ${arn}` : String(merged.description || existingNotice?.description || '')

          await prisma.notice.upsert({
            where: { clientId_refId: { clientId: client.id, refId } },
            create: {
              clientId: client.id,
              refId,
              noticeType,
              section: String(merged.section || ''),
              taxPeriod,
              dueDate,
              issuedDate,
              description,
              status: String(merged.status || ''),
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

          if (isNew) {
            newCount++
            newNoticeItems.push({
              clientName: client.name,
              gstin: client.gstin,
              noticeType,
              section: String(merged.section || ''),
              taxPeriod,
              dueDate,
              issuedDate,
              description,
            })
          }
        }

        totalNoticesFound += result.notices.length
        totalNewNotices += newCount

        await prisma.fetchLog.create({
          data: {
            clientId: client.id,
            status: 'success',
            noticesFound: result.notices.length,
            newNotices: newCount,
            logType: 'notice_fetch',
            rawResponse: JSON.stringify({
              action: 'cron_notice_fetch',
              queryDate,
              noticesCount: result.notices.length,
              newNoticesCount: newCount,
            }),
          },
        })

        results.push({
          clientId: client.id,
          name: client.name,
          status: 'success',
          noticesFound: result.notices.length,
          newNotices: newCount,
        })
      } catch (err) {
        console.error(`[Cron NoticeFetch] Error for ${client.name}:`, err)
        failedClients.push({
          clientName: client.name,
          gstin: client.gstin,
          error: err instanceof Error ? err.message : 'Network error',
        })
      }
    })
  )
}

console.log(`[Cron NoticeFetch] Completed: ${clients.length} processed, ${totalNoticesFound} notices found (${totalNewNotices} new).`)

    // Dispatch formatted email report
    const emailResult = await sendNoticeRunReportEmail({
      runDate: now,
      totalClientsChecked: clients.length,
      totalNoticesFound,
      totalNewNotices,
      newNoticeItems,
      failedClients,
    })

    return NextResponse.json({
      success: true,
      clientsProcessed: clients.length,
      totalNoticesFound,
      totalNewNotices,
      emailReport: emailResult,
      results,
    })
  } catch (error) {
    console.error('[Cron NoticeFetch] Fatal error:', error)
    return NextResponse.json({ error: 'Failed to run cron notice fetch cycle' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
