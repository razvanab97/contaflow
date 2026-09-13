import { notFound } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { getFirmaBySlug, getFirmeNavData, getRestanteCount } from '@/lib/queries'
import { getFirmaConfig, getFirmaModules } from '@/lib/firma-config'

export const dynamic = 'force-dynamic'

const LUNI_FULL = ['', 'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie']
function lunaLabel(s: string) { const [y, m] = s.split('-'); return `${LUNI_FULL[+m]} ${y}` }

// Layout comun pentru toate paginile unei firme+luni (hub-ul lunii + fiecare modul).
// Sidebar-ul ramane montat intre navigari intre module - Next.js nu-l mai re-randeaza
// de la zero la fiecare click, deci trecerea de la o categorie la alta e instant vizual.
export default async function FirmaLunaLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ firma: string; luna: string }>
}) {
  const { firma: slug, luna } = await params

  const firmaConfig = getFirmaConfig(slug)
  if (!firmaConfig) notFound()

  const firma = await getFirmaBySlug(slug)
  if (!firma) notFound()

  const [{ firmeNav }, restanteCount] = await Promise.all([
    getFirmeNavData(luna),
    getRestanteCount(firma.id),
  ])

  const modules = getFirmaModules(slug)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--c-0a0a0a)' }}>
      <Sidebar
        firme={firmeNav}
        lunaCurenta={luna}
        lunaLabel={lunaLabel(luna)}
        firmaAtiva={slug}
        moduleFirma={modules}
        restanteCount={restanteCount}
      />
      {children}
    </div>
  )
}
