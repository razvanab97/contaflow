import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { dbSelect } from '@/lib/db'
import { getFirmaModules, getFirmaTotalTasks } from '@/lib/firma-config'

const LUNA = new Date().toISOString().slice(0, 7)
const LUNI_FULL = ['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
function lunaLabel(s: string) { const [y,m]=s.split('-'); return `${LUNI_FULL[+m]} ${y}` }
function ini(n: string) { return n.split(' ').filter((w:string) => /^[A-ZĂÎȘȚ]/.test(w)).slice(0,2).map((w:string)=>w[0]).join('') }
function rgb(h: string) { return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}` }

export default async function Dashboard() {
  const [firme, luni, taskStariRaw] = await Promise.all([
    dbSelect('firme', { eq: { activa: true }, order: 'created_at' }),
    dbSelect('luni_contabile', { select: '*' }),
    dbSelect('task_stari', { select: 'luna_id,completat' }),
  ])

  const luniMap: Record<string, any> = {}
  for (const l of luni) luniMap[`${l.firma_id}_${l.luna?.slice(0,7)}`] = l

  const taskCount: Record<string, { done: number }> = {}
  for (const ts of taskStariRaw) {
    if (!taskCount[ts.luna_id]) taskCount[ts.luna_id] = { done: 0 }
    if (ts.completat) taskCount[ts.luna_id].done++
  }

  const firmeNav = firme.map((f: any) => {
    const lunaData = luniMap[`${f.id}_${LUNA}`]
    const total = getFirmaTotalTasks(f.slug)
    const done = lunaData ? (taskCount[lunaData.id]?.done || 0) : 0
    return { id: f.id, slug: f.slug, nume: f.nume, culoare: f.culoare, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
  })

  const ll = lunaLabel(LUNA)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0A0A0A' }}>
      <Sidebar firme={firmeNav} lunaCurenta={LUNA} lunaLabel={ll} />

      <main style={{ flex: 1, padding: '48px 52px', maxWidth: '860px' }}>
        <div style={{ marginBottom: '40px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#666', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: '10px' }}>
            Contaflow · Dashboard
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#FFF', letterSpacing: '-0.6px', lineHeight: 1.2 }}>
            Bună, Razvan
          </h1>
          <p style={{ fontSize: '13px', color: '#999', marginTop: '6px' }}>
            {ll} · {firme.length} firme active
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {firme.map((f: any) => {
            const lunaData = luniMap[`${f.id}_${LUNA}`]
            const total = getFirmaTotalTasks(f.slug)
            const done = lunaData ? (taskCount[lunaData.id]?.done || 0) : 0
            const pct = total > 0 ? Math.round((done / total) * 100) : 0
            const r = rgb(f.culoare)
            const isFinalizata = pct === 100 && lunaData
            const isStarted = done > 0
            const statusLabel = !lunaData ? 'Neîncepută' : isFinalizata ? 'Finalizată' : isStarted ? 'În lucru' : 'Neîncepută'
            const statusStyle = isFinalizata
              ? { bg: 'rgba(110,231,176,.09)', c: '#6EE7B0' }
              : isStarted ? { bg: 'rgba(245,201,106,.08)', c: '#F5C96A' }
              : { bg: '#161616', c: '#3A3A3A' }
            const modules = getFirmaModules(f.slug)

            return (
              <div key={f.id} style={{ background: '#111', border: '1px solid #1E1E1E', borderRadius: '16px', padding: '24px 28px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '18px' }}>
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '10px', flexShrink: 0,
                    background: `rgba(${r},.12)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '13px', fontWeight: 700, color: f.culoare,
                  }}>
                    {ini(f.nume)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 600, color: '#EFEFEF', letterSpacing: '-0.2px' }}>
                        {f.nume}
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 9px', borderRadius: '20px', background: statusStyle.bg, color: statusStyle.c }}>
                        {statusLabel}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      {modules.length} module · {total} task-uri lunare
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-1px', lineHeight: 1, color: pct === 100 ? '#6EE7B0' : f.culoare }}>
                      {pct}%
                    </div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '3px' }}>
                      {done}/{total} task-uri
                    </div>
                  </div>
                </div>

                <div style={{ height: '2px', background: '#1A1A1A', borderRadius: '2px', marginBottom: '18px' }}>
                  <div style={{ height: '2px', borderRadius: '2px', background: pct === 100 ? '#6EE7B0' : f.culoare, width: `${pct}%` }}/>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '18px' }}>
                  {modules.map(m => (
                    <span key={m.slug} style={{ fontSize: '11px', fontWeight: 500, padding: '3px 8px', borderRadius: '5px', background: '#161616', border: '1px solid #222', color: '#777' }}>
                      {m.label}
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: '#999' }}>
                    {lunaData ? ll : `${ll} · lună neîncepută`}
                  </span>
                  <Link href={`/${f.slug}/${LUNA}`} style={{
                    fontSize: '12px', fontWeight: 600, color: f.culoare,
                    padding: '7px 16px', borderRadius: '8px',
                    border: `1px solid rgba(${r},.25)`,
                    background: `rgba(${r},.06)`,
                    letterSpacing: '-0.1px',
                  }}>
                    Deschide →
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
