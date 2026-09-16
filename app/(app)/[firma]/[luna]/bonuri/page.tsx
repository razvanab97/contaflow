import { notFound } from 'next/navigation'
import Link from 'next/link'
import BonuriClient from './BonuriClient'
import { dbSelect } from '@/lib/db'
import { getFirmaBySlug, getActiveFirme, getLuniContabile } from '@/lib/queries'
import { getFirmaConfig, MODULE_DEFS, ModuleSlug } from '@/lib/firma-config'
import { accountingPeriodLabel, accountingWorkLabel } from '@/lib/accounting-period'

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
  if (!lunaData) notFound()

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

  const periodLabel = accountingPeriodLabel(luna)
  const workLabel = accountingWorkLabel(luna)

  return (
    <main style={{ flex: 1, padding: '44px 52px', maxWidth: '1300px' }}>
      <div style={{ marginBottom: '32px' }}>
        <Link href={`/${slug}/${luna}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--c-888888)', marginBottom: '16px' }}>
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          {firma.nume.replace(' SRL', '')} · Contabilitate {periodLabel} ({workLabel})
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: firma.culoare, flexShrink: 0 }} />
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--c-ffffff)', letterSpacing: '-0.5px' }}>Bonuri</h1>
        </div>
        <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--c-888888)', marginTop: '6px', marginLeft: '22px' }}>
          {MODULE_DEFS.bonuri.description}
        </p>
      </div>

      <BonuriClient
        firmaId={firma.id} firmaSlug={firma.slug} firmaCui={firma.cui} firmaNume={firma.nume}
        firme={toateFirmele.map((f: any) => ({ id: f.id, nume: f.nume, cui: f.cui || null }))}
        culoare={firma.culoare} luna={luna} lunaId={lunaData.id} tasks={tasks}
        nextLabel={nextDef?.label || null} nextHref={nextHref}
      />
    </main>
  )
}
