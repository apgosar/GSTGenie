/**
 * Data Migration Script: SQLite (live-dev.db) -> Google Cloud Firestore
 *
 * Migrates:
 * 1. Clients (59)
 * 2. AuthSessions (Active & recent historical)
 * 3. Notices
 * 4. FetchLogs (Most recent 500 entries)
 * 5. SystemSettings (notification_emails)
 */

const Database = require('better-sqlite3')
const { Firestore } = require('@google-cloud/firestore')
const path = require('path')

const PROJECT_ID = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'gstgenie-506815'
console.log(`Connecting to Firestore on project: ${PROJECT_ID}...`)

const firestore = new Firestore({ projectId: PROJECT_ID })
const dbPath = path.resolve(__dirname, '..', 'live-dev.db')
console.log(`Opening SQLite snapshot at: ${dbPath}...`)
const sqlite = new Database(dbPath)

function parseDate(val) {
  if (!val) return new Date()
  if (val instanceof Date) return val
  return new Date(val)
}

async function commitInChunks(collectionName, items, mapFn) {
  const CHUNK_SIZE = 400
  let totalCommitted = 0

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE)
    const batch = firestore.batch()

    for (const item of chunk) {
      const { docId, data } = mapFn(item)
      const docRef = firestore.collection(collectionName).doc(docId)
      batch.set(docRef, data, { merge: true })
    }

    await batch.commit()
    totalCommitted += chunk.length
    console.log(`  [${collectionName}] Committed ${totalCommitted}/${items.length} documents...`)
  }
}

async function migrate() {
  console.log('--- STARTING FIRESTORE MIGRATION ---')

  // 1. Migrate Clients
  console.log('\n1. Migrating Clients...')
  const clients = sqlite.prepare('SELECT * FROM Client').all()
  console.log(`Found ${clients.length} clients in SQLite.`)
  await commitInChunks('clients', clients, (c) => ({
    docId: c.id,
    data: {
      id: c.id,
      name: c.name,
      gstin: c.gstin,
      gstUsername: c.gstUsername,
      email: c.email,
      phone: c.phone || null,
      stateCode: c.stateCode,
      status: c.status || 'pending',
      createdAt: parseDate(c.createdAt),
      updatedAt: parseDate(c.updatedAt),
    },
  }))

  // 2. Migrate AuthSessions
  console.log('\n2. Migrating AuthSessions...')
  const sessions = sqlite.prepare('SELECT * FROM AuthSession').all()
  console.log(`Found ${sessions.length} sessions in SQLite.`)
  await commitInChunks('authSessions', sessions, (s) => ({
    docId: s.id,
    data: {
      id: s.id,
      clientId: s.clientId,
      txn: s.txn,
      ipAddress: s.ipAddress,
      isActive: Boolean(s.isActive),
      authError: s.authError || null,
      createdAt: parseDate(s.createdAt),
      lastRefreshedAt: parseDate(s.lastRefreshedAt),
      expiresAt: parseDate(s.expiresAt),
    },
  }))

  // 3. Migrate Notices
  console.log('\n3. Migrating Notices...')
  const notices = sqlite.prepare('SELECT * FROM Notice').all()
  console.log(`Found ${notices.length} notices in SQLite.`)
  await commitInChunks('notices', notices, (n) => ({
    docId: n.id,
    data: {
      id: n.id,
      clientId: n.clientId,
      refId: n.refId,
      noticeType: n.noticeType || null,
      section: n.section || null,
      taxPeriod: n.taxPeriod || null,
      dueDate: n.dueDate || null,
      issuedDate: n.issuedDate || null,
      description: n.description || null,
      status: n.status || null,
      isNew: Boolean(n.isNew),
      rawData: n.rawData || '{}',
      createdAt: parseDate(n.createdAt),
      updatedAt: parseDate(n.updatedAt),
    },
  }))

  // 4. Migrate Recent FetchLogs (Top 500)
  console.log('\n4. Migrating FetchLogs (Most recent 500)...')
  const logs = sqlite.prepare('SELECT * FROM FetchLog ORDER BY fetchedAt DESC LIMIT 500').all()
  console.log(`Found ${logs.length} recent fetch logs in SQLite.`)
  await commitInChunks('fetchLogs', logs, (l) => ({
    docId: l.id,
    data: {
      id: l.id,
      clientId: l.clientId,
      fetchedAt: parseDate(l.fetchedAt),
      noticesFound: Number(l.noticesFound) || 0,
      newNotices: Number(l.newNotices) || 0,
      status: l.status,
      errorMessage: l.errorMessage || null,
      rawResponse: l.rawResponse || null,
      logType: l.logType || 'notice_fetch',
    },
  }))

  // 5. Migrate SystemSettings
  console.log('\n5. Migrating SystemSettings...')
  const settings = sqlite.prepare('SELECT * FROM SystemSetting').all()
  console.log(`Found ${settings.length} system settings in SQLite.`)
  await commitInChunks('systemSettings', settings, (st) => ({
    docId: st.key, // Use key as docId for direct, instant lookups
    data: {
      id: st.id,
      key: st.key,
      value: st.value,
      createdAt: parseDate(st.createdAt),
      updatedAt: parseDate(st.updatedAt),
    },
  }))

  console.log('\n--- MIGRATION COMPLETED SUCCESSFULLY! ---')
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
