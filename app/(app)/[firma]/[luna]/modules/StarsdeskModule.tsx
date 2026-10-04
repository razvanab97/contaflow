'use client'
import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import TaskSection, { TaskItem } from './TaskSection'
import UploadPanel from './UploadPanel'
import OldItemDocs, { ChecklistItem } from './OldItemDocs'

interface Firma { id: string; slug: string; nume: string; culoare: string }
interface Props { firma: Firma; lunaId: string; tasks: TaskItem[]; checklistItems: ChecklistItem[] }
interface Nefacturata { id:string; codRezervare:string; numeOaspete:string; suma:number|null; platforma:string; dataStart?:string|null; dataSfarsit?:string|null }
interface FacturaOrfana { id:string; numarFactura:string; numeClient:string; suma:number|null; idRezervare:string; motiv?:string; dataStart?:string|null; dataSfarsit?:string|null; unde?:'lipsa'|'trecuta'|'necunoscut'|'alta-luna'|'viitoare' }
interface Discrepanta extends Nefacturata { numarFactura:string; sumaFactura:number|null; mesaj:string; potrivire?:'cod'|'nume'; codRezervareFactura?:string|null }
interface DiscrepantaExplicata extends Discrepanta { numarComision:string; sumaComision:number|null }
interface FacturataAltaLuna extends Discrepanta { luna:string }
interface VerificareResult {
  totalRezervari:number; totalFacturiClient:number; totalFacturiComision:number
  faraFacturaClient:Nefacturata[]; seFactureazaLunaViitoare?:Nefacturata[]; discrepanteClient:Discrepanta[]; discrepanteExplicateComision:DiscrepantaExplicata[]
  facturateAlteLuni:FacturataAltaLuna[]
  facturiFaraRezervare:FacturaOrfana[]
  faraComisionAirbnb:Nefacturata[]; comisionAlteLuni:FacturataAltaLuna[]
  comisionBookingLipsa:boolean; totalRezervariBooking:number
}

// ── Lista de discrepante: orice rand din verificare se poate bifa; randurile bifate se salveaza (cu
// captura situatiei si o nota) si intra ca PDF in exportul contabilitatii.
interface RandLista { id:string; cheie:string; sectiune:string; titlu:string|null; cod_rezervare:string|null; suma:number|null; detalii:string|null; nota:string|null }
interface BifaPayload { cheie:string; sectiune:string; titlu:string; codRezervare?:string|null; suma?:number|null; detalii:string }
const ListaCtx = createContext<{ randuri: Map<string, RandLista>; comuta: (p: BifaPayload) => void } | null>(null)

function Bifa({ p }: { p: BifaPayload }) {
  const c = useContext(ListaCtx)
  if (!c) return null
  const on = c.randuri.has(p.cheie)
  return <input type="checkbox" checked={on} onChange={() => c.comuta(p)} aria-label="Adaugă în lista de discrepanțe" title={on ? 'Scoate din lista de discrepanțe' : 'Adaugă în lista de discrepanțe'} style={{ width:'16px', height:'16px', flexShrink:0, cursor:'pointer', accentColor:'var(--accent)' }}/>
}

function zi(d?: string|null) { if (!d) return ''; const [, m, z] = d.split('-'); return `${z}.${m}` }
function sejurText(n: Nefacturata) { return n.dataStart || n.dataSfarsit ? `sejur ${zi(n.dataStart)}–${zi(n.dataSfarsit)}` : '' }

function money(v: number|null) { return v == null ? '—' : new Intl.NumberFormat('ro-RO', { minimumFractionDigits:2, maximumFractionDigits:2 }).format(v) }

// Suma efectiv facturata, afisata imediat dupa numarul facturii.
function FacturatSuma({ v }: { v: number|null }) {
  return v == null ? null : <span style={{ fontWeight:600, color:'var(--c-cccccc)', whiteSpace:'nowrap' }}>· {money(v)} RON facturat</span>
}

