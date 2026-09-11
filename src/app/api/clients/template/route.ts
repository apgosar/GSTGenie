import { NextResponse } from 'next/server'
import { generateClientTemplateWorkbook } from '@/lib/excel-import'

export async function GET() {
  try {
    const buffer = generateClientTemplateWorkbook()

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="clients_import_template.xlsx"',
      },
    })
  } catch (error) {
    console.error('GET /api/clients/template error:', error)
    return NextResponse.json({ error: 'Failed to generate template' }, { status: 500 })
  }
}
