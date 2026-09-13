import type { Metadata } from 'next'
import './globals.css'
import UpdateWidget from '@/components/UpdateWidget'

export const metadata: Metadata = {
  title: 'ContaFlow',
  description: 'Pregătire contabilitate lunară',
}

// Aplică tema salvată înainte de primul paint, ca să nu clipească gresit la încărcare.
// 'system' rezolvă din prefers-color-scheme; 'dark' nu are nevoie de atribut (implicit :root).
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem('cf-theme') || 'system';
  var resolved = t === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : t;
  if (resolved === 'light' || resolved === 'glass') document.documentElement.setAttribute('data-theme', resolved);
} catch (e) {}
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body style={{ background: 'var(--c-0a0a0a)', minHeight: '100vh' }}>
        {children}
        {/* Contor update — in layout-ul radacina, vizibil garantat pe orice pagina din aplicatie */}
        <UpdateWidget />
      </body>
    </html>
  )
}
