import { notFound } from 'next/navigation'
import ExtrasClient from './ExtrasClient'
import { MODULE_DEFS, getFirmaConfig, ModuleSlug } from '@/lib/firma-config'
import { accountingShortLabel } from '@/lib/accounting-period'

export const dynamic = 'force-dynamic'

const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co/rest/v1'
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }

async function get(path: string) {
  const r = await fetch(`${SB}/${path}`, { headers: H, cache: 'no-store' })
  return r.ok ? r.json() : []
}

export default async function ExtrasPage({ params }: { params: Promise<{ firma: string; luna: string }> }) {
  const { firma: slug, luna } = await params

  const firme = await get(`firme?slug=eq.${encodeURIComponent(slug)}&select=id,slug,nume,culoare`)
  const firma = firme[0]
  if (!firma) notFound()

  const luni = await get(`luni_contabile?firma_id=eq.${firma.id}&select=id,luna&order=luna.desc`)
  const lunaData = luni.find((l: { luna: string }) => l.luna.startsWith(luna))
  if (!lunaData) notFound()

  const [extrase, taskStariRaw, moduleStariRaw] = await Promise.all([
    get(`extrase?luna_id=eq.${lunaData.id}&select=id,valuta,iban,pdf_nume,nr_tranzactii,nr_documentate,procesat_ai,sold_final&order=valuta`),
    get(`task_stari?luna_id=eq.${lunaData.id}&select=task_key,completat`),
    get(`module_stari?luna_id=eq.${lunaData.id}&select=modul_slug,dezactivat`),
  ])
  const taskMap: Record<string, boolean> = {}
  for (const ts of taskStariRaw) taskMap[ts.task_key] = ts.completat
  const facturiTasks = MODULE_DEFS['facturi-chitanta'].tasks.map(t => ({ ...t, completat: taskMap[t.key] ?? false }))
  const extrasFinalizat = taskMap['extras.tranzactii_documentate'] ?? false

  const ll = accountingShortLabel(luna)

  // Pasul urmator in ordinea de lucru a firmei - vezi acelasi calcul in [modul]/page.tsx. Extras
  // are propria lui pagina dedicata (nu trece prin [modul]), deci calculul se repeta aici.
  const firmaConfig = getFirmaConfig(slug)
  const dezactivateSet = new Set((moduleStariRaw || []).filter((m: any) => m.dezactivat).map((m: any) => m.modul_slug))
  const ordineModule = firmaConfig?.module || []
  const curIdx = ordineModule.indexOf('extras' as ModuleSlug)
  let nextSlug: ModuleSlug | null = null
  for (let i = curIdx + 1; i < ordineModule.length; i++) {
    if (!dezactivateSet.has(ordineModule[i])) { nextSlug = ordineModule[i]; break }
  }
  const nextDef = nextSlug ? MODULE_DEFS[nextSlug] : null
  const nextHref = nextDef ? `/${slug}/${luna}/${nextDef.linkDirect || nextDef.slug}` : null

  return (
    <ExtrasClient
      firma={firma}
      lunaId={lunaData.id}
      luna={luna}
      lunaLabel={ll}
      extrase={extrase}
      slug={slug}
      facturiTasks={facturiTasks}
      extrasFinalizat={extrasFinalizat}
      nextLabel={nextDef?.label || null}
      nextHref={nextHref}
    />
  )
}
