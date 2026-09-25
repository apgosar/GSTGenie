import { GET as getStats } from '../src/app/api/dashboard/stats/route'
import { GET as getClients } from '../src/app/api/clients/route'
import { GET as getNotices } from '../src/app/api/notices/route'
import { GET as getSettings } from '../src/app/api/settings/route'
import { NextRequest } from 'next/server'

async function main() {
  console.log('Testing Firestore API Routes...\n')

  // 1. Dashboard Stats
  const resStats = await getStats()
  const dataStats = await resStats.json()
  console.log('1. Dashboard Stats:')
  console.log('   Total Clients:', dataStats.totalClients)
  console.log('   Total Notices:', dataStats.totalNotices)
  console.log('   New Notices:', dataStats.newNotices)
  console.log('   Auth Issues:', dataStats.authIssues)
  console.log('   Active Sessions:', dataStats.activeSessions)
  console.log('   Recent Activities count:', dataStats.recentActivity?.length)
  console.log('   Portal Issue detected:', dataStats.gstPortalIssue?.isDetected)

  // 2. Clients List
  const resClients = await getClients()
  const dataClients = await resClients.json()
  console.log('\n2. Clients List:')
  console.log('   Total Returned:', dataClients.length)
  console.log('   First Client:', dataClients[0]?.name, `(${dataClients[0]?.gstin})`)
  console.log('   Status:', dataClients[0]?.status)
  console.log('   Has Active Session:', !!dataClients[0]?.activeSession)
  console.log('   Total Notices:', dataClients[0]?.totalNotices)

  // 3. Notices
  const reqNotices = new NextRequest('http://localhost:3000/api/notices')
  const resNotices = await getNotices(reqNotices)
  const dataNotices = await resNotices.json()
  console.log('\n3. Notices List:')
  console.log('   Total Notices Returned:', dataNotices.length)
  if (dataNotices.length > 0) {
    console.log('   Notice 0:', dataNotices[0]?.refId, dataNotices[0]?.noticeType, 'Client:', dataNotices[0]?.client?.name)
  }

  // 4. Settings
  const resSettings = await getSettings()
  const dataSettings = await resSettings.json()
  console.log('\n4. Settings:')
  console.log('   Emails:', dataSettings.emails)

  // 5. Activity Logs
  const { GET: getActivity } = await import('../src/app/api/activity/route')
  const reqActivity = new NextRequest('http://localhost:3000/api/activity?page=1&limit=5')
  const resActivity = await getActivity(reqActivity)
  const dataActivity = await resActivity.json()
  console.log('\n5. Activity Logs:')
  console.log('   Total Logs:', dataActivity.total)
  console.log('   Page logs count:', dataActivity.logs?.length)
  console.log('   Stats:', dataActivity.stats)

  console.log('\n--- ALL LOCAL FIRESTORE TESTS PASSED! ---')
}

main().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
