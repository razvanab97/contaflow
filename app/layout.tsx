import type { Metadata } from 'next'
import Script from 'next/script'
import { Inter, Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import UpdateWidget from '@/components/UpdateWidget'
import Toaster from '@/components/ui/Toaster'
import DocViewer from '@/components/ui/DocViewer'

// Self-hostat de Next.js (fara cerere externa la Google Fonts in runtime) - subset
// latin-ext e necesar pentru diacriticele romanesti (ă â î ș ț).
const inter = Inter({ subsets: ['latin', 'latin-ext'], display: 'swap', variable: '--font-inter' })
// Geist pentru titluri si cifre mari (personalitate, spatiere stransa), Geist Mono pentru sume -
// cifrele se aliniaza ca intr-un terminal financiar. Textul curent ramane pe Inter.
const geist = Geist({ subsets: ['latin', 'latin-ext'], display: 'swap', variable: '--font-geist' })
const geistMono = Geist_Mono({ subsets: ['latin', 'latin-ext'], display: 'swap', variable: '--font-geist-mono' })

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
    <html lang="ro" suppressHydrationWarning className={`${inter.variable} ${geist.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body style={{ background: 'var(--c-0a0a0a)', minHeight: '100vh' }}>
        <a href="#continut" className="skip-link">Sari la conținut</a>
        {children}
        {/* Contor update — in layout-ul radacina, vizibil garantat pe orice pagina din aplicatie */}
        <UpdateWidget />
        <Toaster />
        <DocViewer />
        {/* Time tracking: cronometrul „Timp azi” (script partajat, servit de gestiune-stoc; vezi docs/time-tracking.md acolo).
            Măsoară doar cât tabul ContaFlow e activ (vizibil + focus + input) și salvează în Supabase-ul comun, cu id-ul
            propriu `contaflow`. Se montează în #tt-mount din subsolul sidebar-ului; lazyOnload = după hidratare. */}
        <Script
          src="https://gestiune-stoc-pi.vercel.app/time-tracking.js"
          data-project="contaflow"
          data-mount="#tt-mount"
          data-mount-only="true"
          strategy="lazyOnload"
        />
      </body>
    </html>
  )
}
