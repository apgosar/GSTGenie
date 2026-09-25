import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { validateGSTIN, getStateCodeFromGSTIN } from '@/lib/utils'
import { z } from 'zod'

const UpdateClientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  gstin: z.string().length(15, 'GSTIN must be 15 characters'),
  gstUsername: z.string().min(1, 'GST Username is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional().nullable(),
  stateCode: z.string().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        sessions: { orderBy: { createdAt: 'desc' }, take: 5 },
        notices: { orderBy: { createdAt: 'desc' } },
        fetchLogs: { orderBy: { fetchedAt: 'desc' }, take: 10 },
      },
    })
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }
    return NextResponse.json(client)
  } catch (error) {
    console.error('GET /api/clients/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch client' }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const existingClient = await prisma.client.findUnique({
      where: { id },
    })

    if (!existingClient) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const body = await req.json()
    const parsed = UpdateClientSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const upperGstin = parsed.data.gstin.toUpperCase().trim()

    if (!validateGSTIN(upperGstin)) {
      return NextResponse.json({ error: 'Invalid GSTIN format' }, { status: 400 })
    }

    // Check if another client is using this GSTIN
    const duplicateGstin = await prisma.client.findFirst({
      where: {
        gstin: upperGstin,
        NOT: { id },
      },
    })

    if (duplicateGstin) {
      return NextResponse.json(
        { error: `Another client (${duplicateGstin.name}) already has GSTIN ${upperGstin}` },
        { status: 409 }
      )
    }

    const derivedStateCode =
      getStateCodeFromGSTIN(upperGstin) ||
      parsed.data.stateCode ||
      upperGstin.slice(0, 2)

    const credentialsChanged =
      existingClient.gstin !== upperGstin ||
      existingClient.gstUsername !== parsed.data.gstUsername.trim()

    if (credentialsChanged) {
      // Invalidate existing sessions since credentials changed
      await prisma.authSession.updateMany({
        where: { clientId: id, isActive: true },
        data: {
          isActive: false,
          authError: 'GST credentials updated. Please re-authenticate.',
        },
      })
    }

    const updatedClient = await prisma.client.update({
      where: { id },
      data: {
        name: parsed.data.name.trim(),
        gstin: upperGstin,
        gstUsername: parsed.data.gstUsername.trim(),
        email: parsed.data.email.trim(),
        phone: parsed.data.phone?.trim() || null,
        stateCode: derivedStateCode,
        ...(credentialsChanged ? { status: 'pending' } : {}),
      },
    })

    return NextResponse.json(updatedClient)
  } catch (error) {
    console.error('PUT /api/clients/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update client' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const existing = await prisma.client.findUnique({
      where: { id },
      select: { id: true, name: true, gstin: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    await prisma.client.delete({ where: { id } })
    return NextResponse.json({
      success: true,
      message: `Client ${existing.name} (${existing.gstin}) deleted successfully.`,
    })
  } catch (error) {
    console.error('DELETE /api/clients/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete client' }, { status: 500 })
  }
}
