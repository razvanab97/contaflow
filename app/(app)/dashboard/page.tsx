import Link from 'next/link'
import DocumenteGenerale from '@/components/DocumenteGenerale'
import FirmaQuickInfo from '@/components/FirmaQuickInfo'
import FacturiLocaleGlobal from '@/components/FacturiLocaleGlobal'
import { dbSelect } from '@/lib/db'
import { getRestanteCount } from '@/lib/queries'
import { getFirmaModules, getFirmaTotalTasks } from '@/lib/firma-config'
import { rgb, legibil, tint } from '@/lib/colors'
import { accountingFullLabel, currentWorkMonthKey } from '@/lib/accounting-period'

export const dynamic = 'force-dynamic'

const LUNA = currentWorkMonthKey()
function ini(n: string) { return n.split(' ').filter((w:string) => /^[A-ZĂÎȘȚ]/.test(w)).slice(0,2).map((w:string)=>w[0]).join('') }

export default async function Dashboard() {
  const [firme, luni, taskStariRaw, proprietariRaw] = await Promise.all([
    dbSelect('firme', { eq: { activa: true }, order: 'created_at' }),
    dbSelect('luni_contabile', { select: '*' }),
    dbSelect('task_stari', { select: 'luna_id,completat' }),
    dbSelect('proprietari', { select: 'id,firma_id,nume,serie_ci,numar_ci', order: 'ordine' }),
  ])

  const luniMap: Record<string, any> = {}
  for (const l of luni) luniMap[`${l.firma_id}_${l.luna?.slice(0,7)}`] = l

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

  const ll = accountingFullLabel(LUNA)

  return (
    <>
      <main className="pt-20 px-4 pb-10 md:pt-12 md:px-[52px] md:pb-12" style={{ flex: 1, width: '100%' }}>
        <div style={{ marginBottom: '40px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
            Contaflow · Dashboard
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.6px', lineHeight: 1.25 }}>
            Bună, Razvan
          </h1>
          <p style={{ fontSize: '13px', fontWeight: 450, color: 'var(--text-secondary)', marginTop: '6px' }}>
            {ll} · {firme.length} firme active
            {totalRestante > 0 && (
              <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                {' · '}{totalRestante} facturi restante în {firmeCuRestante} {firmeCuRestante === 1 ? 'firmă' : 'firme'}
              </span>
            )}
          </p>
        </div>

        <FacturiLocaleGlobal firme={firme.map((f: any) => ({ id: f.id, nume: f.nume }))} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))', gap: '12px' }}>
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
              ? { bg: 'var(--success-soft)', c: 'var(--success)' }
              : isStarted ? { bg: 'var(--warning-soft)', c: 'var(--warning)' }
              : { bg: 'var(--surface-secondary)', c: 'var(--text-muted)' }
            const modules = getFirmaModules(f.slug)
            const restante = restanteMap[f.id] || 0

            return (
              <div key={f.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px 28px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '18px' }}>
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '10px', flexShrink: 0,
                    background: `${tint(r,.12)}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '13px', fontWeight: 700, color: legibil(f.culoare),
                  }}>
                    {ini(f.nume)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>
                        {f.nume}
                      </span>
                      <span style={{ fontSize: '11.5px', fontWeight: 600, padding: '2px 9px', borderRadius: '20px', background: statusStyle.bg, color: statusStyle.c }}>
                        {statusLabel}
                      </span>
                      {restante > 0 && (
                        <span style={{
                          fontSize: '11.5px', fontWeight: 600, color: 'var(--danger)',
                          background: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)',
                          borderRadius: '20px', padding: '2px 9px',
                        }}>
                          {restante} restante
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12.5px', fontWeight: 450, color: 'var(--text-muted)' }}>
                      {modules.length} module · {total} task-uri lunare
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-1px', lineHeight: 1, color: pct === 100 ? 'var(--success)' : 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                      {pct}%
                    </div>
                    <div style={{ fontSize: '12.5px', fontWeight: 450, color: 'var(--text-muted)', marginTop: '3px' }}>
                      {done}/{total} task-uri
                    </div>
                  </div>
                </div>

                <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', marginBottom: '18px' }}>
                  <div style={{ height: '3px', borderRadius: '2px', background: pct === 100 ? 'var(--success)' : 'var(--accent)', width: `${pct}%` }}/>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '18px' }}>
                  {modules.map(m => (
                    <span key={m.slug} style={{ fontSize: '11.5px', fontWeight: 500, padding: '3px 8px', borderRadius: '5px', background: 'var(--surface-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
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

                <div style={{ marginTop: '18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 450, color: 'var(--text-muted)' }}>
                    {lunaData ? ll : `${ll} · lună neîncepută`}
                  </span>
                  <Link href={`/${f.slug}/${LUNA}`} className="link-accent" style={{
                    fontSize: '13px', fontWeight: 600, color: 'var(--accent)',
                    letterSpacing: '-0.1px',
                  }}>
                    Deschide →
                  </Link>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: '28px' }}>
          <DocumenteGenerale />
        </div>
      </main>
    </>
  )
}
