// Next.js instrumentation file — runs once when the server starts
// This is the official Next.js way to run code on server boot

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { prisma } = await import('./lib/db')
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "SystemSetting" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "key" TEXT NOT NULL,
          "value" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `)
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "SystemSetting_key_key" ON "SystemSetting"("key");
      `)
      console.log('[Startup] Auto-migration complete: SystemSetting verified.')
    } catch (e) {
      console.warn('[Startup] Auto-migration notice:', e)
    }

    const { startTokenRefreshJob } = await import('./lib/token-refresh')
    startTokenRefreshJob()
  }
}
