'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

type Perioada = 'azi' | 'luna_curenta' | 'luna_selectata' | 'an' | 'interval' | 'total'
interface Plata { id: string; data: string; descriere: string; suma: number; valuta: string; sumaLei: number | null }
interface Inclusa extends Plata { furnizor: string; sursa: 'auto' | 'manual' }
interface Candidat extends Plata { excluseManual: boolean }
interface Raspuns {
  from: string | null; to: string | null; migrare: boolean; faraCurs: number
  total: number; numar: number
  furnizori: { furnizor: string; suma: number; numar: number }[]
  tranzactii: Inclusa[]
  candidati: Candidat[]; candidatiTotal: number
}

const money = (v: number) => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0)
const dataRo = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`
const COLS = '84px 96px minmax(180px,1fr) 128px 92px'

function pill(activ: boolean): React.CSSProperties {
  return {
    fontSize: 'var(--fs-sm)', fontWeight: 600, padding: '5px 10px', borderRadius: 'var(--r-sm)', whiteSpace: 'nowrap', cursor: 'pointer',
    border: `1px solid ${activ ? 'var(--purple)' : 'var(--border)'}`,
    background: activ ? 'var(--purple-soft)' : 'transparent', color: activ ? 'var(--purple)' : 'var(--text-secondary)',
  }
}

function Suma({ p }: { p: Plata }) {
  return (
    <div className="num" style={{ textAlign: 'right' }}>
      <div style={{ fontWeight: 650, color: 'var(--text-primary)' }}>{p.sumaLei != null ? `${money(p.sumaLei)} lei` : '—'}</div>
      {p.valuta !== 'RON' && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{money(p.suma)} {p.valuta}{p.sumaLei == null ? ' · fără curs BNR' : ''}</div>}
    </div>
  )
}

// Fereastra "Achizitii produse": total + defalcare pe furnizor pe orice perioada, tranzactiile din
// spatele fiecarei sume si corectia manuala (se salveaza pe tranzactie si bate regula automata).
export default function AchizitiiProduse({ firmaId, lunaId, lunaLabel, onClose, onChanged }: {
  firmaId: string; lunaId: string; lunaLabel?: string; onClose: () => void; onChanged: () => void
}) {
  const [perioada, setPerioada] = useState<Perioada>('luna_selectata')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [date, setDate] = useState<Raspuns | null>(null)
  const [loading, setLoading] = useState(true)
  const [eroare, setEroare] = useState('')
  const [furnizor, setFurnizor] = useState<string | null>(null)
  const [cautare, setCautare] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const cerere = useRef(0)

  const incarca = useCallback(async (silent = false) => {
    if (perioada === 'interval' && !(from && to)) return
    const n = ++cerere.current
    if (!silent) setLoading(true)
    const q = new URLSearchParams({ firmaId, perioada, lunaId })
    if (perioada === 'interval') { q.set('from', from); q.set('to', to) }
    try {
      const res = await fetch(`/api/achizitii-produse?${q}`)
      const d = await res.json().catch(() => ({}))
      if (n !== cerere.current) return
      if (!res.ok) { setEroare(d.error || 'Nu am putut încărca achizițiile'); setDate(null) }
      else { setEroare(''); setDate(d) }
    } catch {
      if (n === cerere.current) { setEroare('Nu am putut încărca achizițiile'); setDate(null) }
    }
    if (n === cerere.current) setLoading(false)
  }, [firmaId, lunaId, perioada, from, to])

  useEffect(() => { setFurnizor(null); incarca() }, [incarca])

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  async function marcheaza(id: string, valoare: boolean | null) {
    setBusyId(id); setEroare('')
    const res = await fetch('/api/tranzactii/achizitie-produse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, valoare }) }).catch(() => null)
    setBusyId(null)
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {}
      setEroare(d.error || 'Nu am putut salva corecția')
      return
    }
    await incarca(true)
    onChanged()
  }

  const PERIOADE: { k: Perioada; l: string }[] = [
    { k: 'azi', l: 'Astăzi' }, { k: 'luna_curenta', l: 'Luna curentă' },
    { k: 'luna_selectata', l: 'Luna selectată' },
    { k: 'an', l: 'Anul curent' }, { k: 'interval', l: 'Interval personalizat' }, { k: 'total', l: 'Total general' },
  ]
  const randuri = (date?.tranzactii || []).filter(t => !furnizor || t.furnizor === furnizor)
  const sumaVizibila = randuri.reduce((a, t) => a + (t.sumaLei || 0), 0)
  const q = cautare.trim().toLowerCase()
  const candidati = (date?.candidati || []).filter(c => !q || `${c.descriere} ${c.suma} ${c.data} ${dataRo(c.data)}`.toLowerCase().includes(q)).slice(0, 60)
  const maxFurnizor = Math.max(...(date?.furnizori.map(f => f.suma) || [0]), 1)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }} role="dialog" aria-modal="true" aria-label="Achiziții produse">
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)' }} />
      <div className="glass-floating" style={{ position: 'relative', width: 'min(860px, 96vw)', height: '100%', overflowY: 'auto', padding: '24px 26px', borderLeft: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
          <div>
            <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>Achiziții produse</h2>
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', marginTop: '2px' }}>Banii plătiți furnizorilor de marfă, în lei la cursul BNR din ziua plății. Fac parte din Plăți.</p>
          </div>
          <button onClick={onClose} aria-label="Închide" style={{ fontSize: 'var(--fs-base)', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {PERIOADE.map(p => <button key={p.k} onClick={() => setPerioada(p.k)} style={pill(perioada === p.k)}>{p.l}</button>)}
        </div>
        {perioada === 'interval' && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
            De la <input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="De la" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', borderRadius: 'var(--r-sm)', padding: '4px 8px' }} />
            până la <input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="Până la" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', borderRadius: 'var(--r-sm)', padding: '4px 8px' }} />
            {!(from && to) && <span style={{ color: 'var(--text-muted)' }}>Alege ambele date.</span>}
          </div>
        )}

        {date && !date.migrare && (
          <div role="note" style={{ margin: '4px 0 12px', padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'var(--warning-soft)', color: 'var(--warning)', fontSize: 'var(--fs-sm)' }}>
            Regula automată funcționează. Pentru corecția manuală (marchează / elimină) rulează o dată <b>supabase_tranzactii_achizitie_produse.sql</b> în Supabase.
          </div>
        )}
        {eroare && <div role="alert" style={{ margin: '4px 0 12px', padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'var(--danger-soft)', color: 'var(--danger)', fontSize: 'var(--fs-sm)' }}>{eroare}</div>}

        {loading && !date ? (
          <div className="skeleton" style={{ height: '220px', borderRadius: 'var(--r-lg)' }} aria-busy="true" />
        ) : date && (
          <>
            <button onClick={() => setFurnizor(null)} title="Arată toate tranzacțiile" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '14px 16px', marginBottom: '10px', borderRadius: 'var(--r-md)', cursor: 'pointer', background: furnizor === null ? 'var(--purple-soft)' : 'var(--surface-secondary)', border: `1px solid ${furnizor === null ? 'var(--purple)' : 'var(--border)'}` }}>
              <div className="eyebrow">Total bani investiți în produse{date.from ? ` · ${dataRo(date.from)} – ${dataRo(date.to || date.from)}` : perioada === 'luna_selectata' && lunaLabel ? ` · ${lunaLabel}` : ''}</div>
              <div className="num" style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>{money(date.total)} <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', fontWeight: 500 }}>lei · {date.numar} {date.numar === 1 ? 'plată' : 'plăți'}</span></div>
              {date.faraCurs > 0 && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--warning)', marginTop: '4px' }}>⚠ {date.faraCurs} plăți în valută fără curs BNR nu sunt incluse în total.</div>}
            </button>

            {date.furnizori.length === 0 ? (
              <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: '12px 0 18px' }}>Nicio achiziție de produse în această perioadă.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '18px' }}>
                {date.furnizori.map(f => (
                  <button key={f.furnizor} onClick={() => setFurnizor(furnizor === f.furnizor ? null : f.furnizor)} aria-pressed={furnizor === f.furnizor}
                    style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '9px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer', overflow: 'hidden', background: 'var(--surface)', border: `1px solid ${furnizor === f.furnizor ? 'var(--purple)' : 'var(--border)'}` }}>
                    <span aria-hidden style={{ position: 'absolute', inset: '0 auto 0 0', width: `${Math.max(2, (f.suma / maxFurnizor) * 100)}%`, background: 'var(--purple-soft)', opacity: .55 }} />
                    <span style={{ position: 'relative', fontWeight: 600, color: 'var(--text-primary)' }}>{f.furnizor} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>· {f.numar} {f.numar === 1 ? 'plată' : 'plăți'}</span></span>
                    <span className="num" style={{ position: 'relative', fontWeight: 650, color: 'var(--text-primary)' }}>{money(f.suma)} lei</span>
                  </button>
                ))}
              </div>
            )}

            {randuri.length > 0 && (
              <div style={{ overflowX: 'auto', marginBottom: '22px' }}>
                <div className="eyebrow" style={{ marginBottom: '6px' }}>Tranzacții{furnizor ? ` · ${furnizor}` : ''} · {money(sumaVizibila)} lei</div>
                <div style={{ minWidth: '640px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
                  <div className="eyebrow" style={{ display: 'grid', gridTemplateColumns: COLS, gap: '10px', padding: '8px 12px', background: 'var(--surface-secondary)' }}>
                    <span>Data</span><span>Furnizor</span><span>Descriere tranzacție</span><span style={{ textAlign: 'right' }}>Sumă</span><span />
                  </div>
                  {randuri.map(t => (
                    <div key={t.id} style={{ display: 'grid', gridTemplateColumns: COLS, gap: '10px', alignItems: 'center', padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', fontSize: 'var(--fs-sm)' }}>
                      <span className="num" style={{ color: 'var(--text-secondary)' }}>{dataRo(t.data)}</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.furnizor}{t.sursa === 'manual' && <span className="badge badge-accent" style={{ marginLeft: '6px' }} title="Marcată manual">manual</span>}</span>
                      <span title={t.descriere} style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.descriere || '—'}</span>
                      <Suma p={t} />
                      <button onClick={() => marcheaza(t.id, false)} disabled={busyId === t.id || !date.migrare} title="Elimină din Achiziții produse" className="btn btn-sm" style={{ color: 'var(--danger)', opacity: busyId === t.id ? .6 : 1 }}>Elimină</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <details style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
              <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Alte plăți din perioadă ({date.candidatiTotal}) · marchează ca achiziție de produse
              </summary>
              <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', margin: '8px 0' }}>Fără comisioane, schimburi valutare, impozite și împrumuturi. Ce marchezi aici se salvează și rămâne peste regula automată.</p>
              <input value={cautare} onChange={e => setCautare(e.target.value)} placeholder="Caută după descriere, sumă sau dată…" aria-label="Caută în plăți" style={{ width: '100%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', borderRadius: 'var(--r-sm)', padding: '7px 10px', marginBottom: '8px' }} />
              {candidati.length === 0 ? (
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', padding: '8px 0' }}>Nicio plată găsită.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: '640px' }}>
                    {candidati.map(c => (
                      <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '84px minmax(180px,1fr) 128px 140px', gap: '10px', alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--border-subtle)', fontSize: 'var(--fs-sm)' }}>
                        <span className="num" style={{ color: 'var(--text-secondary)' }}>{dataRo(c.data)}</span>
                        <span title={c.descriere} style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.descriere || '—'}{c.excluseManual && <span className="badge badge-warning" style={{ marginLeft: '6px' }}>exclusă manual</span>}</span>
                        <Suma p={c} />
                        {c.excluseManual
                          ? <button onClick={() => marcheaza(c.id, null)} disabled={busyId === c.id || !date.migrare} className="btn btn-sm" title="Revine la regula automată">Revino la automat</button>
                          : <button onClick={() => marcheaza(c.id, true)} disabled={busyId === c.id || !date.migrare} className="btn btn-sm" title="Marchează ca → Achiziție produse">Marchează ca produs</button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {date.candidatiTotal > candidati.length && !q && <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '6px' }}>Se arată primele {candidati.length} din {date.candidatiTotal} — folosește căutarea pentru restul.</p>}
            </details>
          </>
        )}
      </div>
    </div>
  )
}
