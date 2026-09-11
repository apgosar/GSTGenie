import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import { Toaster } from 'sonner'

export const metadata: Metadata = {
  title: 'GST Genie - CA Dashboard for GST Notice Management',
  description: 'CA Dashboard for automated GST notices, token renewals, and instant OTP verification',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <Sidebar />
          <div style={{ flex: 1, marginLeft: 240, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <main style={{ flex: 1 }}>
              {children}
            </main>
            <footer
              style={{
                padding: '1.25rem 2rem',
                borderTop: '1px solid rgb(226, 232, 240)',
                background: 'rgb(248, 250, 252)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                color: 'rgb(100, 116, 139)',
                gap: '0.35rem',
              }}
            >
              <span>&copy; {new Date().getFullYear()} GST Genie. Powered by</span>
              <a
                href="https://siddhtech.ai"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'rgb(37, 99, 235)',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Siddh Tech Solutions
              </a>
            </footer>
          </div>
        </div>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
