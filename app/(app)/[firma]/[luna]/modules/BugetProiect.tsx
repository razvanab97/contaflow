'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BUGET_INTEGRAL, BUGET_VERSIUNE } from '@/lib/proiect-buget-date'
import { executieBuget, categorieScurta, type PlataProiect, type SursaPlata } from '@/lib/proiect-buget'
import { etichetaLuna } from '@/lib/proiect-plan'
import Icon from '@/components/ui/Icon'
import pc from './PlanProiect.module.css'
import css from './BugetProiect.module.css'

// Tab-ul "Buget" din Plan proiect: bugetul AA3 minus platile reale (registrul proiect_plati), ce mai ramane
// pe fiecare linie si ce plati urmeaza dupa planul lunar. Platile se adauga din OP-uri (citite de AI) sau manual.

interface Firma { id: string; nume: string }
interface Propunere { cheie: string; fisier_nume: string; fisier_path?: string; data: string; suma: string; linie_cod: string; sursa: '' | SursaPlata; beneficiar: string; descriere: string; incredere?: string; motiv?: string; bifat: boolean }
interface FisierEroare { fisier_nume: string; fisier_path?: string; eroare: string }

const lei = (n: number) => `${n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`
const leiScurt = (n: number) => `${Math.round(n).toLocaleString('ro-RO')} lei`
const dataRo = (iso: string) => iso ? iso.split('-').reverse().join('.') : ''
const azi = () => new Date().toISOString().slice(0, 10)
function toast(text: string, tip: 'ok' | 'err' = 'ok') { window.dispatchEvent(new CustomEvent('cf:toast', { detail: { text, tone: tip === 'ok' ? 'success' : 'error' } })) }
const pct = (a: number, b: number) => b ? Math.max(0, Math.min(100, Math.round(a / b * 100))) : 0
const SURSA: Record<SursaPlata, string> = { subventie: 'Subvenție', cofinantare: 'Cofinanțare' }

function Bara({ valoare, total, prag, ton }: { valoare: number; total: number; prag?: number; ton?: 'warn' | 'danger' }) {
  return (
    <div className={css.bar} data-ton={ton}>
      <div style={{ width: `${pct(valoare, total)}%` }} />
      {prag != null && <i style={{ left: `${pct(prag, total)}%` }} title={`Prag: ${lei(prag)}`} />}
    </div>
  )
}

