import { notFound } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import InitLuna from './InitLuna'
import { dbSelect } from '@/lib/db'
import { getFirmaModules, getFirmaTotalTasks, getFirmaConfig, MODULE_DEFS, ModuleDef } from '@/lib/firma-config'

const LUNI_FULL = ['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
function lunaLabel(s: string) { const [y,m]=s.split('-'); return `${LUNI_FULL[+m]} ${y}` }
function rgb(h: string) { return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}` }
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
  const r = rgb(firma.culoare)
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

        {/* Module cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
          {modules.map(mod => {
            const modTasks = mod.tasks
            const modDone = modTasks.filter(t => taskMap[t.key]).length
            const modTotal = modTasks.length
            const modPct = modTotal > 0 ? Math.round((modDone/modTotal)*100) : 0
            const isComplete = modDone === modTotal
            const isStarted = modDone > 0

            const statusLabel = isComplete ? 'Gata' : isStarted ? 'În lucru' : 'Neînceput'
            const statusStyle = isComplete
              ? { bg: 'rgba(110,231,176,.08)', c: '#6EE7B0', border: 'rgba(110,231,176,.18)' }
              : isStarted
              ? { bg: 'rgba(245,201,106,.07)', c: '#F5C96A', border: 'rgba(245,201,106,.18)' }
              : { bg: '#161616', c: '#3A3A3A', border: '#222' }

            const href = mod.linkDirect
              ? `/${slug}/${luna}/${mod.linkDirect}`
              : `/${slug}/${luna}/${mod.slug}`

            return (
              <Link key={mod.slug} href={href} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: '#111', border: '1px solid #1E1E1E',
                  borderRadius: '14px', padding: '20px 22px',
                  cursor: 'pointer', height: '100%',
                  display: 'flex', flexDirection: 'column', gap: '14px',
                  transition: 'border-color .2s, background .2s',
                }}>
                  {/* Card header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#E8E8E8', letterSpacing: '-0.2px', marginBottom: '3px' }}>
                        {mod.label}
                      </div>
                      <div style={{ fontSize: '12px', color: '#888', lineHeight: 1.4 }}>
                        {mod.description}
                      </div>
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 600, padding: '3px 9px',
                      borderRadius: '20px', flexShrink: 0,
                      background: statusStyle.bg, color: statusStyle.c,
                      border: `1px solid ${statusStyle.border}`,
                    }}>
                      {statusLabel}
                    </span>
                  </div>

                  {/* Progress */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '7px' }}>
                      <span style={{ fontSize: '12px', color: '#888' }}>
                        {modDone}/{modTotal} task-uri
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: isComplete ? '#6EE7B0' : firma.culoare }}>
                        {modPct}%
                      </span>
                    </div>
                    <div style={{ height: '2px', background: '#1A1A1A', borderRadius: '2px' }}>
                      <div style={{
                        height: '2px', borderRadius: '2px',
                        background: isComplete ? '#6EE7B0' : firma.culoare,
                        width: `${modPct}%`,
                      }}/>
                    </div>
                  </div>

                  {/* Task list preview */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {modTasks.map(t => (
                      <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '14px', height: '14px', borderRadius: '4px', flexShrink: 0,
                          background: taskMap[t.key] ? `rgba(${r},.15)` : '#1A1A1A',
                          border: taskMap[t.key] ? `1px solid rgba(${r},.4)` : '1px solid #252525',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {taskMap[t.key] && (
                            <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke={firma.culoare} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 500, color: taskMap[t.key] ? '#777' : '#AAA', textDecoration: taskMap[t.key] ? 'line-through' : 'none' }}>
                          {t.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Open link */}
                  <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: firma.culoare }}>
                      Deschide →
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </main>
    </div>
  )
}
