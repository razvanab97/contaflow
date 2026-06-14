import { notFound } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import InitLuna from './InitLuna'
import ModuleGrid from './ModuleGrid'
import { dbSelect } from '@/lib/db'
import { getFirmaModules, getFirmaTotalTasks } from '@/lib/firma-config'
import LunaSummary from './LunaSummary'

const LUNI_FULL = ['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
function lunaLabel(s: string) { const [y,m]=s.split('-'); return `${LUNI_FULL[+m]} ${y}` }
function prevLuna(luna: string) { const d = new Date(luna+'-01'); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7) }
function nextLuna(luna: string) { const d = new Date(luna+'-01'); d.setMonth(d.getMonth()+1); return d.toISOString().slice(0,7) }

export default async function HubPage({ params }: { params: Promise<{firma:string;luna:string}> }) {
  const { firma: slug, luna } = await params

  const [firmeRaw, toateFirmele, luni] = await Promise.all([
    dbSelect('firme', { eq: { slug } }),
    dbSelect('firme', { eq: { activa: true }, order: 'created_at' }),
    dbSelect('luni_contabile', { select: '*' }),
  ])

  const firma = firmeRaw[0]
  if (!firma) notFound()

  const lunaData = luni.find((l: any) => l.firma_id === firma.id && l.luna?.startsWith(luna))
  if (!lunaData) return <InitLuna firma={firma} luna={luna} />

  const taskStariRaw = await dbSelect('task_stari', { eq: { luna_id: lunaData.id }, select: 'task_key,completat' })

  const taskMap: Record<string, boolean> = {}
  for (const ts of taskStariRaw) taskMap[ts.task_key] = ts.completat

  const luniMap: Record<string, any> = {}
  for (const l of luni) luniMap[`${l.firma_id}_${l.luna?.slice(0,7)}`] = l

  const taskCount: Record<string, { done: number }> = {}
  const allTaskStari = await dbSelect('task_stari', { select: 'luna_id,completat' })
  for (const ts of allTaskStari) {
    if (!taskCount[ts.luna_id]) taskCount[ts.luna_id] = { done: 0 }
    if (ts.completat) taskCount[ts.luna_id].done++
  }

  const firmeNav = toateFirmele.map((f: any) => {
    const ld = luniMap[`${f.id}_${luna}`]
    const total = getFirmaTotalTasks(f.slug)
    const done = ld ? (taskCount[ld.id]?.done || 0) : 0
    return { id: f.id, slug: f.slug, nume: f.nume, culoare: f.culoare, pct: total > 0 ? Math.round((done/total)*100) : 0 }
  })

  const modules = getFirmaModules(slug)
  const total = getFirmaTotalTasks(slug)
  const done = taskStariRaw.filter((ts: any) => ts.completat).length
  const pct = total > 0 ? Math.round((done/total)*100) : 0
  const ll = lunaLabel(luna)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0A0A0A' }}>
      <Sidebar
        firme={firmeNav}
        lunaCurenta={luna}
        lunaLabel={ll}
        firmaAtiva={slug}
        moduleFirma={modules}
      />

      <main style={{ flex: 1, padding: '44px 52px', maxWidth: '1000px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '36px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: firma.culoare }}/>
              <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#FFF', letterSpacing: '-0.4px' }}>
                {firma.nume}
              </h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginLeft: '20px' }}>
              <Link href={`/${slug}/${prevLuna(luna)}`} style={{ fontSize: '12px', color: '#888', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
              </Link>
              <span style={{ fontSize: '14px', fontWeight: 500, color: '#AAA' }}>{ll}</span>
              <Link href={`/${slug}/${nextLuna(luna)}`} style={{ fontSize: '12px', color: '#888', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
              </Link>
            </div>
          </div>

          <LunaSummary lunaId={lunaData.id} culoare={firma.culoare} />

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '-1px', color: pct === 100 ? '#6EE7B0' : firma.culoare, lineHeight: 1 }}>
              {pct}%
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {done}/{total} task-uri
            </div>
          </div>
        </div>

        {/* Total progress bar */}
        <div style={{ height: '2px', background: '#1A1A1A', borderRadius: '2px', marginBottom: '36px' }}>
          <div style={{ height: '2px', borderRadius: '2px', background: pct === 100 ? '#6EE7B0' : firma.culoare, width: `${pct}%` }}/>
        </div>

        {/* Module cards grid — cu reordonare */}
        <ModuleGrid
          modules={modules}
          firma={{ id: firma.id, slug: firma.slug, nume: firma.nume, culoare: firma.culoare }}
          luna={luna}
          slug={slug}
          taskMap={taskMap}
        />
      </main>
    </div>
  )
}