function SelectLinie({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const grupuri = [...new Set(BUGET_INTEGRAL.map(l => categorieScurta(l.cod)))]
  return (
    <select className={pc.select} value={value} onChange={e => onChange(e.target.value)} aria-label="Linia de buget">
      <option value="">— alege linia de buget —</option>
      {grupuri.map(g => <optgroup key={g} label={g}>{BUGET_INTEGRAL.filter(l => categorieScurta(l.cod) === g).map(l => <option key={l.cod} value={l.cod}>{l.cod} · {l.denumire}</option>)}</optgroup>)}
    </select>
  )
}

export default function BugetProiect({ firma, onIntarziate }: { firma: Firma; onIntarziate?: (n: number) => void }) {
  const [plati, setPlati] = useState<PlataProiect[]>([])
  const [incarcat, setIncarcat] = useState(false)
  const [lipsaMigrare, setLipsaMigrare] = useState(false)
  const [propuneri, setPropuneri] = useState<Propunere[]>([])
  const [eroriFisiere, setEroriFisiere] = useState<FisierEroare[]>([])
  const [citeste, setCiteste] = useState(0)
  const [salveaza, setSalveaza] = useState(false)
  const [manual, setManual] = useState(false)
  const [luniDeschise, setLuniDeschise] = useState<Set<number> | null>(null)
  const [deschis, setDeschis] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ linie_cod: '', data: azi(), suma: '', sursa: '' as '' | SursaPlata, beneficiar: '', descriere: '' })

  useEffect(() => {
    fetch(`/api/proiect/plati?firmaId=${firma.id}`).then(r => r.json()).then(d => { setPlati((d.plati || []).map((p: PlataProiect) => ({ ...p, suma: Number(p.suma) }))); setLipsaMigrare(!!d.lipsaMigrare) }).catch(() => {}).finally(() => setIncarcat(true))
  }, [firma.id])

  const e = useMemo(() => executieBuget(plati), [plati])
  const intarziate = e.urmatoare.filter(u => u.intarziat)
  // Platile care urmeaza, grupate pe luna din plan: un rand pe luna, cu detaliul pe linii la click
  const peLuni = useMemo(() => {
    const m = new Map<number, typeof e.urmatoare>()
    e.urmatoare.forEach(u => m.set(u.luna, [...(m.get(u.luna) || []), u]))
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([luna, items]) => ({ luna, items, total: items.reduce((s, u) => s + u.suma, 0), intarziat: luna < e.luna, termene: [...new Set(items.map(u => u.termen))].sort() }))
  }, [e])
  const luniIntarziate = peLuni.filter(g => g.intarziat).length
  useEffect(() => { if (incarcat) onIntarziate?.(luniIntarziate) }, [incarcat, luniIntarziate, onIntarziate])
  const deschisa = (luna: number) => luniDeschise ? luniDeschise.has(luna) : luna === e.luna
  const comuta = (luna: number) => setLuniDeschise(prev => { const s = new Set(prev ?? [e.luna]); if (s.has(luna)) s.delete(luna); else s.add(luna); return s })

  const adauga = async (lista: Record<string, unknown>[]) => {
    const r = await fetch('/api/proiect/plati', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId: firma.id, plati: lista }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { toast(d.error || 'Plata nu s-a salvat', 'err'); return false }
    setPlati(prev => [...(d.plati || []).map((p: PlataProiect) => ({ ...p, suma: Number(p.suma) })), ...prev])
    return true
  }

  const salveazaManual = async () => {
    setSalveaza(true)
    const ok = await adauga([{ ...form, sursa: form.sursa || null }])
    setSalveaza(false)
    if (ok) { toast('Plata a fost scăzută din buget'); setForm(f => ({ ...f, suma: '', beneficiar: '', descriere: '' })); setManual(false) }
  }

  const sterge = async (p: PlataProiect) => {
    if (!confirm(`Ștergi plata de ${lei(p.suma)} (${dataRo(p.data)}) de pe linia ${p.linie_cod}? Suma revine în buget.`)) return
    const r = await fetch(`/api/proiect/plati?firmaId=${firma.id}&id=${p.id}`, { method: 'DELETE' })
    if (!r.ok) { const d = await r.json().catch(() => ({})); toast(d.error || 'Nu s-a șters', 'err'); return }
    setPlati(prev => prev.filter(x => x.id !== p.id))
  }

  const incarcaOp = async (files: File[]) => {
    if (!files.length) return
    setCiteste(files.length)
    const fd = new FormData(); fd.append('firmaId', firma.id); files.forEach(f => fd.append('file', f))
    try {
      const r = await fetch('/api/proiect/plati/op', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast(d.error || 'OP-urile nu s-au putut citi', 'err'); return }
      const noi: Propunere[] = [], erori: FisierEroare[] = []
      for (const f of d.rezultate || []) {
        if (f.eroare && !(f.plati || []).length) { erori.push(f); continue }
        if (!(f.plati || []).length) { erori.push({ ...f, eroare: 'Nu am găsit nicio plată în document.' }); continue }
        f.plati.forEach((p: Record<string, string | number | null>, i: number) => noi.push({
          cheie: `${f.fisier_path}#${i}`, fisier_nume: f.fisier_nume, fisier_path: f.fisier_path,
          data: String(p.data || ''), suma: p.suma != null ? String(p.suma) : '', linie_cod: String(p.linie_cod || ''), sursa: (p.sursa as SursaPlata) || '',
          beneficiar: String(p.beneficiar || ''), descriere: String(p.descriere || ''), incredere: String(p.incredere || ''), motiv: String(p.motiv || ''), bifat: true,
        }))
      }
      setPropuneri(prev => [...prev, ...noi]); setEroriFisiere(prev => [...prev, ...erori])
    } catch { toast('OP-urile nu s-au putut trimite', 'err') } finally { setCiteste(0); if (fileRef.current) fileRef.current.value = '' }
  }

  const modifica = (cheie: string, p: Partial<Propunere>) => setPropuneri(prev => prev.map(x => x.cheie === cheie ? { ...x, ...p } : x))
  const bifate = propuneri.filter(p => p.bifat)
  const deRezolvat = bifate.filter(p => !p.linie_cod || !(Number(p.suma) > 0) || !p.data).length

  const confirmaPropuneri = async () => {
    setSalveaza(true)
    const ok = await adauga(bifate.map(p => ({ linie_cod: p.linie_cod, data: p.data, suma: p.suma, sursa: p.sursa || null, beneficiar: p.beneficiar, descriere: p.descriere, fisier_path: p.fisier_path, fisier_nume: p.fisier_nume })))
    setSalveaza(false)
    if (!ok) return
    toast(`${bifate.length} ${bifate.length === 1 ? 'plată scăzută' : 'plăți scăzute'} din buget`)
    renuntaFisiere(propuneri.filter(p => !p.bifat), bifate)
    setPropuneri([]); setEroriFisiere([])
  }
  // OP-urile din care nu s-a pastrat nicio plata se sterg din storage
  const renuntaFisiere = (renuntate: { fisier_path?: string }[], pastrate: { fisier_path?: string }[]) => {
    const folosite = new Set(pastrate.map(p => p.fisier_path))
    new Set(renuntate.map(p => p.fisier_path).filter((x): x is string => !!x && !folosite.has(x)))
      .forEach(path => fetch(`/api/proiect/plati/op?firmaId=${firma.id}&path=${encodeURIComponent(path)}`, { method: 'DELETE' }).catch(() => {}))
  }
  const renunta = () => { renuntaFisiere([...propuneri, ...eroriFisiere], []); setPropuneri([]); setEroriFisiere([]) }

  const linkOp = (p: { fisier_path?: string | null }) => `/api/proiect/plati/op?firmaId=${firma.id}&path=${encodeURIComponent(p.fisier_path || '')}`
  const t2 = e.transa2

  return (
    <div className={css.root}>
      {lipsaMigrare && <div className={`${pc.card} ${pc.callout}`}><strong>Plățile nu se pot salva încă.</strong> <span className={pc.muted}>Rulează migrarea SQL pentru tabelul proiect_plati. Bugetul și planul lunar se văd oricum.</span></div>}

      <div className={css.hero}>
        <div className={css.heroMain}>
          <div className={pc.eyebrow}>Rămas în proiect</div>
          <div className={css.heroValue}>{lei(e.total.ramas)}</div>
          <div className={pc.muted}>plătit {lei(e.total.platit)} din {lei(e.total.aprobat)} aprobat · {pct(e.total.platit, e.total.aprobat)}%</div>
          <Bara valoare={e.total.platit} total={e.total.aprobat} />
        </div>
        <div className={css.heroSide}>
          {(['subventie', 'cofinantare'] as const).map(k => (
            <div key={k} className={css.split}>
              <div className={css.splitHead}><span>{SURSA[k]}</span><strong>{leiScurt(e[k].ramas)} <small>rămas</small></strong></div>
              <Bara valoare={e[k].platit} total={e[k].aprobat} />
              <div className={pc.faint}>plătit {leiScurt(e[k].platit)} din {leiScurt(e[k].aprobat)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={pc.card}>
        <div className={pc.sectionHead}><h3 className={pc.h3}>Condiții pentru tranșa 2</h3><span className={pc.faint}>varianta în 3 tranșe · minimum 50% din tranșa 1 și din cofinanțare</span></div>
        <div className={css.tranche}>
          {([['Cheltuit din subvenție', t2.subventie], ['Cofinanțare plătită', t2.cofinantare]] as const).map(([titlu, x]) => {
            const ok = x.platit >= x.prag
            return (
              <div key={titlu} className={css.split}>
                <div className={css.splitHead}><span>{titlu}</span>{ok ? <span className="badge badge-success">îndeplinit</span> : <span className={pc.faint}>mai trebuie {leiScurt(x.prag - x.platit)}</span>}</div>
                <Bara valoare={x.platit} total={x.prag} ton={ok ? undefined : 'warn'} />
                <div className={pc.faint}>{leiScurt(x.platit)} din minimum {leiScurt(x.prag)}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div
        className={`${pc.card} ${css.upload}`} data-drag={drag}
        onDragOver={ev => { ev.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
        onDrop={ev => { ev.preventDefault(); setDrag(false); incarcaOp(Array.from(ev.dataTransfer.files)) }}
      >
        <div className={css.uploadRow}>
          <div className={css.uploadIcon}><Icon name="receipt" size={20} /></div>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <h3 className={pc.h3}>Adaugă plăți din OP-uri</h3>
            <div className={pc.muted}>Încarcă ordinele de plată (PDF sau poză, mai multe deodată). AI citește suma, data și beneficiarul și propune linia de buget — tu confirmi înainte să se scadă.</div>
          </div>
          <div className={pc.rowActions}>
            <label className={`btn btn-primary btn-sm ${css.fileBtn}`} aria-disabled={!!citeste || lipsaMigrare}>
              <input ref={fileRef} type="file" multiple accept="application/pdf,image/jpeg,image/png" disabled={!!citeste || lipsaMigrare} onChange={ev => incarcaOp(Array.from(ev.target.files || []))} />
              {citeste ? `Citesc ${citeste} ${citeste === 1 ? 'OP' : 'OP-uri'}…` : 'Încarcă OP-uri'}
            </label>
            <button type="button" className="btn btn-sm" onClick={() => setManual(m => !m)} disabled={lipsaMigrare}>{manual ? 'Închide' : 'Plată manuală'}</button>
          </div>
        </div>

        {manual && (
          <div className={css.form}>
            <SelectLinie value={form.linie_cod} onChange={v => setForm(f => ({ ...f, linie_cod: v }))} />
            <div className={css.formGrid}>
              <label><span>Data plății</span><input className={pc.select} type="date" value={form.data} onChange={ev => setForm(f => ({ ...f, data: ev.target.value }))} /></label>
              <label><span>Suma (lei)</span><input className={pc.select} inputMode="decimal" placeholder="0,00" value={form.suma} onChange={ev => setForm(f => ({ ...f, suma: ev.target.value }))} /></label>
              <label><span>Din</span><select className={pc.select} value={form.sursa} onChange={ev => setForm(f => ({ ...f, sursa: ev.target.value as '' | SursaPlata }))}><option value="">după procentul liniei</option><option value="subventie">Subvenție</option><option value="cofinantare">Cofinanțare</option></select></label>
              <label><span>Beneficiar</span><input className={pc.select} value={form.beneficiar} onChange={ev => setForm(f => ({ ...f, beneficiar: ev.target.value }))} /></label>
            </div>
            <input className={pc.select} placeholder="Explicație (opțional)" value={form.descriere} onChange={ev => setForm(f => ({ ...f, descriere: ev.target.value }))} />
            <div><button type="button" className="btn btn-primary btn-sm" disabled={salveaza || !form.linie_cod || !(Number(form.suma.replace(',', '.')) > 0)} onClick={salveazaManual}>Scade din buget</button></div>
          </div>
        )}

        {(propuneri.length > 0 || eroriFisiere.length > 0) && (
          <div className={css.proposals}>
            {eroriFisiere.map(f => <div key={f.fisier_nume + f.eroare} className={css.fileErr}><strong>{f.fisier_nume}</strong>: {f.eroare}</div>)}
            {propuneri.map(p => {
              const linie = BUGET_INTEGRAL.find(l => l.cod === p.linie_cod)
              return (
                <div key={p.cheie} className={css.proposal} data-off={!p.bifat}>
                  <div className={css.propHead}>
                    <label className={css.check}><input type="checkbox" checked={p.bifat} onChange={ev => modifica(p.cheie, { bifat: ev.target.checked })} /> <strong>{p.beneficiar || 'Beneficiar necunoscut'}</strong></label>
                    <span className={pc.faint}>{p.fisier_nume}</span>
                    {p.incredere === 'posibil' && <span className="badge badge-warning">verifică linia</span>}
                  </div>
                  {p.descriere && <div className={pc.rowSub}>{p.descriere}</div>}
                  <div className={css.propGrid}>
                    <SelectLinie value={p.linie_cod} onChange={v => modifica(p.cheie, { linie_cod: v })} />
                    <input className={pc.select} type="date" value={p.data} onChange={ev => modifica(p.cheie, { data: ev.target.value })} aria-label="Data" />
                    <input className={pc.select} inputMode="decimal" value={p.suma} onChange={ev => modifica(p.cheie, { suma: ev.target.value })} aria-label="Suma" />
                    <select className={pc.select} value={p.sursa} onChange={ev => modifica(p.cheie, { sursa: ev.target.value as '' | SursaPlata })} aria-label="Sursa"><option value="">după procent</option><option value="subventie">Subvenție</option><option value="cofinantare">Cofinanțare</option></select>
                  </div>
                  {(p.motiv || linie) && <div className={pc.faint}>{p.motiv}{linie && ` · pe linie mai sunt ${lei(e.linii.find(l => l.cod === linie.cod)!.ramas)}`}</div>}
                </div>
              )
            })}
            <div className={css.propActions}>
              {propuneri.length > 0 && <button type="button" className="btn btn-primary btn-sm" disabled={salveaza || !bifate.length || deRezolvat > 0} onClick={confirmaPropuneri}>Confirmă și scade {bifate.length} {bifate.length === 1 ? 'plată' : 'plăți'}</button>}
              <button type="button" className="btn btn-sm" onClick={renunta}>Renunță</button>
              {deRezolvat > 0 && <span className={pc.warn} style={{ margin: 0 }}>{deRezolvat} {deRezolvat === 1 ? 'plată are' : 'plăți au'} nevoie de linie, sumă sau dată</span>}
            </div>
          </div>
        )}
      </div>

      <div className={pc.card}>
        <div className={pc.sectionHead}>
          <h3 className={pc.h3}>Plăți care urmează</h3>
          <span className={pc.faint}>după planul lunar din buget · {lei(e.urmatoare.reduce((s, u) => s + u.suma, 0))} în {peLuni.length} luni</span>
        </div>
        {intarziate.length > 0 && <div className={css.lateNote}><Icon name="alert" size={15} /> {luniIntarziate} {luniIntarziate === 1 ? 'lună trecută are' : 'luni trecute au'} plăți planificate fără OP înregistrat ({leiScurt(intarziate.reduce((s, u) => s + u.suma, 0))}). Încarcă OP-urile ca să se scadă.</div>}
        {peLuni.length === 0 ? <div className={pc.empty} style={{ marginTop: 12 }}>Tot bugetul e plătit.</div> : (
          <div className={css.months}>
            {peLuni.map(g => (
              <div key={g.luna} className={css.month} data-late={g.intarziat} data-now={g.luna === e.luna}>
                <button type="button" className={css.monthBtn} onClick={() => comuta(g.luna)} aria-expanded={deschisa(g.luna)}>
                  <div className={css.monthName}><strong>{etichetaLuna(g.luna)}</strong><span>L{g.luna}{g.luna === e.luna ? ' · luna curentă' : ''}</span></div>
                  <div className={css.monthMeta}>{g.items.length} {g.items.length === 1 ? 'plată' : 'plăți'} · termene {g.termene.map(t => dataRo(t).slice(0, 5)).join(', ')}{g.intarziat && <span className="badge badge-warning" style={{ marginLeft: 8 }}>fără OP</span>}</div>
                  <span className={css.amount}>{lei(g.total)}</span>
                  <Icon name="chevronDown" size={16} />
                </button>
                {deschisa(g.luna) && (
                  <ul className={css.due}>
                    {g.items.map(u => (
                      <li key={`${u.cod}-${u.luna}`} data-late={u.intarziat}>
                        <div className={css.dueDate}><strong>{dataRo(u.termen)}</strong></div>
                        <div className={css.dueMain}><div className={pc.rowTitle}><span className={pc.code}>{u.cod}</span> {u.denumire}</div><div className={pc.faint}>{u.categorie}</div></div>
                        <div className={css.amount}>{lei(u.suma)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {e.categorii.map(c => (
        <details key={c.nume} className={`${pc.card} ${pc.details} ${css.cat}`} >
          <summary>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={css.catHead}><h3 className={pc.h3}>{c.nume}</h3><span className={css.amount}>{leiScurt(c.aprobat - c.platit)} <small>rămas din {leiScurt(c.aprobat)}</small></span></div>
              <Bara valoare={c.platit} total={c.aprobat} />
            </div>
            <Icon name="chevronDown" size={16} />
          </summary>
          <div className={css.lines}>
            {c.linii.map(l => (
              <div key={l.cod} className={css.line}>
                <button type="button" className={css.lineBtn} onClick={() => setDeschis(d => d === l.cod ? null : l.cod)} aria-expanded={deschis === l.cod}>
                  <div className={css.lineMain}>
                    <div className={pc.rowTitle}><span className={pc.code}>{l.cod}</span> {l.denumire} {l.depasit && <span className="badge badge-danger">depășit cu {leiScurt(-l.ramas)}</span>}</div>
                    <div className={pc.faint}>{l.cantitate > 1 ? `${l.cantitate} ${l.um} × ${leiScurt(l.pretUnitar)} · ` : ''}{l.subventie && l.cofinantare ? '90% subvenție / 10% cofinanțare' : l.subventie ? 'subvenție' : 'cofinanțare'}{l.plati.length ? ` · ${l.plati.length} ${l.plati.length === 1 ? 'plată' : 'plăți'}` : ''}</div>
                  </div>
                  <div className={css.lineNums}>
                    <span className={css.amount} data-zero={l.ramas <= 0.01}>{lei(Math.max(0, l.ramas))}</span>
                    <span className={pc.faint}>rămas din {leiScurt(l.valoare)}</span>
                    <Bara valoare={l.platit} total={l.valoare} ton={l.depasit ? 'danger' : undefined} />
                  </div>
                </button>
                {deschis === l.cod && (
                  <div className={css.lineDetail}>
                    {l.plati.length === 0 ? <div className={pc.faint}>Nicio plată încă. În plan: {l.luni.map((v, i) => v ? `${etichetaLuna(i + 1)} ${leiScurt(v)}` : '').filter(Boolean).join(' · ')}</div> : l.plati.map(p => (
                      <div key={p.id} className={css.payment}>
                        <span className={css.payDate}>{dataRo(p.data)}</span>
                        <span className={css.payMain}>{p.beneficiar || p.descriere || '—'}{p.sursa && <span className={pc.tag} style={{ marginLeft: 6 }}>{SURSA[p.sursa]}</span>}{p.fisier_path && <a href={linkOp(p)} target="_blank" rel="noreferrer" className={css.opLink}>OP</a>}</span>
                        <span className={css.amount}>{lei(p.suma)}</span>
                        <button type="button" className={pc.remove} style={{ opacity: 1 }} onClick={() => sterge(p)} title="Șterge plata (suma revine în buget)" aria-label="Șterge plata"><Icon name="close" size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      ))}

      <div className={pc.faint} style={{ textAlign: 'center' }}>Buget {BUGET_VERSIUNE}, foaia 2.0 Buget integral · termene: salarii pe 20 și contribuții pe 25 ale lunii următoare, chirie pe 5, restul până la sfârșitul lunii din plan</div>
    </div>
  )
}