function ListaLipsa({ items, tip, onResolved, faraActiune, sectiune }: { items: Nefacturata[]; tip:'client'|'comision'; onResolved:(id:string)=>void; faraActiune?:boolean; sectiune:string }) {
  const [resolving, setResolving] = useState<string|null>(null)
  const [note, setNote] = useState<Record<string,string>>({})

  async function marcheaza(id: string) {
    setResolving(id)
    const res = await fetch('/api/5stardesk/rezolva', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tip, rezolvat: true, nota: note[id]?.trim() || null }),
    })
    if (res.ok) onResolved(id)
    setResolving(null)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
      {items.map(n => (
        <div key={n.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'var(--c-161616)', borderRadius:'var(--r-sm)', flexWrap:'wrap' }}>
          <Bifa p={{ cheie:`${sectiune}:${n.id}`, sectiune, titlu:n.numeOaspete || '—', codRezervare:n.codRezervare, suma:n.suma, detalii:[n.platforma === 'airbnb' ? 'Airbnb' : 'Booking', sejurText(n), `borderou ${money(n.suma)} RON`].filter(Boolean).join(' · ') }}/>
          <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, padding:'2px 7px', borderRadius:'var(--r-sm)', background: n.platforma==='airbnb' ? 'light-dark(rgba(220,38,38,.25), rgba(248,113,113,.1))' : 'light-dark(rgba(37,99,235,.25), rgba(96,165,250,.1))', color: n.platforma==='airbnb' ? 'var(--danger)' : 'var(--accent-blue)', flexShrink:0 }}>
            {n.platforma === 'airbnb' ? 'Airbnb' : 'Booking'}
          </span>
          <span style={{ flex:'1 1 80px', fontSize:'var(--fs-sm)', color:'var(--c-dddddd)', minWidth:'80px' }}>{n.numeOaspete || '—'}</span>
          <span style={{ fontSize:'var(--fs-sm)', fontWeight:600, color:'var(--c-ffffff)', fontFamily:'monospace' }}>{n.codRezervare}</span>
          {sejurText(n) && <span style={{ fontSize:'var(--fs-xs)', color:'var(--c-777777)', flexShrink:0 }}>{sejurText(n)}</span>}
          <span style={{ fontSize:'var(--fs-xs)', color:'var(--c-888888)', flexShrink:0 }}>{money(n.suma)} RON</span>
          {!faraActiune && <><input
            value={note[n.id] || ''}
            onChange={e => setNote(prev => ({ ...prev, [n.id]: e.target.value }))}
            placeholder="Notă opțională (ex: luna viitoare, la jumătate)"
            style={{ fontSize:'var(--fs-xs)', width:'200px', flexShrink:0, background:'var(--c-0d0d0d)', border:'1px solid var(--c-2a2a2a)', borderRadius:'var(--r-sm)', padding:'5px 8px', color:'var(--c-cccccc)', outline:'none' }}
          />
          <button
            onClick={() => marcheaza(n.id)}
            disabled={resolving === n.id}
            style={{ fontSize:'var(--fs-xs)', fontWeight:600, padding:'4px 10px', borderRadius:'var(--r-sm)', border:'1px solid light-dark(rgba(5,150,105,.525), rgba(110,231,176,.35))', background:'light-dark(rgba(5,150,105,.2), rgba(110,231,176,.08))', color:'var(--accent)', cursor:'pointer', flexShrink:0, opacity: resolving===n.id ? .5 : 1 }}
          >
            {resolving === n.id ? '...' : '✓ Am facturat'}
          </button></>}
        </div>
      ))}
    </div>
  )
}

// Ordinea: intai ce e de verificat (check-out in perioada sau in luna trecuta), la final cele care
// intra firesc in borderoul lunii urmatoare.
const ORDINE_ORFANE = ['lipsa', 'trecuta', 'necunoscut', 'alta-luna', 'viitoare']
function ListaOrfane({ items, sectiune }: { items: FacturaOrfana[]; sectiune:string }) {
  const sortate = [...items].sort((a, b) => ORDINE_ORFANE.indexOf(a.unde || 'necunoscut') - ORDINE_ORFANE.indexOf(b.unde || 'necunoscut'))
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
      {sortate.map(f => (
        <div key={f.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'var(--c-161616)', borderRadius:'var(--r-sm)', flexWrap:'wrap' }}>
          <Bifa p={{ cheie:`${sectiune}:${f.id}`, sectiune, titlu:`${f.numarFactura || '—'} · ${f.numeClient || '—'}`, codRezervare:f.idRezervare, suma:f.suma, detalii:[(f.dataStart || f.dataSfarsit) ? `sejur ${zi(f.dataStart)}–${zi(f.dataSfarsit)}` : '', `factură ${money(f.suma)} RON`, f.motiv || ''].filter(Boolean).join(' · ') }}/>
          <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, padding:'2px 7px', borderRadius:'var(--r-sm)', background:'light-dark(rgba(180,83,9,.25), rgba(245,201,106,.1))', color:'var(--warning)', flexShrink:0 }}>
            {f.numarFactura || '—'}
          </span>
          <span style={{ flex:1, fontSize:'var(--fs-sm)', color:'var(--c-dddddd)' }}>{f.numeClient || '—'}</span>
          {f.idRezervare && <span style={{ fontSize:'var(--fs-sm)', fontWeight:600, color:'var(--c-ffffff)', fontFamily:'monospace' }}>{f.idRezervare}</span>}
          {(f.dataStart || f.dataSfarsit) && <span style={{ fontSize:'var(--fs-xs)', color:'var(--c-777777)', flexShrink:0 }}>sejur {zi(f.dataStart)}–{zi(f.dataSfarsit)}</span>}
          <span style={{ fontSize:'var(--fs-xs)', color:'var(--c-888888)', flexShrink:0 }}>{money(f.suma)} RON</span>
          {f.motiv && <span style={{ flexBasis:'100%', fontSize:'var(--fs-xs)', color: f.unde === 'lipsa' || f.unde === 'trecuta' ? 'var(--warning)' : f.unde === 'viitoare' ? 'var(--success)' : 'var(--c-777777)' }}>{f.unde === 'viitoare' ? '✓' : f.unde === 'trecuta' ? '⚠' : 'ℹ'} {f.motiv}</span>}
        </div>
      ))}
    </div>
  )
}

