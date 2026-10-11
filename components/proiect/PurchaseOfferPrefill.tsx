'use client'
import { useEffect, useRef, useState } from 'react'
import type { Draft } from '@/lib/proiect-workflow'
import { appendOfferProposal, offerSelectionText, lowestNoteOffer, type OfferProposal } from '@/lib/achizitii-offer-prefill'
import VeziButon from '@/components/ui/VeziButon'

export default function PurchaseOfferPrefill({ firmaId, scope, draft, onApply }: { firmaId: string; scope: string; draft: Draft; onApply: (draft: Draft) => void }) {
  const [offers, setOffers] = useState<OfferProposal[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [verified, setVerified] = useState(false)
  const cheapest = lowestNoteOffer(draft)
  const comparison = useRef('')
  useEffect(()=>{const key=JSON.stringify(draft.lines);if(comparison.current!==key){comparison.current=key;setVerified(false)}},[draft.lines])
  const controller = useRef<AbortController | null>(null)
  useEffect(()=>()=>controller.current?.abort(), [])
  async function read() {
    const request = new AbortController(); controller.current = request
    setBusy(true); setMessage(''); setOffers([])
    try {
      const response = await fetch('/api/achizitii/oferte/precompletare', { method:'POST', headers:{'Content-Type':'application/json'}, signal:request.signal, body:JSON.stringify({ firmaId, scope }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ofertele nu au putut fi analizate.')
      if (!request.signal.aborted) setOffers(data.offers)
    } catch (error) { if (!request.signal.aborted) setMessage(error instanceof Error ? error.message : 'Analiza a eșuat.') }
    finally { if (!request.signal.aborted) setBusy(false) }
  }
  function apply(offer: OfferProposal) {
    try {
      const next = appendOfferProposal(draft, offer)
      onApply(next)
      setMessage('Pozițiile au fost preluate în formular. Verifică datele lipsă și elimină eventualul rând orientativ nefolosit; completările existente nu au fost suprascrise.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Pozițiile nu pot fi adăugate.') }
  }
  return <section style={{padding:20,border:'1px solid var(--accent)',borderRadius:'var(--r-lg)',background:'var(--surface)'}}>
    <h3 style={{fontWeight:650}}>Completează Anexa 1 din ofertele încărcate</h3>
    <p style={{margin:'8px 0',fontSize:'var(--fs-sm)',color:'var(--text-secondary)'}}>Formatul exemplului: furnizor și site, denumire generică, 3–4 specificații comune, cantitate 1 și preț fără TVA. AI-ul citește PDF-urile prin integrarea Anthropic existentă. Din prețul cu TVA 21% calculăm baza prin împărțire la 1,21; bugetul nu este preț. Verifică specificațiile înainte de preluare; nu coborâm minimul salvat.</p>
    <button type="button" className="btn btn-primary" disabled={busy} onClick={()=>void read()}>{busy ? 'AI-ul citește ofertele…' : 'Citește ofertele și propune completarea'}</button>
    {offers.length===3 && offers.every(offer=>offer.lines.length===1) && <button type="button" className="btn" style={{marginLeft:8}} onClick={()=>{if(draft.lines.some(line=>line.product.trim()||line.price.trim()||line.supplier.trim())&&!confirm('Înlocuiești pozițiile din formular cu cele trei oferte analizate? Datele generale și justificarea rămân neschimbate.'))return;onApply({...draft,lines:offers.flatMap(offer=>offer.lines.map(line=>({...line})))});setMessage('Cele trei oferte au fost preluate în formatul notei. Verifică prețurile și specificațiile comune.')}}>Preia cele trei oferte în tabel</button>}
    {message && <p role="status" style={{marginTop:10}}>{message}</p>}
    <div style={{marginTop:12,padding:12,background:'var(--surface-sunken)',borderRadius:'var(--r-md)'}}>
      <strong>Justificare: cel mai mic preț fără TVA</strong>
      {cheapest ? <>
        <p style={{margin:'8px 0'}}>{cheapest.text}</p>
        <label style={{display:'block',marginBottom:8}}><input type="checkbox" checked={verified} onChange={event=>setVerified(event.target.checked)}/> Am verificat că cele trei oferte sunt comparabile și respectă specificațiile minime.</label>
        <button type="button" className="btn btn-sm" disabled={!verified || !!draft.fields.justificare?.trim()} onClick={()=>{if(!verified || draft.fields.justificare?.trim())return;onApply({...draft,fields:{...draft.fields,justificare:cheapest.text}});setMessage('Justificarea pe baza celui mai mic preț fără TVA a fost preluată.')}}>{draft.fields.justificare?.trim() ? 'Justificare existentă — nu suprascriem' : 'Preia justificarea celui mai mic preț'}</button>
      </> : <p style={{marginTop:8,fontSize:'var(--fs-sm)'}}>Preia câte o poziție de la trei furnizori diferiți, cu denumire și specificații comune, cantitate 1 și prețuri în lei. Egalitățile, variantele multiple și datele incomplete necesită alegere manuală.</p>}
    </div>
    {offers.map(offer => <div key={offer.id} style={{marginTop:16,padding:12,border:'1px solid var(--border)',borderRadius:'var(--r-md)'}}>
      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}><strong>{offer.name}</strong><VeziButon url={`/api/chitante/document?id=${encodeURIComponent(offer.id)}`} nume={offer.name}/></div>
      {offer.savedTotal != null && <p style={{marginTop:8,fontSize:'var(--fs-sm)'}}>Total cu TVA deja salvat: <strong>{offer.savedTotal.toLocaleString('ro-RO', {minimumFractionDigits:2,maximumFractionDigits:2})} {offer.savedCurrency || 'monedă de verificat'}</strong>. Este păstrat separat de propunerea AI.</p>}
      {offer.lines.map((line,index)=><div key={index} style={{marginTop:10,padding:10,background:'var(--surface-sunken)',borderRadius:'var(--r-sm)',fontSize:'var(--fs-sm)'}}>
        <strong>{line.supplier || 'Furnizor de completat'} · {line.product}</strong>
        <p>Site: {line.website || 'de completat după verificare'}</p>
        <p style={{whiteSpace:'pre-wrap',margin:'6px 0'}}>{line.specs || 'Specificații de completat'}</p>
        <p>Cantitate: {line.qty || 'neidentificată'} {line.unit} · Preț unitar {line.priceMode === 'gross' ? 'cu TVA' : 'fără TVA'}: {line.price || 'neidentificat'} {line.currency} · Data: {line.date || 'neidentificată'}</p>
        <p style={{overflowWrap:'anywhere',marginTop:6,color:'var(--text-secondary)'}}>Sursă: {line.source}</p>
        {line.currency && line.currency !== 'RON' && <p>Cursul valutar rămâne de completat manual.</p>}
        <button type="button" className="btn btn-sm" style={{marginTop:8}} onClick={()=>apply({...offer,lines:[line]})}>Preia doar această poziție</button>
      </div>)}
      {offer.warnings.map((warning,index)=><p key={index} style={{marginTop:6,color:'var(--warning)',fontSize:'var(--fs-sm)'}}>{warning}</p>)}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
        <button type="button" className="btn btn-sm" disabled={!offer.lines.length} onClick={()=>apply(offer)}>Preia pozițiile acestei oferte</button>
        <button type="button" className="btn btn-sm" disabled={!offer.lines.length || !!draft.fields.justificare?.trim()} onClick={()=>{if (draft.fields.justificare?.trim()) return; onApply({...draft,fields:{...draft.fields,justificare:offerSelectionText(offer)}});setMessage('Oferta a fost selectată explicit. Completează motivul alegerii după compararea ofertelor; justificarea poate fi editată în formular.')}}>{draft.fields.justificare?.trim() ? 'Justificare deja completată — nu suprascriem' : 'Aleg această ofertă — propune justificarea'}</button>
      </div>
    </div>)}
  </section>
}
