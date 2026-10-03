import Link from 'next/link'
import DocumenteGenerale from '@/components/DocumenteGenerale'
import FirmaQuickInfo from '@/components/FirmaQuickInfo'
import FacturiLocaleGlobal from '@/components/FacturiLocaleGlobal'
import { dbSelect } from '@/lib/db'
import { getRestanteCount } from '@/lib/queries'
import { getStardeskDiscrepanteCount } from '@/lib/stardeskVerify'
import { getFirmaModules, getFirmaTotalTasks } from '@/lib/firma-config'
import { rgb, legibil, tint } from '@/lib/colors'
import { accountingFullLabel, accountingPeriodLabel, currentWorkMonthKey } from '@/lib/accounting-period'

export const dynamic = 'force-dynamic'

const LUNA = currentWorkMonthKey()
function ini(n: string) { return n.split(' ').filter((w:string) => /^[A-ZĂÎȘȚ]/.test(w)).slice(0,2).map((w:string)=>w[0]).join('') }

export default async function Dashboard() {
  const [firme, luni] = await Promise.all([
    dbSelect('firme', { eq: { activa: true }, order: 'created_at' }),
    dbSelect('luni_contabile', { select: '*' }),
  ])

  const luniMap: Record<string, any> = {}
  for (const l of luni) luniMap[`${l.firma_id}_${l.luna?.slice(0,7)}`] = l

  // Doar luna curenta pe firmele active - task_stari creste nemarginit in timp, nu are rost
  // sa citim tot istoricul doar ca sa aratam procentul lunii afisate acum pe Dashboard.
  const lunaIds = firme.map((f: any) => luniMap[`${f.id}_${LUNA}`]?.id).filter(Boolean)
  const [taskStariRaw, proprietariRaw] = await Promise.all([
    lunaIds.length ? dbSelect('task_stari', { select: 'luna_id,completat', in: { luna_id: lunaIds } }) : Promise.resolve([]),
    dbSelect('proprietari', { select: 'id,firma_id,nume,serie_ci,numar_ci', order: 'ordine' }),
  ])

  const taskCount: Record<string, { done: number }> = {}
  for (const ts of taskStariRaw) {
    if (!taskCount[ts.luna_id]) taskCount[ts.luna_id] = { done: 0 }
    if (ts.completat) taskCount[ts.luna_id].done++
  }

  const proprietariMap: Record<string, any[]> = {}
  for (const p of proprietariRaw) {
    if (!proprietariMap[p.firma_id]) proprietariMap[p.firma_id] = []
    proprietariMap[p.firma_id].push(p)
  }

  // Restante per firma - vizibile direct din dashboard, fara sa intri in fiecare firma.
  const restanteCounts = await Promise.all(firme.map((f: any) => getRestanteCount(f.id)))
  const restanteMap: Record<string, number> = {}
  firme.forEach((f: any, i: number) => { restanteMap[f.id] = restanteCounts[i] })
  const totalRestante = restanteCounts.reduce((sum, n) => sum + n, 0)
  const firmeCuRestante = restanteCounts.filter(n => n > 0).length

  // Discrepante de pret 5StarDesk (factura gasita, dar suma nu corespunde cu borderoul) - trebuie
  // sesizate la timp, cat mai poate fi emisa o factura corectata, nu doar la o verificare manuala.
  const discrepanteCounts = await Promise.all(firme.map((f: any) => {
    const lunaData = luniMap[`${f.id}_${LUNA}`]
    const are5stardesk = getFirmaModules(f.slug).some((m: any) => m.slug === '5stardesk')
    return are5stardesk && lunaData ? getStardeskDiscrepanteCount(lunaData.id) : Promise.resolve(0)
  }))
  const discrepanteMap: Record<string, number> = {}
  firme.forEach((f: any, i: number) => { discrepanteMap[f.id] = discrepanteCounts[i] })
  const totalDiscrepante = discrepanteCounts.reduce((sum, n) => sum + n, 0)
  const firmeCuDiscrepante = discrepanteCounts.filter(n => n > 0).length

  const ll = accountingFullLabel(LUNA)

  // Agregate pentru banda de indicatori - calculate o singura data, aceleasi formule ca pe carduri.
  const firmeStats = firme.map((f: any) => {
    const lunaData = luniMap[`${f.id}_${LUNA}`]
    const total = getFirmaTotalTasks(f.slug)
    const done = lunaData ? (taskCount[lunaData.id]?.done || 0) : 0
    return { total, done, finalizata: !!lunaData && total > 0 && done >= total }
  })
  const sumTotal = firmeStats.reduce((s, x) => s + x.total, 0)
  const sumDone = firmeStats.reduce((s, x) => s + x.done, 0)
  const pctGlobal = sumTotal > 0 ? Math.round((sumDone / sumTotal) * 100) : 0
  const firmeFinalizate = firmeStats.filter(x => x.finalizata).length

  return (
    <main className="page animate-in">
      <div className="page-header">
        <div className="page-header-main">
          <div className="eyebrow" style={{ marginBottom: '8px' }}>Contabilitate {accountingPeriodLabel(LUNA)}</div>
          <h1 className="page-title" style={{ fontSize: 'var(--fs-2xl)' }}>Bună, Razvan</h1>
          <p className="page-subtitle">{ll} · {firme.length} firme active</p>
        </div>
      </div>

      {/* Indicatori lunari - tot ce cere atentie, vizibil fara sa intri in fiecare firma */}
      <div className="stat-grid" style={{ marginBottom: '28px' }}>
        <div className="stat">
          <div className="stat-label">Progres general</div>
          <div className="stat-value" style={{ color: pctGlobal === 100 ? 'var(--success)' : 'var(--text-primary)' }}>{pctGlobal}%</div>
          <div className="progress" style={{ marginTop: '10px' }}><span style={{ width: `${pctGlobal}%` }} /></div>
          <div className="stat-hint">{sumDone}/{sumTotal} task-uri</div>
        </div>
        <div className="stat">
          <div className="stat-label">Firme finalizate</div>
          <div className="stat-value">{firmeFinalizate}<span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>/{firme.length}</span></div>
          <div className="stat-hint">luna aceasta</div>
        </div>
        <div className="stat" style={totalRestante > 0 ? { borderColor: 'color-mix(in srgb, var(--danger) 35%, var(--border))' } : undefined}>
          <div className="stat-label">Facturi restante</div>
          <div className="stat-value" style={{ color: totalRestante > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>{totalRestante}</div>
          <div className="stat-hint">{totalRestante > 0 ? `în ${firmeCuRestante} ${firmeCuRestante === 1 ? 'firmă' : 'firme'}` : 'nimic restant'}</div>
        </div>
        <div className="stat" style={totalDiscrepante > 0 ? { borderColor: 'color-mix(in srgb, var(--warning) 35%, var(--border))' } : undefined}>
          <div className="stat-label">Discrepanțe 5StarDesk</div>
          <div className="stat-value" style={{ color: totalDiscrepante > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>{totalDiscrepante}</div>
          <div className="stat-hint">{totalDiscrepante > 0 ? `de preț, în ${firmeCuDiscrepante} ${firmeCuDiscrepante === 1 ? 'firmă' : 'firme'}` : 'fără diferențe de preț'}</div>
        </div>
      </div>

      <div className="section-title"><h2>Firme</h2></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: '12px', alignItems: 'start' }}>
        {firme.map((f: any) => {
          const lunaData = luniMap[`${f.id}_${LUNA}`]
          const total = getFirmaTotalTasks(f.slug)
          const done = lunaData ? (taskCount[lunaData.id]?.done || 0) : 0
          const pct = total > 0 ? Math.round((done / total) * 100) : 0
          const r = rgb(f.culoare)
          const isFinalizata = pct === 100 && lunaData
          const isStarted = done > 0
          const statusLabel = !lunaData ? 'Neîncepută' : isFinalizata ? 'Finalizată' : isStarted ? 'În lucru' : 'Neîncepută'
          const statusClass = isFinalizata ? 'badge badge-success' : isStarted ? 'badge badge-warning' : 'badge'
          const modules = getFirmaModules(f.slug)
          const restante = restanteMap[f.id] || 0
          const discrepante = discrepanteMap[f.id] || 0

          return (
            <div key={f.id} className="card" style={{ display: 'flex', flexDirection: 'column', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: 'var(--r-md)', flexShrink: 0,
                  background: `${tint(r,.14,.16)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'var(--fs-md)', fontWeight: 700, color: legibil(f.culoare),
                }}>
                  {ini(f.nume)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                    {f.nume}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                    <span className={statusClass}>{statusLabel}</span>
                    {restante > 0 && <span className="badge badge-danger">{restante} restante</span>}
                    {discrepante > 0 && <span className="badge badge-warning">{discrepante} discrepanțe preț</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 1, color: pct === 100 ? 'var(--success)' : 'var(--text-primary)' }}>
                    {pct}%
                  </div>
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {done}/{total} task-uri
                  </div>
                </div>
              </div>

              <div className={`progress${pct === 100 ? ' is-done' : ''}`} style={{ margin: '16px 0' }}>
                <span style={{ width: `${pct}%` }} />
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '16px' }} aria-label={`${modules.length} module`}>
                {modules.map(m => (
                  <span key={m.slug} style={{ fontSize: 'var(--fs-xs)', fontWeight: 500, padding: '3px 7px', borderRadius: 'var(--r-sm)', background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>
                    {m.label}
                  </span>
                ))}
              </div>

              {/* Proiectele (fără CUI - nu sunt firme reale) nu au date de firmă de arătat */}
              {f.cui && (
                <FirmaQuickInfo
                  cui={f.cui}
                  nrRegCom={f.nr_reg_com}
                  adresa={f.adresa}
                  judet={f.judet}
                  tara={f.tara}
                  proprietari={proprietariMap[f.id] || []}
                />
              )}

              <div style={{ marginTop: 'auto', paddingTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
                  {lunaData ? `${modules.length} module · ${total} task-uri lunare` : 'Lună neîncepută'}
                </span>
                <Link href={`/${f.slug}/${LUNA}`} className="btn btn-sm">
                  Deschide luna
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      <div className="section-title" style={{ marginTop: '32px' }}><h2>Documente</h2></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))', gap: '12px', alignItems: 'start' }}>
        <FacturiLocaleGlobal firme={firme.map((f: any) => ({ id: f.id, nume: f.nume }))} />
        <DocumenteGenerale />
      </div>
    </main>
  )
}
