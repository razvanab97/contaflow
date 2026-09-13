import { notFound } from 'next/navigation'
import Link from 'next/link'
import InitLuna from './InitLuna'
import ModuleGrid from './ModuleGrid'
import { dbSelect } from '@/lib/db'
import { getFirmaBySlug, getLuniContabile, getRestanteCount } from '@/lib/queries'
import { getFirmaModules } from '@/lib/firma-config'
import LunaSummary from './LunaSummary'
import ExportButtons from './ExportButtons'

export const dynamic = 'force-dynamic'

const LUNI_FULL = ['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
function lunaLabel(s: string) { const [y,m]=s.split('-'); return `${LUNI_FULL[+m]} ${y}` }
function prevLuna(luna: string) { const d = new Date(luna+'-01'); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7) }
function nextLuna(luna: string) { const d = new Date(luna+'-01'); d.setMonth(d.getMonth()+1); return d.toISOString().slice(0,7) }

export default async function HubPage({ params }: { params: Promise<{firma:string;luna:string}> }) {
  const { firma: slug, luna } = await params

  const [firma, luni] = await Promise.all([
    getFirmaBySlug(slug),
    getLuniContabile(),
  ])
  if (!firma) notFound()

  const lunaData = luni.find((l: any) => l.firma_id === firma.id && l.luna?.startsWith(luna))
  if (!lunaData) return <main style={{ flex: 1, padding: '44px 52px', display: 'flex' }}><InitLuna firma={firma} luna={luna} /></main>

  const [taskStariRaw, moduleStariRaw, restanteCount] = await Promise.all([
    dbSelect('task_stari', { eq: { luna_id: lunaData.id }, select: 'task_key,completat' }),
    dbSelect('module_stari', { eq: { luna_id: lunaData.id }, select: 'modul_slug,dezactivat' }),
    getRestanteCount(firma.id),
  ])

  const taskMap: Record<string, boolean> = {}
  for (const ts of taskStariRaw) taskMap[ts.task_key] = ts.completat

  const dezactivate = moduleStariRaw.filter((m: any) => m.dezactivat).map((m: any) => m.modul_slug)

  const modules = getFirmaModules(slug)
  const activeModules = modules.filter(m => !dezactivate.includes(m.slug))
  const total = activeModules.reduce((sum, m) => sum + m.tasks.length, 0)
  const done = activeModules.reduce((sum, m) => sum + m.tasks.filter(t => taskMap[t.key]).length, 0)
  const pct = total > 0 ? Math.round((done/total)*100) : 0
  const ll = lunaLabel(luna)

  return (
    <main style={{ flex: 1, padding: '44px 52px', maxWidth: '1000px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '36px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: firma.culoare }}/>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--c-ffffff)', letterSpacing: '-0.4px' }}>
              {firma.nume}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginLeft: '20px' }}>
            <Link href={`/${slug}/${prevLuna(luna)}`} style={{ fontSize: '12px', color: 'var(--c-888888)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
            </Link>
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--c-aaaaaa)' }}>{ll}</span>
            <Link href={`/${slug}/${nextLuna(luna)}`} style={{ fontSize: '12px', color: 'var(--c-888888)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
            </Link>
          </div>
        </div>

        <LunaSummary lunaId={lunaData.id} culoare={firma.culoare} />

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '-1px', color: pct === 100 ? 'var(--accent-mint)' : firma.culoare, lineHeight: 1 }}>
            {pct}%
          </div>
          <div style={{ fontSize: '12px', color: 'var(--c-888888)', marginTop: '4px' }}>
            {done}/{total} task-uri
          </div>
        </div>
      </div>

      {/* Total progress bar */}
      <div style={{ height: '2px', background: 'var(--c-1a1a1a)', borderRadius: '2px', marginBottom: '36px' }}>
        <div style={{ height: '2px', borderRadius: '2px', background: pct === 100 ? 'var(--accent-mint)' : firma.culoare, width: `${pct}%` }}/>
      </div>

      {/* Export buttons */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'24px', marginTop:'-12px' }}>
        <ExportButtons firmaId={firma.id} firmaNume={firma.nume} firmaSlug={firma.slug} lunaId={lunaData.id} lunaLabel={ll} culoare={firma.culoare}/>
      </div>

      {/* Module cards grid — cu reordonare */}
      <ModuleGrid
        modules={modules}
        firma={{ id: firma.id, slug: firma.slug, nume: firma.nume, culoare: firma.culoare }}
        luna={luna}
        slug={slug}
        lunaId={lunaData.id}
        taskMap={taskMap}
        restanteCount={restanteCount}
        dezactivate={dezactivate}
      />
    </main>
  )
}