function ListaDiscrepante({ items, tip, onResolved, sectiune }: { items: Discrepanta[]; tip:'client'|'comision'; onResolved:(id:string)=>void; sectiune:string }) {
  const [resolving, setResolving] = useState<string|null>(null)

  async function marcheaza(id: string) {
    setResolving(id)
    const res = await fetch('/api/5stardesk/rezolva', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tip, rezolvat: true }),
    })
    if (res.ok) onResolved(id)
    setResolving(null)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
      {items.map(d => (
        <div key={d.id} style={{ display:'flex', flexDirection:'column', gap:'4px', padding:'8px 12px', background:'light-dark(rgba(180,83,9,.08), rgba(245,201,106,.06))', border:'1px solid light-dark(rgba(180,83,9,.3), rgba(245,201,106,.2))', borderRadius:'var(--r-sm)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
            <Bifa p={{ cheie:`${sectiune}:${d.id}`, sectiune, titlu:`${d.numeOaspete || '—'} · factura ${d.numarFactura || '—'}`, codRezervare:d.codRezervare, suma:d.sumaFactura, detalii:`borderou ${money(d.suma)} RON ≠ factură ${money(d.sumaFactura)} RON · ${d.mesaj}` }}/>
            <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, padding:'2px 7px', borderRadius:'var(--r-sm)', background: d.platforma==='airbnb' ? 'light-dark(rgba(220,38,38,.25), rgba(248,113,113,.1))' : 'light-dark(rgba(37,99,235,.25), rgba(96,165,250,.1))', color: d.platforma==='airbnb' ? 'var(--danger)' : 'var(--accent-blue)', flexShrink:0 }}>
              {d.platforma === 'airbnb' ? 'Airbnb' : 'Booking'}
            </span>
            <span style={{ flex:1, fontSize:'var(--fs-sm)', color:'var(--c-dddddd)' }}>{d.numeOaspete || '—'} <span style={{ color:'var(--c-666666)' }}>· factura {d.numarFactura || '—'}</span> <FacturatSuma v={d.sumaFactura}/></span>
            <span style={{ fontSize:'var(--fs-sm)', fontWeight:600, color:'var(--c-ffffff)', fontFamily:'monospace' }}>{d.codRezervare}</span>
            {d.potrivire && <span title={d.potrivire === 'cod' ? 'Factura are același cod de rezervare' : `Codul nu se potrivește (pe factură: ${d.codRezervareFactura || 'lipsă'}) — găsită după numele oaspetelui`} style={{ fontSize:'var(--fs-xs)', fontWeight:600, padding:'2px 6px', borderRadius:'var(--r-sm)', background: d.potrivire === 'cod' ? 'light-dark(rgba(5,150,105,.15), rgba(110,231,176,.08))' : 'light-dark(rgba(180,83,9,.15), rgba(245,201,106,.1))', color: d.potrivire === 'cod' ? 'var(--success)' : 'var(--warning)', flexShrink:0 }}>{d.potrivire === 'cod' ? '✓ după cod' : 'după nume'}</span>}
            <span style={{ fontSize:'var(--fs-xs)', color:'var(--c-888888)', flexShrink:0 }}>borderou {money(d.suma)} RON ≠ factură {money(d.sumaFactura)} RON</span>
            <button
              onClick={() => marcheaza(d.id)}
              disabled={resolving === d.id}
              style={{ fontSize:'var(--fs-xs)', fontWeight:600, padding:'4px 10px', borderRadius:'var(--r-sm)', border:'1px solid light-dark(rgba(5,150,105,.525), rgba(110,231,176,.35))', background:'light-dark(rgba(5,150,105,.2), rgba(110,231,176,.08))', color:'var(--accent)', cursor:'pointer', flexShrink:0, opacity: resolving===d.id ? .5 : 1 }}
            >
              {resolving === d.id ? '...' : '✓ E în regulă'}
            </button>
          </div>
          <p style={{ fontSize:'var(--fs-xs)', color:'var(--warning)', margin:0, paddingLeft:'2px' }}>ℹ {d.mesaj}</p>
        </div>
      ))}
    </div>
  )
}

