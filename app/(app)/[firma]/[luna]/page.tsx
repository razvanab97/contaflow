import { notFound } from 'next/navigation'
import InitLuna from './InitLuna'
import ProiectWorkflow from '@/components/ProiectWorkflow'
import ModuleGrid from './ModuleGrid'
import { dbSelect } from '@/lib/db'
import { getFirmaBySlug, getLuniContabile, getRestanteCount } from '@/lib/queries'
import { getFirmaModules, esteLunaCalendaristica } from '@/lib/firma-config'
import LunaSummary from './LunaSummary'
import ExportButtons from './ExportButtons'
import RecomandariLuna from '@/components/RecomandariLuna'
import { etichetaLunaCompleta } from '@/lib/accounting-period'
import MonthNav from '@/components/ui/MonthNav'
import ProgressRing from '@/components/ui/ProgressRing'
import Icon, { MODULE_ICONS } from '@/components/ui/Icon'
import Link from 'next/link'

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
  const calendar = esteLunaCalendaristica(slug)
  const ll = etichetaLunaCompleta(luna, calendar)

  const activeCount = activeModules.length
  const modulesDone = activeModules.filter(m => m.tasks.length > 0 && m.tasks.every(t => taskMap[t.key])).length
  // Urmatorul pas recomandat: primul modul activ, in ordinea de lucru a firmei, cu task-uri nebifate.
  const nextModule = activeModules.find(m => m.tasks.some(t => !taskMap[t.key]))
  const nextModuleDone = nextModule ? nextModule.tasks.filter(t => taskMap[t.key]).length : 0

  return (
    <main className="page animate-in">
      <section className="hero">
        <div className="hero-grid">
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow" style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="dot" style={{ background: firma.culoare, boxShadow: '0 0 0 4px var(--brand-glow)' }} />
              {calendar ? 'Rutina lunii' : 'Contabilitate lunară'}
            </div>
            <h1 className="hero-title">{firma.nume}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '16px' }}>
              <MonthNav slug={slug} luna={luna} />
              <ExportButtons firmaId={firma.id} firmaNume={firma.nume} firmaSlug={firma.slug} lunaId={lunaData.id} lunaLabel={ll} culoare={firma.culoare}/>
            </div>
            {nextModule ? (
              <div className="hero-next">
                <div style={{ width: '36px', height: '36px', borderRadius: 'var(--r-md)', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={MODULE_ICONS[nextModule.slug] || 'fileText'} size={18} />
                </div>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div className="eyebrow">Următorul pas</div>
                  <div style={{ fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {nextModule.label} <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>· {nextModuleDone}/{nextModule.tasks.length} task-uri</span>
                  </div>
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nextModule.description}</div>
                </div>
                <Link href={`/${slug}/${luna}/${nextModule.linkDirect || nextModule.slug}`} className="btn btn-primary">
                  Continuă <Icon name="arrowRight" size={15} />
                </Link>
              </div>
            ) : (
              <div className="hero-next" style={{ borderColor: 'color-mix(in srgb, var(--success) 35%, var(--border))' }}>
                <Icon name="check" size={18} style={{ color: 'var(--success)' }} strokeWidth={2.25} />
                <div style={{ fontSize: 'var(--fs-md)', color: 'var(--text-primary)', fontWeight: 600 }}>Toate modulele active sunt bifate pentru luna aceasta.</div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', justifySelf: 'center' }}>
            <ProgressRing pct={pct} size={128} stroke={10} title={`Progresul lunii: ${pct}%`} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}><span className="num" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{done}/{total}</span> task-uri</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{modulesDone}/{activeCount} module gata</div>
            </div>
          </div>
        </div>
      </section>

      {/* Concluzia financiara a lunii (din extrasele bancare), cu tendinta pe ultimele 6 luni */}
      <LunaSummary lunaId={lunaData.id} culoare={firma.culoare} firmaId={firma.id} firmaSlug={firma.slug} luna={luna} lunaLabel={ll} />

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
