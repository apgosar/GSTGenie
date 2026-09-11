import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseClientSpreadsheet, ParsedClientRow } from '@/lib/excel-import'

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''

    let clientsToImport: ParsedClientRow[] = []
    let invalidRows: any[] = []
    let totalRows = 0

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file') as File | null

      if (!file) {
        return NextResponse.json({ error: 'No spreadsheet file uploaded' }, { status: 400 })
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const result = parseClientSpreadsheet(buffer)
      clientsToImport = result.valid
      invalidRows = result.invalid
      totalRows = result.totalRows
    } else {
      // JSON body with array of clients or parse request
      const body = await req.json()
      if (body.clients && Array.isArray(body.clients)) {
        clientsToImport = body.clients
        totalRows = body.clients.length
      } else if (body.base64) {
        const buffer = Buffer.from(body.base64, 'base64')
        const result = parseClientSpreadsheet(buffer)
        clientsToImport = result.valid
        invalidRows = result.invalid
        totalRows = result.totalRows
      } else {
        return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 })
      }
    }

    if (clientsToImport.length === 0) {
      return NextResponse.json(
        {
          error: 'No valid client rows found in file',
          invalidRows,
          totalRows,
        },
        { status: 400 }
      )
    }

    let createdCount = 0
    let updatedCount = 0

    for (const clientData of clientsToImport) {
      const existing = await prisma.client.findUnique({
        where: { gstin: clientData.gstin },
      })

      if (existing) {
        await prisma.client.update({
          where: { id: existing.id },
          data: {
            name: clientData.name,
            gstUsername: clientData.gstUsername,
            email: clientData.email,
            phone: clientData.phone,
            stateCode: clientData.stateCode,
          },
        })
        updatedCount++
      } else {
        await prisma.client.create({
          data: {
            name: clientData.name,
            gstin: clientData.gstin,
            gstUsername: clientData.gstUsername,
            email: clientData.email,
            phone: clientData.phone,
            stateCode: clientData.stateCode,
            status: 'pending',
          },
        })
        createdCount++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${clientsToImport.length} client(s): ${createdCount} created, ${updatedCount} updated.`,
      createdCount,
      updatedCount,
      totalProcessed: clientsToImport.length,
      invalidRows,
      totalRows,
    })
  } catch (error) {
    console.error('POST /api/clients/import error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import clients' },
      { status: 500 }
    )
  }
}
