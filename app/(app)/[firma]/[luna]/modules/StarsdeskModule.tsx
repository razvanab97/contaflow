'use client'
import { useState, useEffect, useCallback } from 'react'
import TaskSection, { TaskItem } from './TaskSection'
import UploadPanel from './UploadPanel'
import OldItemDocs, { ChecklistItem } from './OldItemDocs'
import { legibil } from '@/lib/colors'

interface Firma { id: string; slug: string; nume: string; culoare: string }
interface Props { firma: Firma; lunaId: string; tasks: TaskItem[]; checklistItems: ChecklistItem[] }
interface Nefacturata { id:string; codRezervare:string; numeOaspete:string; suma:number|null; platforma:string }
interface FacturaOrfana { id:string; numarFactura:string; numeClient:string; suma:number|null; idRezervare:string }
interface Discrepanta extends Nefacturata { numarFactura:string; sumaFactura:number|null }
interface DiscrepantaExplicata extends Discrepanta { numarComision:string; sumaComision:number|null }
interface FacturataAltaLuna extends Discrepanta { luna:string }
interface VerificareResult {
  totalRezervari:number; totalFacturiClient:number; totalFacturiComision:number
  faraFacturaClient:Nefacturata[]; discrepanteClient:Discrepanta[]; discrepanteExplicateComision:DiscrepantaExplicata[]
  facturateAlteLuni:FacturataAltaLuna[]
  facturiFaraRezervare:FacturaOrfana[]
  faraComisionAirbnb:Nefacturata[]; comisionAlteLuni:FacturataAltaLuna[]
  comisionBookingLipsa:boolean; totalRezervariBooking:number
}

function money(v: number|null) { return v == null ? '—' : new Intl.NumberFormat('ro-RO', { minimumFractionDigits:2, maximumFractionDigits:2 }).format(v) }

function ListaLipsa({ items, tip, onResolved }: { items: Nefacturata[]; tip:'client'|'comision'; onResolved:(id:string)=>void }) {
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
        <div key={n.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'var(--c-161616)', borderRadius:'7px', flexWrap:'wrap' }}>
          <span style={{ fontSize:'10px', fontWeight:700, padding:'2px 7px', borderRadius:'5px', background: n.platforma==='airbnb' ? 'light-dark(rgba(220,38,38,.25), rgba(248,113,113,.1))' : 'light-dark(rgba(37,99,235,.25), rgba(96,165,250,.1))', color: n.platforma==='airbnb' ? 'var(--accent-red)' : 'var(--accent-blue)', flexShrink:0 }}>
            {n.platforma === 'airbnb' ? 'Airbnb' : 'Booking'}
          </span>
          <span style={{ flex:'1 1 80px', fontSize:'12px', color:'var(--c-dddddd)', minWidth:'80px' }}>{n.numeOaspete || '—'}</span>
          <span style={{ fontSize:'12px', fontWeight:600, color:'var(--c-ffffff)', fontFamily:'monospace' }}>{n.codRezervare}</span>
          <span style={{ fontSize:'11px', color:'var(--c-888888)', flexShrink:0 }}>{money(n.suma)} RON</span>
          <input
            value={note[n.id] || ''}
            onChange={e => setNote(prev => ({ ...prev, [n.id]: e.target.value }))}
            placeholder="Notă opțională (ex: luna viitoare, la jumătate)"
            style={{ fontSize:'11px', width:'200px', flexShrink:0, background:'var(--c-0d0d0d)', border:'1px solid var(--c-2a2a2a)', borderRadius:'6px', padding:'5px 8px', color:'var(--c-cccccc)', outline:'none' }}
          />
          <button
            onClick={() => marcheaza(n.id)}
            disabled={resolving === n.id}
            style={{ fontSize:'11px', fontWeight:600, padding:'4px 10px', borderRadius:'6px', border:'1px solid light-dark(rgba(5,150,105,.525), rgba(110,231,176,.35))', background:'light-dark(rgba(5,150,105,.2), rgba(110,231,176,.08))', color:'var(--accent-mint)', cursor:'pointer', flexShrink:0, opacity: resolving===n.id ? .5 : 1 }}
          >
            {resolving === n.id ? '...' : '✓ Am facturat'}
          </button>
        </div>
      ))}
    </div>
  )
}

function ListaOrfane({ items }: { items: FacturaOrfana[] }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
      {items.map(f => (
        <div key={f.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'var(--c-161616)', borderRadius:'7px' }}>
          <span style={{ fontSize:'10px', fontWeight:700, padding:'2px 7px', borderRadius:'5px', background:'light-dark(rgba(180,83,9,.25), rgba(245,201,106,.1))', color:'#F5C96A', flexShrink:0 }}>
            {f.numarFactura || '—'}
          </span>
          <span style={{ flex:1, fontSize:'12px', color:'var(--c-dddddd)' }}>{f.numeClient || '—'}</span>
          {f.idRezervare && <span style={{ fontSize:'12px', fontWeight:600, color:'var(--c-ffffff)', fontFamily:'monospace' }}>{f.idRezervare}</span>}
          <span style={{ fontSize:'11px', color:'var(--c-888888)', flexShrink:0 }}>{money(f.suma)} RON</span>
        </div>
      ))}
    </div>
  )
}

