'use client'
import { useState } from 'react'
import { purchaseAmounts } from '@/lib/achizitii-vat'

export default function OfferPrice({ id, suma, valuta, onSaved }: { id: string; suma?: number | null; valuta?: string | null; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('RON')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const values = suma != null ? purchaseAmounts(String(suma), '1', '1', 'gross') : null
  const money = (value: number) => `${value.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${valuta || 'RON'}`
  async function request(read: boolean) {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/achizitii/oferte/pret', { method: read ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, suma: amount, valuta: currency }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Prețul nu a putut fi preluat.')
      if (read) { setAmount(String(result.suma)); setCurrency(result.valuta); setMessage('Propunere citită din PDF. Verifică totalul cu TVA și salvează pentru confirmare.') }
      else { setEditing(false); onSaved() }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Operația a eșuat.') }
    finally { setBusy(false) }
  }
  return <div style={{marginTop:6,fontSize:'var(--fs-sm)'}}>
    {values ? <div><strong>Total cu TVA: {money(values.grossTotal)}</strong><span style={{display:'block',color:'var(--text-secondary)'}}>Bază calculată: {money(values.netTotal)} · TVA 21%: {money(values.vatTotal)}</span></div> : <span>Preț necompletat</span>}
    <button type="button" className="btn btn-sm" style={{marginTop:6}} disabled={busy} onClick={()=>{setAmount(suma == null ? '' : String(suma));setCurrency(valuta || 'RON');setMessage('');setEditing(value=>!value)}}>{editing ? 'Închide' : values ? 'Editează prețul' : 'Completează prețul'}</button>
    {editing && <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:6,alignItems:'center'}}>
      <label>Total cu TVA <input aria-label="Total ofertă cu TVA" inputMode="decimal" value={amount} disabled={busy} onChange={event=>setAmount(event.target.value)} style={{width:140,padding:6}}/></label>
      <label>Monedă <select aria-label="Moneda ofertei" value={currency} disabled={busy} onChange={event=>setCurrency(event.target.value)}>{Array.from(new Set(['RON','EUR','USD',currency])).map(code=><option key={code}>{code}</option>)}</select></label>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={()=>void request(true)}>Citește prețul din PDF cu AI</button>
      <button type="button" className="btn btn-sm btn-primary" disabled={busy || !amount.trim()} onClick={()=>void request(false)}>Salvează prețul</button>
    </div>}
    {busy && <p role="status">Se procesează prețul…</p>}
    {message && <p role="status">{message}</p>}
  </div>
}
