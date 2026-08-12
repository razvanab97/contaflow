'use client'
import { useState, useEffect, useCallback } from 'react'
import TaskSection, { TaskItem } from './TaskSection'
import UploadPanel from './UploadPanel'
import OldItemDocs, { ChecklistItem } from './OldItemDocs'
import { legibil } from '@/lib/colors'

interface Firma { id: string; slug: string; nume: string; culoare: string }
interface Props { firma: Firma; lunaId: string; tasks: TaskItem[]; checklistItems: ChecklistItem[] }
interface Nefacturata { id:string; codRezervare:string; numeOaspete:string; suma:number|null; platforma:string }
interface VerificareResult {
  totalRezervari:number; totalFacturiClient:number; totalFacturiComision:number
  faraFacturaClient:Nefacturata[]; faraComisionAirbnb:Nefacturata[]
  comisionBookingLipsa:boolean; totalRezervariBooking:number
}

function money(v: number|null) { return v == null ? '—' : new Intl.NumberFormat('ro-RO', { minimumFractionDigits:2, maximumFractionDigits:2 }).format(v) }

function ListaLipsa({ items, tip, onResolved }: { items: Nefacturata[]; tip:'client'|'comision'; onResolved:(id:string)=>void }) {
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
      {items.map(n => (
        <div key={n.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'#161616', borderRadius:'7px' }}>
          <span style={{ fontSize:'10px', fontWeight:700, padding:'2px 7px', borderRadius:'5px', background: n.platforma==='airbnb' ? 'rgba(248,113,113,.1)' : 'rgba(96,165,250,.1)', color: n.platforma==='airbnb' ? '#F87171' : '#60A5FA', flexShrink:0 }}>
            {n.platforma === 'airbnb' ? 'Airbnb' : 'Booking'}
          </span>
          <span style={{ flex:1, fontSize:'12px', color:'#DDD' }}>{n.numeOaspete || '—'}</span>
          <span style={{ fontSize:'12px', fontWeight:600, color:'#FFF', fontFamily:'monospace' }}>{n.codRezervare}</span>
          <span style={{ fontSize:'11px', color:'#888', flexShrink:0 }}>{money(n.suma)} RON</span>
          <button
            onClick={() => marcheaza(n.id)}
            disabled={resolving === n.id}
            style={{ fontSize:'11px', fontWeight:600, padding:'4px 10px', borderRadius:'6px', border:'1px solid rgba(110,231,176,.35)', background:'rgba(110,231,176,.08)', color:'#6EE7B0', cursor:'pointer', flexShrink:0, opacity: resolving===n.id ? .5 : 1 }}
          >
            {resolving === n.id ? '...' : '✓ Am facturat'}
          </button>
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

  function eliminaDinLista(id: string, field: 'faraFacturaClient'|'faraComisionAirbnb') {
    setResult(prev => prev ? { ...prev, [field]: prev[field].filter(n => n.id !== id) } : prev)
  }

  return (
    <div style={{ background:'#111', border:'1px solid #1E1E1E', borderRadius:'12px', overflow:'hidden' }}>
      <div style={{ padding:'16px 20px', borderBottom:'1px solid #1A1A1A' }}>
        <div style={{ fontSize:'13px', fontWeight:600, color:'#E0E0E0' }}>Rezervări nefacturate</div>
        <div style={{ fontSize:'12px', color:'#888', marginTop:'2px' }}>
          Verifică borderourile Airbnb + Booking, după cod rezervare și sumă, împotriva facturilor deja încărcate — pe fiecare categorie separat.
        </div>
      </div>

      <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:'20px' }}>
        {error && <p style={{ fontSize:'11px', color:'#F87171' }}>{error}</p>}
        {result && (
          <p style={{ fontSize:'11px', color:'#666' }}>
            {result.totalRezervari} rezervări în borderouri · {result.totalFacturiClient} facturi client (5StarDesk) · {result.totalFacturiComision} facturi comision
          </p>
        )}

        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontSize:'11px', fontWeight:700, color:'#999', textTransform:'uppercase', letterSpacing:'.06em' }}>Fără factură client (5StarDesk)</span>
            <VerificaButon firma={firma} checking={checking==='client'} onClick={()=>verifica('client')}/>
          </div>
          {result && (result.faraFacturaClient.length === 0
            ? <p style={{ fontSize:'12px', color:'#6EE7B0' }}>✓ Toate rezervările au factură client asociată.</p>
            : <ListaLipsa items={result.faraFacturaClient} tip="client" onResolved={id=>eliminaDinLista(id,'faraFacturaClient')}/>)}
        </div>

        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontSize:'11px', fontWeight:700, color:'#999', textTransform:'uppercase', letterSpacing:'.06em' }}>Fără factură de comision Airbnb</span>
            <VerificaButon firma={firma} checking={checking==='comision-airbnb'} onClick={()=>verifica('comision-airbnb')}/>
          </div>
          {result && (result.faraComisionAirbnb.length === 0
            ? <p style={{ fontSize:'12px', color:'#6EE7B0' }}>✓ Toate rezervările Airbnb au factură de comision asociată.</p>
            : <ListaLipsa items={result.faraComisionAirbnb} tip="comision" onResolved={id=>eliminaDinLista(id,'faraComisionAirbnb')}/>)}
        </div>

        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontSize:'11px', fontWeight:700, color:'#999', textTransform:'uppercase', letterSpacing:'.06em' }}>Factură de comision Booking</span>
            <VerificaButon firma={firma} checking={checking==='comision-booking'} onClick={()=>verifica('comision-booking')}/>
          </div>
          {result && (
            result.totalRezervariBooking === 0 ? (
              <p style={{ fontSize:'12px', color:'#666' }}>Nicio rezervare Booking în borderoul acestei luni.</p>
            ) : result.comisionBookingLipsa ? (
              <p style={{ fontSize:'12px', color:'#F87171' }}>⚠ Nu a fost găsită nicio factură de comision Booking pentru această lună — verifică secțiunea Booking · Facturi.</p>
            ) : (
              <p style={{ fontSize:'12px', color:'#6EE7B0' }}>✓ Factură de comision Booking găsită pentru această lună. (Booking facturează agregat, nu per rezervare — nu se poate verifica fiecare rezervare individual.)</p>
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
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '2px', display: 'block' }}>
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
