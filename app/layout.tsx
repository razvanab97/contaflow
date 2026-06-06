import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ContaFlow',
  description: 'Pregătire contabilitate lunară',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body style={{ background: '#0A0A0A', minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  )
}