function ListaDiscrepante({ items, tip, onResolved }: { items: Discrepanta[]; tip:'client'|'comision'; onResolved:(id:string)=>void }) {
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
        <div key={d.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'light-dark(rgba(180,83,9,.08), rgba(245,201,106,.06))', border:'1px solid light-dark(rgba(180,83,9,.3), rgba(245,201,106,.2))', borderRadius:'7px' }}>
          <span style={{ fontSize:'10px', fontWeight:700, padding:'2px 7px', borderRadius:'5px', background: d.platforma==='airbnb' ? 'light-dark(rgba(220,38,38,.25), rgba(248,113,113,.1))' : 'light-dark(rgba(37,99,235,.25), rgba(96,165,250,.1))', color: d.platforma==='airbnb' ? 'var(--accent-red)' : 'var(--accent-blue)', flexShrink:0 }}>
            {d.platforma === 'airbnb' ? 'Airbnb' : 'Booking'}
          </span>
          <span style={{ flex:1, fontSize:'12px', color:'var(--c-dddddd)' }}>{d.numeOaspete || '—'} <span style={{ color:'var(--c-666666)' }}>· factura {d.numarFactura || '—'}</span></span>
          <span style={{ fontSize:'11px', color:'var(--c-888888)', flexShrink:0 }}>borderou {money(d.suma)} RON ≠ factură {money(d.sumaFactura)} RON</span>
          <button
            onClick={() => marcheaza(d.id)}
            disabled={resolving === d.id}
            style={{ fontSize:'11px', fontWeight:600, padding:'4px 10px', borderRadius:'6px', border:'1px solid light-dark(rgba(5,150,105,.525), rgba(110,231,176,.35))', background:'light-dark(rgba(5,150,105,.2), rgba(110,231,176,.08))', color:'var(--accent-mint)', cursor:'pointer', flexShrink:0, opacity: resolving===d.id ? .5 : 1 }}
          >
            {resolving === d.id ? '...' : '✓ E în regulă'}
          </button>
        </div>
      ))}
    </div>
  )
}

