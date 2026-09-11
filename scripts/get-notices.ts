import dotenv from 'dotenv'
import path from 'path'
import readline from 'readline'
import { format, subDays } from 'date-fns'

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
  console.log('   WHITEBOOKS GST API - STEP 3: GET NOTICES')
  console.log('======================================================\n')

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ Error: WHITEBOOKS_CLIENT_ID or WHITEBOOKS_CLIENT_SECRET is missing in .env')
    process.exit(1)
  }

  // Read CLI arguments or prompt interactively
  let gstin = process.argv[2]
  let username = process.argv[3]
  let stateCd = process.argv[4]
  let txn = process.argv[5]
  let queryDate = process.argv[6]
  let email = process.argv[7] || DEFAULT_EMAIL

  if (!gstin) {
    gstin = await prompt('Enter GSTIN (e.g. 27AIEPG4944R1ZO): ')
  }
  if (!username) {
    username = await prompt('Enter GST Username (e.g. shivam_mavji): ')
  }
  if (!stateCd) {
    const derived = gstin.slice(0, 2)
    stateCd = await prompt(`Enter State Code [default: ${derived}]: `) || derived
  }
  if (!txn) {
    txn = await prompt('Enter Auth Token (txn from Step 2 get-authtoken): ')
  }
  if (!queryDate) {
    const default60DaysAgo = format(subDays(new Date(), 60), 'dd/MM/yyyy')
    queryDate = await prompt(`Enter Query Date DD/MM/YYYY (Today - 60 days) [default: ${default60DaysAgo}]: `) || default60DaysAgo
  }

  if (!gstin || !username || !stateCd || !txn) {
    console.error('❌ GSTIN, Username, State Code, and Auth Token (txn) are required.')
    process.exit(1)
  }

  const url = new URL(`${BASE_URL}/notices/noticelist`)
  url.searchParams.set('gstin', gstin)
  url.searchParams.set('date', queryDate)
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
  console.log(`Date Used: ${queryDate} (today - 60 days)`)
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
      console.log('❌ GET NOTICES FAILED')
      console.log('Error Message:', json.error?.errorMessage || json.message || json.status_desc || rawText)
    } else {
      console.log('✅ GET NOTICES SUCCESSFUL!')
      console.log('Data:', JSON.stringify(json.data || json, null, 2))
    }
    console.log('======================================================\n')
  } catch (err) {
    console.error('❌ Request error:', err)
  }
}

main()
