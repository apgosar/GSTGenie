const { Firestore } = require('@google-cloud/firestore')

const PROJECT_ID = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'gstgenie-506815'
console.log(`Connecting to Firestore on project: ${PROJECT_ID}...`)
const firestore = new Firestore({ projectId: PROJECT_ID })

async function pruneOldInactiveSessions() {
  console.log('Fetching inactive sessions...')
  const snap = await firestore.collection('authSessions').where('isActive', '==', false).get()
  console.log(`Found ${snap.size} inactive sessions to prune.`)

  if (snap.empty) {
    console.log('No inactive sessions to prune.')
    return
  }

  const docs = snap.docs
  const CHUNK_SIZE = 400
  let deletedCount = 0

  for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
    const chunk = docs.slice(i, i + CHUNK_SIZE)
    const batch = firestore.batch()
    chunk.forEach((d) => batch.delete(d.ref))
    await batch.commit()
    deletedCount += chunk.length
    console.log(`Deleted ${deletedCount}/${docs.length} inactive sessions...`)
  }

  const remainingSnap = await firestore.collection('authSessions').count().get()
  console.log(`Pruning complete! Remaining sessions in collection: ${remainingSnap.data().count}`)
}

pruneOldInactiveSessions().catch(console.error)
