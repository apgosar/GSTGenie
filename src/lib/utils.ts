import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { isAfter, addHours } from 'date-fns'

export const DEFAULT_CA_EMAIL = process.env.WHITEBOOKS_EMAIL || 'ankur.gosar@vdsadvisory.com'
export const DEFAULT_CA_IP = process.env.WHITEBOOKS_IP_ADDRESS || '127.0.0.1'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isTokenExpiringSoon(expiresAt: Date | string): boolean {
  const d = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt
  // Warn if less than 30 minutes remaining
  return !isAfter(d, addHours(new Date(), 0.5))
}

export function isTokenExpired(expiresAt: Date | string): boolean {
  const d = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt
  return !isAfter(d, new Date())
}

export const INDIAN_STATES: { code: string; name: string }[] = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '28', name: 'Andhra Pradesh (Old)' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
]

export function getStateNameByCode(code: string): string {
  return INDIAN_STATES.find((s) => s.code === code)?.name ?? code
}

export function getStateCodeFromGSTIN(gstin: string): string {
  if (!gstin || gstin.length < 2) return ''
  const prefix = gstin.slice(0, 2)
  const found = INDIAN_STATES.find((s) => s.code === prefix)
  return found ? found.code : prefix
}

export function validateGSTIN(gstin: string): boolean {
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
  return gstinRegex.test(gstin.toUpperCase())
}

export function getClientIP(): string {
  return DEFAULT_CA_IP
}