// Diferenta dintre factura client si borderou e explicata exact de comisionul Airbnb al acelei
// rezervari (factura = borderou + comision) - nu e o eroare de facturare, doar informativ.
function ListaExplicate({ items }: { items: DiscrepantaExplicata[] }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
      {items.map(d => (
        <div key={d.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'var(--c-161616)', borderRadius:'7px' }}>
          <span style={{ fontSize:'10px', fontWeight:700, padding:'2px 7px', borderRadius:'5px', background:'light-dark(rgba(220,38,38,.25), rgba(248,113,113,.1))', color:'var(--accent-red)', flexShrink:0 }}>Airbnb</span>
          <span style={{ flex:1, fontSize:'12px', color:'var(--c-dddddd)' }}>{d.numeOaspete || '—'} <span style={{ color:'var(--c-666666)' }}>· factura {d.numarFactura || '—'}</span></span>
          <span style={{ fontSize:'11px', color:'var(--c-777777)', flexShrink:0 }}>
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
function ListaAltaLuna({ items, tip }: { items: FacturataAltaLuna[]; tip:'client'|'comision' }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
      {items.map(d => (
        <div key={d.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'var(--c-161616)', borderRadius:'7px' }}>
          <span style={{ fontSize:'10px', fontWeight:700, padding:'2px 7px', borderRadius:'5px', background: d.platforma==='airbnb' ? 'light-dark(rgba(220,38,38,.25), rgba(248,113,113,.1))' : 'light-dark(rgba(37,99,235,.25), rgba(96,165,250,.1))', color: d.platforma==='airbnb' ? 'var(--accent-red)' : 'var(--accent-blue)', flexShrink:0 }}>
            {d.platforma === 'airbnb' ? 'Airbnb' : 'Booking'}
          </span>
          <span style={{ flex:1, fontSize:'12px', color:'var(--c-dddddd)' }}>{d.numeOaspete || '—'} <span style={{ color:'var(--c-666666)' }}>· {tip === 'client' ? 'factura' : 'comision'} {d.numarFactura || '—'}</span></span>
          <span style={{ fontSize:'11px', color:'var(--c-777777)', flexShrink:0 }}>ℹ facturat în <b style={{ color:'var(--c-aaaaaa)' }}>{d.luna}</b></span>
        </div>
      ))}
    </div>
  )
}

type Categorie = 'client' | 'comision-airbnb' | 'comision-booking'

function VerificaButon({ firma, checking, onClick }: { firma:Firma; checking:boolean; onClick:()=>void }) {
  return (
    <button onClick={onClick} disabled={checking} style={{ flexShrink:0, fontSize:'11px', fontWeight:600, padding:'6px 12px', borderRadius:'7px', border:`1px solid ${firma.culoare}`, background:'transparent', color:legibil(firma.culoare), cursor:'pointer', opacity:checking?.6:1 }}>
      {checking ? 'Se verifică...' : 'Verifică'}
    </button>
  )
}

function VerificareRezervari({ firma, lunaId }: { firma: Firma; lunaId: string }) {
  const [result, setResult] = useState<VerificareResult|null>(null)
  const [checking, setChecking] = useState<Categorie|null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/5stardesk/verifica?lunaId=${encodeURIComponent(lunaId)}`)
    const d = await res.json().catch(() => null)
    if (d) setResult(d)
  }, [lunaId])

  useEffect(() => { load() }, [load])

  async function verifica(categorie: Categorie) {
    setChecking(categorie); setError('')
    const res = await fetch('/api/5stardesk/verifica', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lunaId, firmaId: firma.id, categorie }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) setError(d.error || 'Verificarea a eșuat')
    else setResult(d)
    setChecking(null)
  }

  function eliminaDinLista(id: string, field: 'faraFacturaClient'|'discrepanteClient'|'faraComisionAirbnb') {
    setResult(prev => prev ? { ...prev, [field]: prev[field].filter(n => n.id !== id) } : prev)
  }

  const totalDiscrepante = result?.discrepanteClient.length || 0

  return (
    <div style={{ background:'var(--c-111111)', border:'1px solid var(--c-1e1e1e)', borderRadius:'12px', overflow:'hidden' }}>
      <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--c-1a1a1a)', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'12px', flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:'13px', fontWeight:600, color:'var(--c-e0e0e0)' }}>Rezervări nefacturate</div>
          <div style={{ fontSize:'12px', color:'var(--c-888888)', marginTop:'2px' }}>
            Verifică borderourile Airbnb + Booking, după cod rezervare și sumă, împotriva facturilor deja încărcate — pe fiecare categorie separat.
          </div>
        </div>
        {totalDiscrepante > 0 && (
          <a
            href={`/api/5stardesk/discrepante-pdf?lunaId=${encodeURIComponent(lunaId)}&firmaNume=${encodeURIComponent(firma.nume)}`}
            style={{ flexShrink:0, fontSize:'11px', fontWeight:600, padding:'6px 12px', borderRadius:'7px', border:'1px solid #F5C96A', color:'#F5C96A', textDecoration:'none', whiteSpace:'nowrap' }}
          >
            ↓ Descarcă lista discrepanțe ({totalDiscrepante})
          </a>
        )}
      </div>

      <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:'20px' }}>
        {error && <p style={{ fontSize:'11px', color:'var(--accent-red)' }}>{error}</p>}
        {result && (
          <p style={{ fontSize:'11px', color:'var(--c-666666)' }}>
            {result.totalRezervari} rezervări în borderouri · {result.totalFacturiClient} facturi client (5StarDesk) · {result.totalFacturiComision} facturi comision
          </p>
        )}

        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontSize:'11px', fontWeight:700, color:'var(--c-999999)', textTransform:'uppercase', letterSpacing:'.06em' }}>Fără factură client (5StarDesk)</span>
            <VerificaButon firma={firma} checking={checking==='client'} onClick={()=>verifica('client')}/>
          </div>
          {result && (result.faraFacturaClient.length === 0
            ? <p style={{ fontSize:'12px', color:'var(--accent-mint)' }}>✓ Toate rezervările au factură client asociată.</p>
            : <ListaLipsa items={result.faraFacturaClient} tip="client" onResolved={id=>eliminaDinLista(id,'faraFacturaClient')}/>)}
        </div>

        {result && result.facturateAlteLuni.length > 0 && (
          <div>
            <div style={{ marginBottom:'8px' }}>
              <span style={{ fontSize:'11px', fontWeight:700, color:'var(--c-999999)', textTransform:'uppercase', letterSpacing:'.06em' }}>ℹ Facturate deja, în altă lună</span>
            </div>
            <p style={{ fontSize:'11px', color:'var(--c-666666)', marginTop:'-4px', marginBottom:'8px' }}>Rezervarea a fost deja facturată, doar că înregistrată sub o altă lună contabilă a firmei — nu mai trebuie facturată acum.</p>
            <ListaAltaLuna items={result.facturateAlteLuni} tip="client"/>
          </div>
        )}

        {result && result.discrepanteClient.length > 0 && (
          <div>
            <div style={{ marginBottom:'8px' }}>
              <span style={{ fontSize:'11px', fontWeight:700, color:'#F5C96A', textTransform:'uppercase', letterSpacing:'.06em' }}>⚠ Discrepanțe de preț — factură client (5StarDesk)</span>
            </div>
            <p style={{ fontSize:'11px', color:'var(--c-666666)', marginTop:'-4px', marginBottom:'8px' }}>Factura a fost găsită (cod sau nume potrivit), dar suma nu corespunde cu cea din borderou.</p>
            <ListaDiscrepante items={result.discrepanteClient} tip="client" onResolved={id=>eliminaDinLista(id,'discrepanteClient')}/>
          </div>
        )}

        {result && result.discrepanteExplicateComision.length > 0 && (
          <div>
            <div style={{ marginBottom:'8px' }}>
              <span style={{ fontSize:'11px', fontWeight:700, color:'var(--c-999999)', textTransform:'uppercase', letterSpacing:'.06em' }}>✓ Diferențe explicate de comisionul Airbnb</span>
            </div>
            <p style={{ fontSize:'11px', color:'var(--c-666666)', marginTop:'-4px', marginBottom:'8px' }}>Factura clientului = suma din borderou + comisionul Airbnb al aceleiași rezervări — nu e o eroare, nu necesită acțiune.</p>
            <ListaExplicate items={result.discrepanteExplicateComision}/>
          </div>
        )}

        <div>
          <div style={{ marginBottom:'8px' }}>
            <span style={{ fontSize:'11px', fontWeight:700, color:'var(--c-999999)', textTransform:'uppercase', letterSpacing:'.06em' }}>Facturi 5StarDesk fără rezervare în borderou</span>
          </div>
          <p style={{ fontSize:'11px', color:'var(--c-666666)', marginTop:'-4px', marginBottom:'8px' }}>Verificare inversă — factura există, dar rezervarea ei nu a fost găsită în borderoul lunii (posibil lipsă din borderou, cod citit greșit, sau lună diferită).</p>
          {result && (result.facturiFaraRezervare.length === 0
            ? <p style={{ fontSize:'12px', color:'var(--accent-mint)' }}>✓ Toate facturile 5StarDesk au rezervare asociată în borderou.</p>
            : <ListaOrfane items={result.facturiFaraRezervare}/>)}
        </div>

        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontSize:'11px', fontWeight:700, color:'var(--c-999999)', textTransform:'uppercase', letterSpacing:'.06em' }}>Fără factură de comision Airbnb</span>
            <VerificaButon firma={firma} checking={checking==='comision-airbnb'} onClick={()=>verifica('comision-airbnb')}/>
          </div>
          {result && (result.faraComisionAirbnb.length === 0
            ? <p style={{ fontSize:'12px', color:'var(--accent-mint)' }}>✓ Toate rezervările Airbnb au factură de comision asociată.</p>
            : <ListaLipsa items={result.faraComisionAirbnb} tip="comision" onResolved={id=>eliminaDinLista(id,'faraComisionAirbnb')}/>)}
        </div>

        {result && result.comisionAlteLuni.length > 0 && (
          <div>
            <div style={{ marginBottom:'8px' }}>
              <span style={{ fontSize:'11px', fontWeight:700, color:'var(--c-999999)', textTransform:'uppercase', letterSpacing:'.06em' }}>ℹ Comision facturat deja, în altă lună</span>
            </div>
            <ListaAltaLuna items={result.comisionAlteLuni} tip="comision"/>
          </div>
        )}

        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontSize:'11px', fontWeight:700, color:'var(--c-999999)', textTransform:'uppercase', letterSpacing:'.06em' }}>Factură de comision Booking</span>
            <VerificaButon firma={firma} checking={checking==='comision-booking'} onClick={()=>verifica('comision-booking')}/>
          </div>
          {result && (
            result.totalRezervariBooking === 0 ? (
              <p style={{ fontSize:'12px', color:'var(--c-666666)' }}>Nicio rezervare Booking în borderoul acestei luni.</p>
            ) : result.comisionBookingLipsa ? (
              <p style={{ fontSize:'12px', color:'var(--accent-red)' }}>⚠ Nu a fost găsită nicio factură de comision Booking pentru această lună — verifică secțiunea Booking · Facturi.</p>
            ) : (
              <p style={{ fontSize:'12px', color:'var(--accent-mint)' }}>✓ Factură de comision Booking găsită pentru această lună. (Booking facturează agregat, nu per rezervare — nu se poate verifica fiecare rezervare individual.)</p>
            )
          )}
        </div>
      </div>
    </div>
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
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-666666)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '2px', display: 'block' }}>
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
