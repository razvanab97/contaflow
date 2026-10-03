import { notFound } from 'next/navigation'
import InitLuna from './InitLuna'
import ProiectWorkflow from '@/components/ProiectWorkflow'
import ModuleGrid from './ModuleGrid'
import { dbSelect } from '@/lib/db'
import { getFirmaBySlug, getLuniContabile, getRestanteCount } from '@/lib/queries'
import { getFirmaModules } from '@/lib/firma-config'
import LunaSummary from './LunaSummary'
import ExportButtons from './ExportButtons'
import RecomandariLuna from '@/components/RecomandariLuna'
import { accountingFullLabel } from '@/lib/accounting-period'
import MonthNav from '@/components/ui/MonthNav'

export const dynamic = 'force-dynamic'

export default async function HubPage({ params }: { params: Promise<{firma:string;luna:string}> }) {
  const { firma: slug, luna } = await params

  const [firma, luni] = await Promise.all([
    getFirmaBySlug(slug),
    getLuniContabile(),
  ])
  if (!firma) notFound()

  const lunaData = luni.find((l: any) => l.firma_id === firma.id && l.luna?.startsWith(luna))
  if (!lunaData) return <main className="page" style={{ display: 'flex', flexDirection: 'column' }}><InitLuna firma={firma} luna={luna} /></main>

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
  const ll = accountingFullLabel(luna)

  const activeCount = activeModules.length
  const modulesDone = activeModules.filter(m => m.tasks.length > 0 && m.tasks.every(t => taskMap[t.key])).length

  return (
    <main className="page animate-in">
      <div className="page-header">
        <div className="page-header-main">
          <h1 className="page-title">
            <span className="dot" style={{ background: firma.culoare, width: '10px', height: '10px' }} />
            {firma.nume}
          </h1>
          <div style={{ marginTop: '12px' }}>
            <MonthNav slug={slug} luna={luna} />
          </div>
        </div>
        <div className="page-header-actions">
          <ExportButtons firmaId={firma.id} firmaNume={firma.nume} firmaSlug={firma.slug} lunaId={lunaData.id} lunaLabel={ll} culoare={firma.culoare}/>
        </div>
      </div>

      {/* Progresul lunii + concluzia financiara (apare cand exista date bancare) */}
      <div className="stat-grid" style={{ marginBottom: '28px' }}>
        <div className="stat" style={{ gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
            <div className="stat-label">Progresul lunii</div>
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{modulesDone}/{activeCount} module gata</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
            <span className="stat-value" style={{ marginTop: 0, color: pct === 100 ? 'var(--success)' : 'var(--text-primary)' }}>{pct}%</span>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>{done}/{total} task-uri</span>
          </div>
          <div className={`progress${pct === 100 ? ' is-done' : ''}`} style={{ marginTop: '12px' }}>
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
        <LunaSummary lunaId={lunaData.id} culoare={firma.culoare} />
      </div>

      {slug === 'proiect-ab-textile' && <ProiectWorkflow firmaId={firma.id} lunaId={lunaData.id} luna={luna} compact />}

      {/* Lista modulelor — cu reordonare */}
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

      <RecomandariLuna
        lunaId={lunaData.id}
        firmaId={firma.id}
        firmaSlug={firma.slug}
        firmaNume={firma.nume}
        lunaLabel={ll}
      />
    </main>
  )
}