// Diferenta dintre factura client si borderou e explicata exact de comisionul Airbnb al acelei
// rezervari (factura = borderou + comision) - nu e o eroare de facturare, doar informativ.
function ListaExplicate({ items, sectiune }: { items: DiscrepantaExplicata[]; sectiune:string }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
      {items.map(d => (
        <div key={d.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'var(--c-161616)', borderRadius:'var(--r-sm)', flexWrap:'wrap' }}>
          <Bifa p={{ cheie:`${sectiune}:${d.id}`, sectiune, titlu:`${d.numeOaspete || '—'} · factura ${d.numarFactura || '—'}`, codRezervare:d.codRezervare, suma:d.sumaFactura, detalii:`borderou ${money(d.suma)} + comision ${money(d.sumaComision)} (${d.numarComision || '—'}) = factură ${money(d.sumaFactura)} RON` }}/>
          <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, padding:'2px 7px', borderRadius:'var(--r-sm)', background:'light-dark(rgba(220,38,38,.25), rgba(248,113,113,.1))', color:'var(--danger)', flexShrink:0 }}>Airbnb</span>
          <span style={{ flex:1, fontSize:'var(--fs-sm)', color:'var(--c-dddddd)' }}>{d.numeOaspete || '—'} <span style={{ color:'var(--c-666666)' }}>· factura {d.numarFactura || '—'}</span> <FacturatSuma v={d.sumaFactura}/></span>
          <span style={{ fontSize:'var(--fs-sm)', fontWeight:600, color:'var(--c-ffffff)', fontFamily:'monospace' }}>{d.codRezervare}</span>
          <span style={{ fontSize:'var(--fs-xs)', color:'var(--c-777777)', flexShrink:0 }}>
            {money(d.suma)} <span style={{ color:'var(--c-555555)' }}>+ comision</span> {money(d.sumaComision)} <span style={{ color:'var(--c-555555)' }}>=</span> {money(d.sumaFactura)} RON
          </span>
        </div>
      ))}
    </div>
  )
}

// Rezervarea are deja factura, doar ca inregistrata sub o alta luna contabila a aceleiasi firme
// (facturata mai devreme sau mai tarziu decat perioada borderoului) - informativ, nu mai trebuie
// facturata din nou.
function ListaAltaLuna({ items, tip, sectiune }: { items: FacturataAltaLuna[]; tip:'client'|'comision'; sectiune:string }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
      {items.map(d => (
        <div key={d.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'var(--c-161616)', borderRadius:'var(--r-sm)', flexWrap:'wrap' }}>
          <Bifa p={{ cheie:`${sectiune}:${d.id}`, sectiune, titlu:`${d.numeOaspete || '—'} · ${tip === 'client' ? 'factura' : 'comision'} ${d.numarFactura || '—'}`, codRezervare:d.codRezervare, suma:d.sumaFactura, detalii:`borderou ${money(d.suma)} RON · facturat ${money(d.sumaFactura)} RON în ${d.luna}` }}/>
          <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, padding:'2px 7px', borderRadius:'var(--r-sm)', background: d.platforma==='airbnb' ? 'light-dark(rgba(220,38,38,.25), rgba(248,113,113,.1))' : 'light-dark(rgba(37,99,235,.25), rgba(96,165,250,.1))', color: d.platforma==='airbnb' ? 'var(--danger)' : 'var(--accent-blue)', flexShrink:0 }}>
            {d.platforma === 'airbnb' ? 'Airbnb' : 'Booking'}
          </span>
          <span style={{ flex:1, fontSize:'var(--fs-sm)', color:'var(--c-dddddd)' }}>{d.numeOaspete || '—'} <span style={{ color:'var(--c-666666)' }}>· {tip === 'client' ? 'factura' : 'comision'} {d.numarFactura || '—'}</span> <FacturatSuma v={d.sumaFactura}/></span>
          <span style={{ fontSize:'var(--fs-xs)', color:'var(--c-777777)', flexShrink:0 }}>ℹ facturat în <b style={{ color:'var(--c-aaaaaa)' }}>{d.luna}</b></span>
        </div>
      ))}
    </div>
  )
}

