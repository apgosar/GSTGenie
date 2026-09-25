// Next.js instrumentation file — runs once when the server starts
// This is the official Next.js way to run code on server boot

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Startup] GST Genie initializing with Google Cloud Firestore database.')

    const { startTokenRefreshJob } = await import('./lib/token-refresh')
    startTokenRefreshJob()
  }
}
