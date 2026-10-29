'use client'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deschideDocument } from '@/lib/vizualizare'
import { accountingPeriod, workMonthLabel } from '@/lib/accounting-period'
import Icon from '@/components/ui/Icon'
import css from './Op.module.css'

type Status = 'asociat' | 'neasociat' | 'dublura'
interface Tx { id: string; firma_id: string; data_tranzactie: string; descriere_curatata?: string | null; descriere?: string | null; suma: number; luna: string | null; scor?: number }
interface Op {
  id: string; firma_id: string | null; fisier_nume: string | null; numar_op: string | null; data: string | null; suma: number | null; valuta: string | null
  beneficiar: string | null; explicatie: string | null; status: Status; motiv: string | null; tranzactie_id: string | null; dublura_de: string | null; created_at: string; tranzactie: Tx | null
}
interface FaraOp { id: string; firma_id: string; data_tranzactie: string; suma: number; descriere: string | null; numar_op: string | null; luna: string | null }
interface Firma { id: string; slug: string; nume: string; culoare: string }
interface Coada { nume: string; stare: 'asteapta' | 'citeste' | 'gata' | 'eroare' | 'dublura'; text?: string }

const lei = (n: number | null | undefined) => n == null ? '—' : `${Number(n).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dataRo = (iso?: string | null) => iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—'
const PARALEL = 3
// Extrasul lunii de lucru L contine platile lunii contabile L-1 (ex. luna de lucru Octombrie = plati din Septembrie)
const lunaExtras = (k: string) => { const p = accountingPeriod(k); return `${p.monthName} ${p.year}` }
const ETICHETE: Record<Status | 'fara', string> = { neasociat: 'Neasociate', dublura: 'Dubluri', asociat: 'Asociate', fara: 'Plăți fără OP' }

export default function OpClient() {
  const [ops, setOps] = useState<Op[]>([])
  const [fara, setFara] = useState<FaraOp[]>([])
  const [firme, setFirme] = useState<Firma[]>([])
  const [incarcat, setIncarcat] = useState(false)
  const [lipsaMigrare, setLipsaMigrare] = useState(false)
  const [coada, setCoada] = useState<Coada[]>([])
  const [filtru, setFiltru] = useState<Status | 'fara' | null>(null)
  const [firmaFiltru, setFirmaFiltru] = useState('')
  const [deschis, setDeschis] = useState<string | null>(null)
  const [candidati, setCandidati] = useState<Tx[] | null>(null)
  const [eroare, setEroare] = useState('')
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const reincarca = useCallback(() => fetch('/api/op').then(r => r.json()).then(d => {
    if (d.error) { setEroare(d.error); return }
    setOps(d.op || []); setFara(d.faraOp || []); setFirme(d.firme || []); setLipsaMigrare(!!d.lipsaMigrare)
  }).catch(() => setEroare('Lista nu s-a putut încărca')).finally(() => setIncarcat(true)), [])
  // La deschidere: lista imediat, apoi OP-urile neasociate se potrivesc din nou cu extrasele (cele incarcate intre timp)
  const [reasociate, setReasociate] = useState(0)
  useEffect(() => {
    reincarca().then(() => fetch('/api/op', { method: 'PUT' }).then(r => r.json()).then(d => { if (d.asociate) { setReasociate(d.asociate); reincarca() } }).catch(() => {}))
  }, [reincarca])

  const firma = (id: string | null) => firme.find(f => f.id === id)
  const peFirma = <T extends { firma_id: string | null }>(x: T[]) => firmaFiltru ? x.filter(o => o.firma_id === firmaFiltru) : x
  const numar = (s: Status) => peFirma(ops).filter(o => o.status === s).length
  const filtrat = filtru ?? (numar('neasociat') ? 'neasociat' : numar('dublura') ? 'dublura' : ops.length ? 'asociat' : 'fara')
  const lista = peFirma(ops).filter(o => o.status === filtrat)
  const faraFiltrat = peFirma(fara)
  const faraGrupat = useMemo(() => {
    const m = new Map<string, FaraOp[]>()
    faraFiltrat.forEach(t => { const k = `${t.firma_id}|${t.luna || ''}`; m.set(k, [...(m.get(k) || []), t]) })
    return [...m.entries()].sort((a, b) => (b[0].split('|')[1] || '').localeCompare(a[0].split('|')[1] || '') || a[0].localeCompare(b[0]))
  }, [faraFiltrat])

  async function incarca(files: File[]) {
    const bune = files.filter(f => /pdf|jpe?g|png/i.test(f.type))
    if (!bune.length) return
    const start = coada.length
    setCoada(prev => [...prev, ...bune.map(f => ({ nume: f.name, stare: 'asteapta' as const }))])
    let urm = 0
    const lucrator = async () => {
      while (urm < bune.length) {
        const i = urm++, f = bune[i]
        const set = (c: Partial<Coada>) => setCoada(prev => prev.map((x, j) => j === start + i ? { ...x, ...c } : x))
        set({ stare: 'citeste' })
        try {
          const fd = new FormData(); fd.append('file', f)
          const r = await fetch('/api/op', { method: 'POST', body: fd })
          const d = await r.json().catch(() => ({}))
          if (!r.ok) { set({ stare: 'eroare', text: d.error || 'eroare' }); continue }
          if (d.dublura) { set({ stare: 'dublura', text: d.motiv }); continue }
          const noi: Op[] = d.op || []
          setOps(prev => [...noi, ...prev])
          const as = noi.filter(o => o.status === 'asociat').length
          set({ stare: 'gata', text: `${noi.length} OP${noi.length === 1 ? '' : '-uri'}: ${as} asociat${as === 1 ? '' : 'e'}${noi.length - as ? `, ${noi.length - as} de verificat` : ''}` })
        } catch { set({ stare: 'eroare', text: 'conexiune întreruptă' }) }
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALEL, bune.length) }, lucrator))
    if (inputRef.current) inputRef.current.value = ''
    reincarca()
  }

  async function arataCandidati(op: Op) {
    if (deschis === op.id) { setDeschis(null); return }
    setDeschis(op.id); setCandidati(null)
    const d = await fetch(`/api/op?candidati=${op.id}`).then(r => r.json()).catch(() => ({}))
    setCandidati(d.candidati || [])
  }

  async function asociaza(op: Op, txId: string | null) {
    setEroare('')
    const r = await fetch('/api/op', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: op.id, tranzactie_id: txId }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setEroare(d.error || 'Nu s-a salvat'); return }
    setOps(prev => prev.map(o => o.id === op.id ? d.op : o)); setDeschis(null)
    reincarca()
  }

  async function sterge(op: Op) {
    if (!confirm(`Ștergi OP-ul${op.numar_op ? ` nr. ${op.numar_op}` : ''}${op.status === 'asociat' ? ' și documentul atașat plății' : ''}?`)) return
    const r = await fetch(`/api/op?id=${op.id}`, { method: 'DELETE' })
    if (r.ok) { setOps(prev => prev.filter(o => o.id !== op.id)); reincarca() } else setEroare('OP-ul nu s-a putut șterge')
  }

  const linkExtras = (firmaId: string, luna: string | null) => { const f = firma(firmaId); return f && luna ? `/${f.slug}/${luna}/extras` : null }
  const inLucru = coada.filter(c => c.stare === 'asteapta' || c.stare === 'citeste').length
  const procesate = coada.length - inLucru

  return (
    <div className={css.root}>
      {lipsaMigrare && <div className={css.warn}><strong>OP-urile nu se pot salva încă.</strong> Rulează migrarea SQL pentru tabelul ordine_plata. Lista plăților fără OP se vede oricum.</div>}
      {eroare && <div className={css.err}>{eroare}</div>}
      {reasociate > 0 && <div className={css.ok}>✓ {reasociate} {reasociate === 1 ? 'OP neasociat și-a găsit' : 'OP-uri neasociate și-au găsit'} plata în extrasele încărcate între timp.</div>}

      <div className={css.drop} data-drag={drag} onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); if (!lipsaMigrare) incarca(Array.from(e.dataTransfer.files)) }}>
        <div className={css.dropIcon}><Icon name="receipt" size={22} /></div>
        <div className={css.dropText}>
          <strong>Trage aici OP-urile</strong> sau alege fișierele — PDF sau poze, oricâte deodată; un PDF poate conține mai multe OP-uri.
          <span>AI citește numărul, data, suma, plătitorul și beneficiarul, recunoaște firma după contul plătitor și caută plata în extrasele ei (aceeași sumă, ±7 zile, număr OP / IBAN / nume). OP-ul se atașează plății, în luna extrasului.</span>
        </div>
        <label className={`btn btn-primary ${css.fileBtn}`} aria-disabled={lipsaMigrare}>
          <input ref={inputRef} type="file" multiple accept="application/pdf,image/jpeg,image/png" disabled={lipsaMigrare} onChange={e => incarca(Array.from(e.target.files || []))} />
          Alege OP-uri
        </label>
      </div>

      {coada.length > 0 && (
        <div className={css.queue}>
          <div className={css.queueHead}>
            <span>{inLucru ? `Se procesează… ${procesate} / ${coada.length}` : `Gata: ${coada.length} ${coada.length === 1 ? 'fișier' : 'fișiere'}`}</span>
            <div className={css.bar}><div style={{ width: `${coada.length ? Math.round(procesate / coada.length * 100) : 0}%` }} /></div>
            {!inLucru && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCoada([])}>Ascunde</button>}
          </div>
          <ul className={css.queueList}>
            {coada.map((c, i) => <li key={i} data-stare={c.stare}><span className={css.qName}>{c.nume}</span><span className={css.qState}>{c.stare === 'asteapta' ? 'în așteptare' : c.stare === 'citeste' ? 'se citește…' : c.text}</span></li>)}
          </ul>
        </div>
      )}

      <div className={css.toolbar}>
        <div className={css.tabs} role="tablist" aria-label="Filtru OP-uri">
          {(['neasociat', 'dublura', 'asociat', 'fara'] as const).map(k => (
            <button key={k} type="button" role="tab" aria-selected={filtrat === k} className={css.tab} data-k={k} onClick={() => setFiltru(k)}>
              {ETICHETE[k]} <span className={css.count}>{k === 'fara' ? faraFiltrat.length : numar(k)}</span>
            </button>
          ))}
        </div>
        <select className={css.select} value={firmaFiltru} onChange={e => setFirmaFiltru(e.target.value)} aria-label="Firma">
          <option value="">Toate firmele</option>
          {firme.filter(f => ops.some(o => o.firma_id === f.id) || fara.some(t => t.firma_id === f.id)).map(f => <option key={f.id} value={f.id}>{f.nume}</option>)}
        </select>
      </div>

      {!incarcat ? <div className={css.empty}>Se încarcă…</div> : filtrat !== 'fara' ? (
        lista.length === 0 ? <div className={css.empty}>{filtrat === 'neasociat' ? 'Niciun OP neasociat.' : filtrat === 'dublura' ? 'Nicio dublură.' : 'Niciun OP asociat încă — încarcă OP-urile mai sus.'}</div> : (
          <div className={css.list}>
            {lista.map(o => {
              const f = firma(o.firma_id), tx = o.tranzactie, link = tx ? linkExtras(tx.firma_id, tx.luna) : null
              return (
                <div key={o.id} className={css.row} data-status={o.status}>
                  <div className={css.rowMain}>
                    <div className={css.rowTitle}>
                      <span className={css.nr}>{o.numar_op ? `OP ${o.numar_op}` : 'OP'}</span>
                      <strong>{o.beneficiar || 'Beneficiar necitit'}</strong>
                      {f && <span className={css.firma}><i style={{ background: f.culoare }} />{f.nume.replace(/ SRL$/, '')}</span>}
                    </div>
                    <div className={css.rowSub}>{dataRo(o.data)}{o.explicatie ? ` · ${o.explicatie}` : ''}</div>
                    {o.status === 'asociat' && tx && <div className={css.match}><Icon name="check" size={13} /> plata din {dataRo(tx.data_tranzactie)}{tx.luna ? ` · extras ${lunaExtras(tx.luna)}` : ''}{link && <> · <Link href={link}>deschide</Link></>}<span className={css.why}>{o.motiv}</span></div>}
                    {o.status !== 'asociat' && o.motiv && <div className={css.reason} data-status={o.status}>{o.status === 'dublura' ? 'Dublură: ' : ''}{o.motiv}</div>}
                  </div>
                  <div className={css.sum}>{lei(o.suma)} <small>{o.valuta || 'RON'}</small></div>
                  <div className={css.actions}>
                    <button type="button" className="btn btn-sm" onClick={() => deschideDocument(`/api/op?fisier=${o.id}`, o.fisier_nume || 'OP')}>Vezi</button>
                    {o.status === 'asociat'
                      ? <button type="button" className="btn btn-sm" onClick={() => asociaza(o, null)} title="Scoate OP-ul de la plată">Dezasociază</button>
                      : o.firma_id && <button type="button" className="btn btn-sm" onClick={() => arataCandidati(o)} aria-expanded={deschis === o.id}>Alege plata</button>}
                    <button type="button" className={`btn btn-sm btn-ghost ${css.del}`} onClick={() => sterge(o)} aria-label="Șterge OP-ul" title="Șterge">✕</button>
                  </div>
                  {deschis === o.id && (
                    <div className={css.cands}>
                      {!candidati ? <span className={css.muted}>Se caută plățile cu aceeași sumă…</span> : candidati.length === 0 ? <span className={css.muted}>Nicio plată de {lei(o.suma)} lei în extrasele firmei {f?.nume}. Poate extrasul lunii nu e încă încărcat.</span> : (
                        <>
                          <span className={css.muted}>Plăți de {lei(o.suma)} lei din extrasele {f?.nume}:</span>
                          {candidati.map(c => (
                            <button key={c.id} type="button" className={css.cand} onClick={() => asociaza(o, c.id)}>
                              <span className={css.candDate}>{dataRo(c.data_tranzactie)}</span>
                              <span className={css.candText}>{c.descriere_curatata || c.descriere}</span>
                              <span className={css.muted}>{c.luna ? `extras ${lunaExtras(c.luna)}` : ''}</span>
                              <span className={css.candGo}>Asociază →</span>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      ) : (
        faraFiltrat.length === 0 ? <div className={css.empty}>Toate plățile din extrase care au nevoie de OP au OP. ✓</div> : (
          <div className={css.groups}>
            <div className={css.muted}>Transferurile din extrase (plăți către furnizori, stat, salarii, între conturi) fără OP — nici încărcat aici, nici atașat la plată. Plățile cu cardul și comisioanele nu apar.</div>
            {faraGrupat.map(([k, txs]) => {
              const [fid, luna] = k.split('|'), f = firma(fid), link = linkExtras(fid, luna || null)
              return (
                <div key={k} className={css.group}>
                  <div className={css.groupHead}>
                    <span className={css.firma}><i style={{ background: f?.culoare }} />{f?.nume || 'Firmă'}</span>
                    <strong title={luna ? `luna de lucru ${workMonthLabel(luna)}` : undefined}>{luna ? `extras ${lunaExtras(luna)}` : 'fără lună'}</strong>
                    <span className={css.muted}>{txs.length} {txs.length === 1 ? 'plată' : 'plăți'} · {lei(txs.reduce((s, t) => s + t.suma, 0))} lei</span>
                    {link && <Link href={link} className={css.groupLink}>Deschide extrasul →</Link>}
                  </div>
                  {txs.map(t => (
                    <div key={t.id} className={css.txRow}>
                      <span className={css.candDate}>{dataRo(t.data_tranzactie)}</span>
                      <span className={css.candText}>{t.descriere || '—'}</span>
                      <span className={css.muted}>{t.numar_op ? `OP ${t.numar_op}` : ''}</span>
                      <span className={css.sum}>{lei(t.suma)}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