function PanouLista({ randuri, firma, lunaId, onNota, onScoate, eroare }: { randuri: RandLista[]; firma: Firma; lunaId: string; onNota:(id:string, nota:string)=>void; onScoate:(cheie:string)=>void; eroare:string }) {
  const [note, setNote] = useState<Record<string,string>>({})
  return (
    <div style={{ border:'1px solid light-dark(rgba(180,83,9,.35), rgba(245,201,106,.25))', borderRadius:'var(--r-md)', padding:'12px 14px', background:'light-dark(rgba(180,83,9,.05), rgba(245,201,106,.04))' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', flexWrap:'wrap', marginBottom: randuri.length ? '10px' : 0 }}>
        <div>
          <div style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--warning)', textTransform:'uppercase', letterSpacing:'.06em' }}>Listă discrepanțe ({randuri.length})</div>
          <div style={{ fontSize:'var(--fs-xs)', color:'var(--c-777777)', marginTop:'2px' }}>Bifează orice rând de mai jos ca să-l adaugi aici; scrie ce s-a întâmplat. Lista se salvează și intră în descărcarea contabilității (ZIP / PDF).</div>
        </div>
        {randuri.length > 0 && <a className="btn btn-sm" href={`/api/5stardesk/lista?lunaId=${encodeURIComponent(lunaId)}&format=pdf&firmaNume=${encodeURIComponent(firma.nume)}`}>↓ Descarcă lista (PDF)</a>}
      </div>
      {eroare && <p style={{ fontSize:'var(--fs-xs)', color:'var(--danger)', margin:0 }}>{eroare}</p>}
      <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
        {randuri.map(r => (
          <div key={r.id} style={{ display:'flex', flexDirection:'column', gap:'5px', padding:'8px 10px', background:'var(--c-161616)', borderRadius:'var(--r-sm)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
              <span className="badge">{r.sectiune}</span>
              <span style={{ flex:'1 1 200px', fontSize:'var(--fs-sm)', color:'var(--c-dddddd)', minWidth:0 }}>{r.titlu}</span>
              {r.cod_rezervare && <span style={{ fontSize:'var(--fs-sm)', fontWeight:600, color:'var(--c-ffffff)', fontFamily:'monospace' }}>{r.cod_rezervare}</span>}
              <button className="btn btn-sm btn-ghost btn-icon" aria-label="Scoate din listă" title="Scoate din listă" onClick={() => onScoate(r.cheie)}>✕</button>
            </div>
            {r.detalii && <div style={{ fontSize:'var(--fs-xs)', color:'var(--c-777777)' }}>{r.detalii}</div>}
            <input
              value={note[r.id] ?? r.nota ?? ''}
              onChange={e => setNote(prev => ({ ...prev, [r.id]: e.target.value }))}
              onBlur={e => { if (e.target.value !== (r.nota || '')) onNota(r.id, e.target.value) }}
              placeholder="Ce s-a întâmplat? (ex: refacturat diferența în ABRH 1550 · client neprezentat, storno)"
              style={{ fontSize:'var(--fs-sm)', background:'var(--c-0d0d0d)', border:`1px solid ${r.nota ? 'var(--c-2a2a2a)' : 'light-dark(rgba(180,83,9,.4), rgba(245,201,106,.3))'}`, borderRadius:'var(--r-sm)', padding:'6px 10px', color:'var(--c-cccccc)', outline:'none' }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

type Categorie = 'client' | 'comision-airbnb' | 'comision-booking'

function VerificaButon({ firma, checking, onClick }: { firma:Firma; checking:boolean; onClick:()=>void }) {
  return (
    <button onClick={onClick} disabled={checking} style={{ flexShrink:0, fontSize:'var(--fs-xs)', fontWeight:600, padding:'6px 12px', borderRadius:'var(--r-sm)', border:'1px solid var(--accent)', background:'transparent', color:'var(--accent)', cursor:'pointer', opacity:checking?.6:1 }}>
      {checking ? 'Se verifică...' : 'Verifică'}
    </button>
  )
}

function VerificareRezervari({ firma, lunaId }: { firma: Firma; lunaId: string }) {
  const [result, setResult] = useState<VerificareResult|null>(null)
  const [checking, setChecking] = useState<Categorie|null>(null)
  const [error, setError] = useState('')
  const [lista, setLista] = useState<Map<string, RandLista>>(new Map())
  const [eroareLista, setEroareLista] = useState('')

  useEffect(() => {
    fetch(`/api/5stardesk/lista?lunaId=${encodeURIComponent(lunaId)}`).then(r => r.json()).then(d => {
      if (d.error) setEroareLista(d.error)
      else setLista(new Map((d.randuri as RandLista[]).map(r => [r.cheie, r])))
    }).catch(() => {})
  }, [lunaId])

  const comuta = useCallback(async (p: BifaPayload) => {
    const exista = lista.has(p.cheie)
    setLista(prev => { const m = new Map(prev); if (exista) m.delete(p.cheie); else m.set(p.cheie, { id:`tmp-${p.cheie}`, cheie:p.cheie, sectiune:p.sectiune, titlu:p.titlu, cod_rezervare:p.codRezervare || null, suma:p.suma ?? null, detalii:p.detalii, nota:null }); return m })
    const res = exista
      ? await fetch(`/api/5stardesk/lista?lunaId=${encodeURIComponent(lunaId)}&cheie=${encodeURIComponent(p.cheie)}`, { method:'DELETE' })
      : await fetch('/api/5stardesk/lista', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ lunaId, firmaId: firma.id, ...p }) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setEroareLista(d.error || 'Lista nu a putut fi salvată'); setLista(prev => { const m = new Map(prev); if (exista) m.set(p.cheie, lista.get(p.cheie)!); else m.delete(p.cheie); return m }); return }
    setEroareLista('')
    if (!exista && d.rand) setLista(prev => new Map(prev).set(p.cheie, d.rand))
  }, [lista, lunaId, firma.id])

  async function salveazaNota(id: string, nota: string) {
    const res = await fetch('/api/5stardesk/lista', { method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ id, nota }) })
    if (res.ok) setLista(prev => { const m = new Map(prev); for (const [k, r] of m) if (r.id === id) m.set(k, { ...r, nota: nota.trim() || null }); return m })
    else setEroareLista('Nota nu a putut fi salvată')
  }

  const load = useCallback(async () => {
    const res = await fetch(`/api/5stardesk/verifica?lunaId=${encodeURIComponent(lunaId)}`)
    const d = await res.json().catch(() => null)
    if (d) setResult(d)
  }, [lunaId])

  // La deschidere: rezultatul salvat apare imediat, apoi se citesc automat documentele noi
  // (borderouri / facturi 5StarDesk incarcate intre timp) - cele deja citite nu se recitesc.
  useEffect(() => { load().then(() => verifica('client', true)) }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  async function verifica(categorie: Categorie, silentios = false) {
    setChecking(categorie); if (!silentios) setError('')
    const res = await fetch('/api/5stardesk/verifica', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lunaId, firmaId: firma.id, categorie }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { if (!silentios) setError(d.error || 'Verificarea a eșuat') }
    else setResult(d)
    setChecking(null)
  }

  function eliminaDinLista(id: string, field: 'faraFacturaClient'|'discrepanteClient'|'faraComisionAirbnb') {
    setResult(prev => prev ? { ...prev, [field]: prev[field].filter(n => n.id !== id) } : prev)
  }

  const totalDiscrepante = result?.discrepanteClient.length || 0

  return (
    <ListaCtx.Provider value={{ randuri: lista, comuta }}>
    <div style={{ background:'var(--c-111111)', border:'1px solid var(--c-1e1e1e)', borderRadius:'var(--r-lg)', overflow:'hidden' }}>
      <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--c-1a1a1a)', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'12px', flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:'var(--fs-md)', fontWeight:600, color:'var(--c-e0e0e0)' }}>Rezervări nefacturate</div>
          <div style={{ fontSize:'var(--fs-sm)', color:'var(--c-888888)', marginTop:'2px' }}>
            Fiecare rezervare din borderou se caută după <b>codul de rezervare</b> (numele oaspetelui doar ca rezervă) în facturile 5StarDesk ale acestei luni și ale celorlalte luni; suma se compară separat. Documentele noi se citesc automat la deschidere.
          </div>
        </div>
        {totalDiscrepante > 0 && (
          <a
            href={`/api/5stardesk/discrepante-pdf?lunaId=${encodeURIComponent(lunaId)}&firmaNume=${encodeURIComponent(firma.nume)}`}
            style={{ flexShrink:0, fontSize:'var(--fs-xs)', fontWeight:600, padding:'6px 12px', borderRadius:'var(--r-sm)', border:'1px solid #F5C96A', color:'var(--warning)', textDecoration:'none', whiteSpace:'nowrap' }}
          >
            ↓ Descarcă lista discrepanțe ({totalDiscrepante})
          </a>
        )}
      </div>

      <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:'20px' }}>
        {error && <p style={{ fontSize:'var(--fs-xs)', color:'var(--danger)' }}>{error}</p>}
        {result && (
          <p style={{ fontSize:'var(--fs-xs)', color:'var(--c-666666)' }}>
            {result.totalRezervari} rezervări în borderouri · {result.totalFacturiClient} facturi client (5StarDesk) · {result.totalFacturiComision} facturi comision
          </p>
        )}

        <PanouLista randuri={[...lista.values()]} firma={firma} lunaId={lunaId} eroare={eroareLista}
          onNota={salveazaNota}
          onScoate={cheie => { const r = lista.get(cheie); if (r) comuta({ cheie, sectiune: r.sectiune, titlu: r.titlu || '', detalii: r.detalii || '' }) }}/>

        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--c-999999)', textTransform:'uppercase', letterSpacing:'.06em' }}>Fără factură client (5StarDesk)</span>
            <VerificaButon firma={firma} checking={checking==='client'} onClick={()=>verifica('client')}/>
          </div>
          {result && (result.faraFacturaClient.length === 0
            ? <p style={{ fontSize:'var(--fs-sm)', color:'var(--success)' }}>✓ Toate rezervările au factură client asociată.</p>
            : <><p style={{ fontSize:'var(--fs-xs)', color:'var(--c-666666)', marginTop:'-4px', marginBottom:'8px' }}>Clientul nu are factură 5StarDesk cu acest cod (nici pe nume) în nicio lună încărcată — trebuie facturat.</p>
              <ListaLipsa items={result.faraFacturaClient} tip="client" sectiune="Fără factură client" onResolved={id=>eliminaDinLista(id,'faraFacturaClient')}/></>)}
        </div>

        {result && (result.seFactureazaLunaViitoare?.length || 0) > 0 && (
          <div>
            <div style={{ marginBottom:'8px' }}>
              <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--c-999999)', textTransform:'uppercase', letterSpacing:'.06em' }}>ℹ Se facturează luna viitoare</span>
            </div>
            <p style={{ fontSize:'var(--fs-xs)', color:'var(--c-666666)', marginTop:'-4px', marginBottom:'8px' }}>Check-out după sfârșitul perioadei — factura se emite de regulă la check-out, deci nu e o lipsă acum. Verifică-le în luna următoare.</p>
            <ListaLipsa items={result.seFactureazaLunaViitoare || []} tip="client" sectiune="Se facturează luna viitoare" onResolved={()=>{}} faraActiune/>
          </div>
        )}

        {result && result.facturateAlteLuni.length > 0 && (
          <div>
            <div style={{ marginBottom:'8px' }}>
              <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--c-999999)', textTransform:'uppercase', letterSpacing:'.06em' }}>ℹ Facturate deja, în altă lună</span>
            </div>
            <p style={{ fontSize:'var(--fs-xs)', color:'var(--c-666666)', marginTop:'-4px', marginBottom:'8px' }}>Rezervarea a fost deja facturată, doar că înregistrată sub o altă lună contabilă a firmei — nu mai trebuie facturată acum.</p>
            <ListaAltaLuna items={result.facturateAlteLuni} tip="client" sectiune="Facturate în altă lună"/>
          </div>
        )}

        {result && result.discrepanteClient.length > 0 && (
          <div>
            <div style={{ marginBottom:'8px' }}>
              <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--warning)', textTransform:'uppercase', letterSpacing:'.06em' }}>⚠ Discrepanțe de preț — factură client (5StarDesk)</span>
            </div>
            <p style={{ fontSize:'var(--fs-xs)', color:'var(--c-666666)', marginTop:'-4px', marginBottom:'8px' }}>Rezervarea are factură (vezi eticheta: găsită după cod sau după nume), dar suma diferă de borderou. Rândul spune ce e de făcut: diferența nefacturată se facturează, iar un plus egal cu comisionul Airbnb se explică automat când factura de comision e în Airbnb · Facturi.</p>
            <ListaDiscrepante items={result.discrepanteClient} tip="client" sectiune="Discrepanță de preț" onResolved={id=>eliminaDinLista(id,'discrepanteClient')}/>
          </div>
        )}

        {result && result.discrepanteExplicateComision.length > 0 && (
          <div>
            <div style={{ marginBottom:'8px' }}>
              <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--c-999999)', textTransform:'uppercase', letterSpacing:'.06em' }}>✓ Diferențe explicate de comisionul Airbnb</span>
            </div>
            <p style={{ fontSize:'var(--fs-xs)', color:'var(--c-666666)', marginTop:'-4px', marginBottom:'8px' }}>Factura clientului = suma din borderou + comisionul Airbnb al aceleiași rezervări — nu e o eroare, nu necesită acțiune.</p>
            <ListaExplicate items={result.discrepanteExplicateComision} sectiune="Diferență explicată de comision"/>
          </div>
        )}

        <div>
          <div style={{ marginBottom:'8px' }}>
            <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--c-999999)', textTransform:'uppercase', letterSpacing:'.06em' }}>Facturi 5StarDesk fără rezervare în borderou</span>
          </div>
          <p style={{ fontSize:'var(--fs-xs)', color:'var(--c-666666)', marginTop:'-4px', marginBottom:'8px' }}>Verificare inversă — factura 5StarDesk există, dar rezervarea ei nu e în borderoul acestei luni. După check-out-ul de pe factură: după sfârșitul perioadei → intră în borderoul lunii următoare (ok); înainte de începutul ei → trebuia să fie în borderoul lunii trecute (de verificat); în perioadă → lipsește din borderou (de verificat). Cele de verificat apar primele.</p>
          {result && (result.facturiFaraRezervare.length === 0
            ? <p style={{ fontSize:'var(--fs-sm)', color:'var(--success)' }}>✓ Toate facturile 5StarDesk au rezervare asociată în borderou.</p>
            : <ListaOrfane items={result.facturiFaraRezervare} sectiune="Factură fără rezervare"/>)}
        </div>

        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--c-999999)', textTransform:'uppercase', letterSpacing:'.06em' }}>Fără factură de comision Airbnb</span>
            <VerificaButon firma={firma} checking={checking==='comision-airbnb'} onClick={()=>verifica('comision-airbnb')}/>
          </div>
          {result && (result.faraComisionAirbnb.length === 0
            ? <p style={{ fontSize:'var(--fs-sm)', color:'var(--success)' }}>✓ Toate rezervările Airbnb au factură de comision asociată.</p>
            : <ListaLipsa items={result.faraComisionAirbnb} tip="comision" sectiune="Fără factură de comision Airbnb" onResolved={id=>eliminaDinLista(id,'faraComisionAirbnb')}/>)}
        </div>

        {result && result.comisionAlteLuni.length > 0 && (
          <div>
            <div style={{ marginBottom:'8px' }}>
              <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--c-999999)', textTransform:'uppercase', letterSpacing:'.06em' }}>ℹ Comision facturat deja, în altă lună</span>
            </div>
            <ListaAltaLuna items={result.comisionAlteLuni} tip="comision" sectiune="Comision facturat în altă lună"/>
          </div>
        )}

        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--c-999999)', textTransform:'uppercase', letterSpacing:'.06em' }}>Factură de comision Booking</span>
            <VerificaButon firma={firma} checking={checking==='comision-booking'} onClick={()=>verifica('comision-booking')}/>
          </div>
          {result && (
            result.totalRezervariBooking === 0 ? (
              <p style={{ fontSize:'var(--fs-sm)', color:'var(--c-666666)' }}>Nicio rezervare Booking în borderoul acestei luni.</p>
            ) : result.comisionBookingLipsa ? (
              <p style={{ fontSize:'var(--fs-sm)', color:'var(--danger)' }}>⚠ Nu a fost găsită nicio factură de comision Booking pentru această lună — verifică secțiunea Booking · Facturi.</p>
            ) : (
              <p style={{ fontSize:'var(--fs-sm)', color:'var(--success)' }}>✓ Factură de comision Booking găsită pentru această lună. (Booking facturează agregat, nu per rezervare — nu se poate verifica fiecare rezervare individual.)</p>
            )
          )}
        </div>
      </div>
    </div>
    </ListaCtx.Provider>
  )
}

export default function StarsdeskModule({ firma, lunaId, tasks, checklistItems }: Props) {
  const sorted = [...checklistItems].sort((a, b) => (a.checklist_templates?.ordine || 0) - (b.checklist_templates?.ordine || 0))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <TaskSection tasks={tasks} lunaId={lunaId} culoare={firma.culoare}/>

      <VerificareRezervari firma={firma} lunaId={lunaId}/>

      {sorted.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-666666)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '2px', display: 'block' }}>
            Documente salvate anterior
          </span>
          {sorted.map(item => (
            <OldItemDocs key={item.id} item={item} firmaId={firma.id} lunaId={lunaId} culoare={firma.culoare}/>
          ))}
        </div>
      )}

      <UploadPanel
        firmaId={firma.id}
        lunaId={lunaId}
        section="5stardesk"
        culoare={firma.culoare}
        title="5StarDesk · Facturi"
        description="Facturi din platforma 5StarDesk"
        documentTypeOptions={[
          { value: 'factura', label: 'Factură' },
          { value: 'borderou', label: 'Borderou' },
        ]}
        showLinkImport
        linkPlaceholder="Link PDF 5StarDesk"
      />
    </div>
  )
}
