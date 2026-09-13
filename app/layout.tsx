import type { Metadata } from 'next'
import './globals.css'
import ThemeToggle from '@/components/ThemeToggle'
import UpdateWidget from '@/components/UpdateWidget'

export const metadata: Metadata = {
  title: 'ContaFlow',
  description: 'Pregătire contabilitate lunară',
}

// Aplică tema salvată înainte de primul paint, ca să nu clipească întunecat -> deschis la încărcare
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem('cf-theme');
  if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
} catch (e) {}
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body style={{ background: 'var(--c-0a0a0a)', minHeight: '100vh' }}>
        {children}
        <ThemeToggle />
        {/* Contor update — in layout-ul radacina, vizibil garantat pe orice pagina din aplicatie */}
        <UpdateWidget />
      </body>
    </html>
  )
}
