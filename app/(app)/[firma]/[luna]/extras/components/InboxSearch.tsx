'use client'
import { useRef, useState } from 'react'
import type { InboxCandidat, Tx } from './types'
import { SURSA_LABEL } from './types'

const INP: React.CSSProperties = { fontSize:'12px', background:'var(--surface-secondary)', border:'1px solid var(--border)', borderRadius:'8px', padding:'8px 12px', color:'var(--text-primary)', outline:'none', width:'100%' }

export default function InboxSearch({ tx, firmaId, onAssociated }: { tx: Tx; firmaId: string; onAssociated: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [candidati, setCandidati] = useState<InboxCandidat[]>([])
  const [counts, setCounts] = useState<Record<'local'|'gmail'|'oblio'|'altele', number>>({ local:0, gmail:0, oblio:0, altele:0 })
  const [assocId, setAssocId] = useState('')
  const [sursaFiltru, setSursaFiltru] = useState<'toate'|'local'|'gmail'|'oblio'|'altele'>('toate')
  const [query, setQuery] = useState('')
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function search(sursa = sursaFiltru, q = query) {
    setBusy(true); setDone(false)
    const params = new URLSearchParams({ firmaId, suma: String(tx.suma), valutaTx: tx.valuta || 'RON' })
    if (sursa !== 'toate') params.set('sursa', sursa)
    if (q.trim()) params.set('q', q.trim())
    const res = await fetch(`/api/inbox-facturi/cauta?${params.toString()}`)
    const data = await res.json().catch(() => ({}))
    setCandidati(res.ok ? (data.candidates || []) : [])
    if (res.ok && data.counts) setCounts(data.counts)
    setBusy(false); setDone(true)
  }

  function openAndSearch() {
    setOpen(true)
    if (!done) search()
  }

  function setSursa(s: typeof sursaFiltru) {
    setSursaFiltru(s)
    search(s, query)
  }

  function setQ(q: string) {
    setQuery(q)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => search(sursaFiltru, q), 300)
  }

  async function associate(id: string) {
    setAssocId(id)
    await fetch('/api/inbox-facturi/asociaza', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ facturaId:id, tranzactieId:tx.id }) })
    setAssocId('')
    onAssociated()
  }

  if (!open) {
    return (
      <button onClick={openAndSearch} style={{ fontSize:'12px', fontWeight:600, color:'var(--text-secondary)', background:'transparent', border:'1px solid var(--border)', borderRadius:'8px', padding:'8px 12px', cursor:'pointer', width:'100%', textAlign:'center' }}>
        🔍 Caută în Inbox Facturi
      </button>
    )
  }

  return (
    <div style={{ padding:'12px', background:'var(--surface-secondary)', border:'1px solid var(--border)', borderRadius:'10px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
        <span style={{ fontSize:'11px', fontWeight:700, color:'var(--text-secondary)' }}>Inbox Facturi</span>
        <button onClick={() => setOpen(false)} style={{ fontSize:'11px', color:'var(--text-muted)', background:'transparent', border:'none', cursor:'pointer' }}>Ascunde</button>
      </div>
      {busy && !done ? (
        <p style={{ fontSize:'11px', color:'var(--text-muted)' }}>Caut...</p>
      ) : (
        <>
          <div style={{ display:'flex', gap:'5px', flexWrap:'wrap', marginBottom:'8px' }}>
            {(['toate','local','gmail','oblio','altele'] as const).map(s => {
              const n = s === 'toate' ? counts.local + counts.gmail + counts.oblio + counts.altele : counts[s]
              return (
                <button key={s} onClick={() => setSursa(s)} style={{ fontSize:'10.5px', fontWeight:700, padding:'4px 9px', borderRadius:'999px', border:`1px solid ${sursaFiltru===s?'var(--purple)':'var(--border)'}`, background:sursaFiltru===s?'var(--purple-soft)':'transparent', color:sursaFiltru===s?'var(--purple)':'var(--text-secondary)', cursor:'pointer' }}>
                  {SURSA_LABEL[s]} ({n})
                </button>
              )
            })}
          </div>
          <input value={query} onChange={e => setQ(e.target.value)} placeholder="Caută după furnizor sau număr document..." style={{ ...INP, marginBottom:'8px' }} />
          {candidati.length === 0 ? (
            <p style={{ fontSize:'11px', color:'var(--text-muted)' }}>Nicio factură nealocată nu corespunde filtrelor alese.</p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'6px', maxHeight:'280px', overflowY:'auto' }}>
              {candidati.map(c => (
                <div key={c.id} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'8px' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'11px', color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.furnizor || c.fisier_nume}</div>
                    <div style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'2px' }}>
                      <span style={{ padding:'1px 6px', borderRadius:'20px', background:'var(--surface-secondary)', marginRight:'6px' }}>{SURSA_LABEL[c.sursa]}</span>
                      {c.suma != null ? `${c.suma.toFixed(2)} ${c.valuta}` : 'sumă necunoscută'}
                      {c.monedaDiferita ? ` · monedă diferită de tranzacție (${tx.valuta}) - verifică manual` : c.diferentaSuma !== null && c.diferentaSuma > 0.01 ? ` · diferență ${c.diferentaSuma.toFixed(2)} ${c.valuta}` : ''}
                    </div>
                  </div>
                  <button onClick={() => associate(c.id)} disabled={!!assocId} style={{ fontSize:'11px', fontWeight:600, padding:'6px 12px', borderRadius:'7px', border:'none', background:'var(--success)', color:'var(--c-0a0a0a)', cursor: assocId ? 'wait' : 'pointer', opacity: assocId && assocId!==c.id ? .5 : 1, whiteSpace:'nowrap' }}>
                    {assocId===c.id ? '...' : 'Asociază'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
