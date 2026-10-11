'use client'
import { useEffect, useRef, useState } from 'react'

export default function SpecificationAiExpander({ firmaId, product, type, keywords, disabled, onApply }: { firmaId: string; product: string; type: string; keywords: string; disabled: boolean; onApply: (text: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [proposal, setProposal] = useState<{ text: string; reason: string; product: string; keywords: string; type: string } | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  useEffect(() => () => requestRef.current?.abort(), [])
  const changed = !!proposal && (proposal.product !== product || proposal.keywords !== keywords || proposal.type !== type)
  async function generate() {
    if (busy || disabled || !product.trim() || !keywords.trim()) return
    const controller = new AbortController(); requestRef.current = controller
    setBusy(true); setError(''); setProposal(null)
    try {
      const response = await fetch('/api/achizitii/specificatii-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ firmaId, product, type, keywords }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Generarea a eșuat.')
      setProposal({ text: data.text, reason: data.reason, product, type, keywords })
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Eroare AI.') }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <div style={{ gridColumn: '1 / -1', fontSize: 'var(--fs-sm)' }}>
    <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>Scrie 2–3 cuvinte, de exemplu „12000 BTU, montaj”, apoi generează textul structurat. AI-ul primește doar denumirea, tipul și specificațiile prin integrarea Anthropic existentă.</p>
    <button type="button" className="btn btn-sm" disabled={busy || disabled || !product.trim() || !keywords.trim()} onClick={()=>void generate()}>{busy ? 'Se redactează specificațiile…' : 'Generează specificații cu AI'}</button>
    {error && <p role="alert" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}
    {proposal && <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
      <label style={{ display: 'block', fontWeight: 650 }}>Text structurat propus — verifică și editează
        <textarea rows={8} value={proposal.text} disabled={disabled} onChange={e=>setProposal({...proposal,text:e.target.value})} style={{ display: 'block', width: '100%', marginTop: 8, padding: 10, background: 'var(--surface-sunken)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontFamily: 'inherit', resize: 'vertical' }}/>
      </label>
      <p style={{ color: 'var(--text-secondary)', margin: '8px 0' }}>{proposal.reason} Confirmă valorile marcate [de confirmat] înainte de generarea documentului final.</p>
      {changed && <p role="status" style={{ color: 'var(--warning)', marginBottom: 8 }}>Datele de pornire s-au schimbat. Generează din nou pentru a nu înlocui completările noi.</p>}
      <button type="button" className="btn btn-sm btn-primary" disabled={disabled || changed || !proposal.text.trim()} onClick={()=>{if(!changed){onApply(proposal.text.trim());setProposal(null)}}}>Aplică textul în specificații</button>
      <button type="button" className="btn btn-sm" disabled={disabled} style={{ marginLeft: 8 }} onClick={()=>setProposal(null)}>Renunță la propunere</button>
    </div>}
  </div>
}
