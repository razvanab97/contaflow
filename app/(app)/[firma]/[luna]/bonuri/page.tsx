import { notFound } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import MonthNav from '@/components/ui/MonthNav'
import BonuriClient from './BonuriClient'
import InitLuna from '../InitLuna'
import { dbSelect } from '@/lib/db'
import { getFirmaBySlug, getActiveFirme, getLuniContabile } from '@/lib/queries'
import { getFirmaConfig, MODULE_DEFS, ModuleSlug } from '@/lib/firma-config'

export const dynamic = 'force-dynamic'

export default async function BonuriPage({ params }: { params: Promise<{ firma: string; luna: string }> }) {
  const { firma: slug, luna } = await params

  const firmaConfig = getFirmaConfig(slug)
  if (!firmaConfig || !firmaConfig.module.includes('bonuri')) notFound()

  const [firma, toateFirmele, luni] = await Promise.all([
    getFirmaBySlug(slug),
    getActiveFirme(),
    getLuniContabile(),
  ])
  if (!firma) notFound()

  const lunaData = luni.find((l: any) => l.firma_id === firma.id && l.luna?.startsWith(luna))
  if (!lunaData) return <main className="page" style={{ display: 'flex', flexDirection: 'column' }}><InitLuna firma={firma} luna={luna} /></main>

  const [taskStariRaw, moduleStariRaw] = await Promise.all([
    dbSelect('task_stari', { eq: { luna_id: lunaData.id }, select: 'task_key,completat' }),
    dbSelect('module_stari', { eq: { luna_id: lunaData.id }, select: 'modul_slug,dezactivat' }),
  ])
  const taskMap: Record<string, boolean> = {}
  for (const ts of taskStariRaw) taskMap[ts.task_key] = ts.completat
  const tasks = MODULE_DEFS.bonuri.tasks.map(t => ({ ...t, completat: taskMap[t.key] ?? false }))

  // Pasul urmator in ordinea de lucru a firmei - vezi acelasi calcul in [modul]/page.tsx si in
  // extras/page.tsx. Bonuri are propria lui pagina dedicata (nu trece prin [modul], la fel ca
  // extras - are UI proprie: camera, calcul, mutare intre firme), deci calculul se repeta aici.
  const dezactivateSet = new Set(moduleStariRaw.filter((m: any) => m.dezactivat).map((m: any) => m.modul_slug))
  const ordineModule = firmaConfig.module
  const curIdx = ordineModule.indexOf('bonuri' as ModuleSlug)
  let nextSlug: ModuleSlug | null = null
  for (let i = curIdx + 1; i < ordineModule.length; i++) {
    if (!dezactivateSet.has(ordineModule[i])) { nextSlug = ordineModule[i]; break }
  }
  const nextDef = nextSlug ? MODULE_DEFS[nextSlug] : null
  const nextHref = nextDef ? `/${slug}/${luna}/${nextDef.linkDirect || nextDef.slug}` : null


  return (
    <main className="page animate-in">
      <PageHeader
        back={{ href: `/${slug}/${luna}`, label: 'Rezumatul lunii' }}
        culoare={firma.culoare}
        title="Bonuri"
        description={MODULE_DEFS.bonuri.description}
        actions={<MonthNav slug={slug} luna={luna} suffix="/bonuri" />}
      />

      <BonuriClient
        firmaId={firma.id} firmaSlug={firma.slug} firmaCui={firma.cui} firmaNume={firma.nume}
        firme={toateFirmele.map((f: any) => ({ id: f.id, nume: f.nume, cui: f.cui || null }))}
        culoare={firma.culoare} luna={luna} lunaId={lunaData.id} tasks={tasks}
        nextLabel={nextDef?.label || null} nextHref={nextHref}
      />
    </main>
  )
}
