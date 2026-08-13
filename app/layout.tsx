import type { Metadata } from 'next'
import './globals.css'
import { APP_UPDATE } from '@/lib/version'

export const metadata: Metadata = {
  title: 'ContaFlow',
  description: 'Pregătire contabilitate lunară',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body style={{ background: '#0A0A0A', minHeight: '100vh' }}>
        {children}
        {/* Contor update — in layout-ul radacina, vizibil garantat pe orice pagina din aplicatie */}
        <div style={{ position: 'fixed', bottom: '6px', left: '20px', fontSize: '10px', color: '#444', zIndex: 9999, pointerEvents: 'none' }}>
          Update {APP_UPDATE}
        </div>
      </body>
    </html>
  )
}
