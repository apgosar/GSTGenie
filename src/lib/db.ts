import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'
import fs from 'fs'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function getDatabasePath(): string {
  const dbUrl = process.env.DATABASE_URL || ''
  if (dbUrl.startsWith('file:')) {
    const rawPath = dbUrl.replace(/^file:/, '')
    if (path.isAbsolute(rawPath)) return rawPath
    return path.join(/*turbopackIgnore: true*/ process.cwd(), rawPath)
  }

  // Check standard locations
  const dataDb = path.join('/data', 'dev.db')
  const rootDb = path.join(process.cwd(), 'dev.db')
  const prismaDb = path.join(process.cwd(), 'prisma', 'dev.db')

  if (fs.existsSync(dataDb)) return dataDb
  if (fs.existsSync(rootDb)) return rootDb
  if (fs.existsSync(prismaDb)) return prismaDb

  // If in a container with /data mount, prefer /data/dev.db
  if (fs.existsSync('/data')) return dataDb
  return rootDb
}

function createPrismaClient() {
  const dbPath = getDatabasePath()

  // Ensure directory exists
  const parentDir = path.dirname(dbPath)
  if (!fs.existsSync(parentDir)) {
    try {
      fs.mkdirSync(parentDir, { recursive: true })
    } catch {}
  }

  const adapter = new PrismaBetterSqlite3({ url: dbPath })
  return new PrismaClient({
    adapter,
    log: ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
