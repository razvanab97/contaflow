'use client'
import { useEffect, useRef, useState } from 'react'
import type { Draft, FormKind } from '@/lib/proiect-workflow'
import type { PurchaseAiSuggestion } from '@/lib/achizitii-ai-suggestions'

export default function PurchaseAiRecommendations({ firmaId, scope, kind, draft, onApply }: { firmaId: string; scope: string; kind: FormKind; draft: Draft; onApply: (draft: Draft) => void }) {
  const [suggestions, setSuggestions] = useState<PurchaseAiSuggestion[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [products, setProducts] = useState<string[]>([])
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  async function recommend() {
    setBusy(true); setError(''); setDone(false); setSuggestions([])
    setProducts(draft.lines.map(line => line.product))
    const request = new AbortController(); controller.current = request
    try {
      const response = await fetch('/api/achizitii/recomandari-formular', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: request.signal, body: JSON.stringify({ firmaId, scope, kind, conditionsEmpty: !draft.fields.conditii?.trim(), lines: draft.lines.map(line => ({ product: line.product, specs: line.specs })) }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Recomandările AI nu au putut fi generate.')
      setSuggestions(data.suggestions); setDone(true)
    } catch (error) { if (!request.signal.aborted) setError(error instanceof Error ? error.message : 'Eroare AI.') }
    finally { if (!request.signal.aborted) setBusy(false) }
  }
  function empty(item: PurchaseAiSuggestion) { return item.field === 'conditii' ? !draft.fields.conditii?.trim() : !!draft.lines[item.line!] && draft.lines[item.line!].product === products[item.line!] && !draft.lines[item.line!].specs.trim() }
  function apply(item: PurchaseAiSuggestion) {
    if (!empty(item)) return
    onApply(item.field === 'conditii' ? { ...draft, fields: { ...draft.fields, conditii: item.value } } : { ...draft, lines: draft.lines.map((line, index) => index === item.line ? { ...line, specs: item.value } : line) })
  }
  return <section style={{ marginTop: 16, padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
    <h4 style={{ fontWeight: 650 }}>Recomandări AI pentru câmpurile necompletate</h4>
    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: '8px 0' }}>AI-ul propune specificații și condiții, nu date confirmate. Verifică textele înainte de aplicare. La cerere, denumirea achiziției și produsele/specificațiile sunt trimise integrării Anthropic existente; fără datele beneficiarului, furnizorului sau prețuri. PDF-urile nu sunt analizate aici.</p>
    <button type="button" className="btn" disabled={busy} onClick={()=>void recommend()}>{busy ? 'AI-ul pregătește recomandările…' : 'Recomandă cu AI'}</button>
    {error && <p role="alert" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}
    {done && !suggestions.length && <p role="status" style={{ marginTop: 8 }}>Nu sunt recomandări pentru câmpurile goale din contextul disponibil. Completează produsul sau consultă documentele reale.</p>}
    {suggestions.map((item, index) => <div key={index} style={{ marginTop: 12, padding: 12, background: 'var(--surface-sunken)', borderRadius: 'var(--r-md)' }}>
      <strong>{item.field === 'conditii' ? 'Condiții cerere de ofertă' : `Specificații — poziția ${item.line! + 1}: ${products[item.line!] || ''}`} · propunere AI</strong>
      <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0' }}>{item.value}</p><p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>{item.reason}</p>
      <button type="button" className="btn" disabled={!empty(item)} style={{ marginTop: 8 }} onClick={()=>apply(item)}>{empty(item) ? 'Aplică în câmpul gol' : 'Câmp completat sau produs modificat — nu suprascriem'}</button>
    </div>)}
  </section>
}
