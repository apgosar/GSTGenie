import dotenv from 'dotenv'
import path from 'path'
import readline from 'readline'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const BASE_URL = process.env.WHITEBOOKS_BASE_URL || 'https://api.whitebooks.in'
const CLIENT_ID = process.env.WHITEBOOKS_CLIENT_ID || ''
const CLIENT_SECRET = process.env.WHITEBOOKS_CLIENT_SECRET || ''
const DEFAULT_EMAIL = process.env.WHITEBOOKS_EMAIL || 'ankur.gosar@vdsadvisory.com'
const DEFAULT_IP = process.env.WHITEBOOKS_IP_ADDRESS || '127.0.0.1'

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function main() {
  console.log('\n======================================================')
  console.log('   WHITEBOOKS GST API - REFRESH / EXTEND TOKEN')
  console.log('======================================================\n')

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ Error: WHITEBOOKS_CLIENT_ID or WHITEBOOKS_CLIENT_SECRET is missing in .env')
    process.exit(1)
  }

  // Read CLI arguments or prompt interactively
  let username = process.argv[2]
  let stateCd = process.argv[3]
  let txn = process.argv[4]
  let email = process.argv[5] || DEFAULT_EMAIL

  if (!username) {
    username = await prompt('Enter GST Username (e.g. shivam_mavji): ')
  }
  if (!stateCd) {
    stateCd = await prompt('Enter State Code (e.g. 27): ')
  }
  if (!txn) {
    txn = await prompt('Enter active Token (txn to refresh): ')
  }

  if (!username || !stateCd || !txn) {
    console.error('❌ GST Username, State Code, and Token (txn) are required.')
    process.exit(1)
  }

  const url = new URL(`${BASE_URL}/authentication/refreshtoken`)
  url.searchParams.set('email', email)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'gst_username': username,
    'state_cd': stateCd,
    'ip_address': DEFAULT_IP,
    'txn': txn,
    'client_id': CLIENT_ID,
    'client_secret': CLIENT_SECRET,
  }

  console.log('\n>>> SENDING GET REQUEST:')
  console.log(`URL: ${url.toString()}`)
  console.log('Headers:', { ...headers, client_secret: `${CLIENT_SECRET.slice(0, 4)}***` })
  console.log('\nWaiting for WhiteBooks response...\n')

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers,
    })

    const rawText = await res.text()
    console.log(`<<< HTTP STATUS: ${res.status} ${res.statusText}`)
    console.log('<<< RAW RESPONSE BODY:\n')
    console.log(rawText)

    let json: any = {}
    try {
      json = JSON.parse(rawText)
    } catch {
      json = {}
    }

    console.log('\n======================================================')
    if (json.status_cd === '0' || json.error) {
      console.log('❌ TOKEN REFRESH FAILED')
      console.log('Error Message:', json.error?.errorMessage || json.message || json.status_desc || rawText)
    } else {
      const dataObj = json.data || json
      const refreshedToken = dataObj.auth_token || dataObj.token || dataObj.txn || json.auth_token || json.txn || txn
      console.log('✅ TOKEN REFRESHED / EXTENDED SUCCESSFULLY!')
      console.log(`Message: ${json.message || 'Token refreshed successfully'}`)
      console.log(`\n👉 Extended Token (Valid for next 6 hours):`)
      console.log(`   TOKEN: ${refreshedToken}\n`)
    }
    console.log('======================================================\n')
  } catch (err) {
    console.error('❌ Request error:', err)
  }
}

main()
