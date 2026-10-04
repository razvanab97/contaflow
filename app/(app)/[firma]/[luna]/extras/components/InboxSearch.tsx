'use client'
import { useRef, useState } from 'react'
import type { InboxCandidat, SursaInbox, Tx } from './types'
import { SURSA_LABEL } from './types'
import VeziButon from '@/components/ui/VeziButon'

const INP: React.CSSProperties = { fontSize:'var(--fs-sm)', background:'var(--surface-secondary)', border:'1px solid var(--border)', borderRadius:'var(--r-md)', padding:'8px 12px', color:'var(--text-primary)', outline:'none', width:'100%' }

// Asocierea depinde de unde vine documentul: documente (Inbox + module), bonuri, facturi de asociat.
const ASSOC_ENDPOINT: Record<InboxCandidat['tabel'], { url: string; idKey: string }> = {
  documente: { url: '/api/inbox-facturi/asociaza', idKey: 'facturaId' },
  bonuri: { url: '/api/bonuri/asociaza', idKey: 'bonId' },
  facturi_asteptate: { url: '/api/facturi-asteptate/asociaza', idKey: 'facturaId' },
}
const SURSE: ('toate'|SursaInbox)[] = ['toate', 'local', 'gmail', 'oblio', 'module', 'deasociat', 'bonuri', 'altele']
const zi = (d: string | null | undefined) => d ? d.slice(0, 10).split('-').reverse().join('.') : ''

export default function InboxSearch({ tx, firmaId, onAssociated }: { tx: Tx; firmaId: string; onAssociated: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [candidati, setCandidati] = useState<InboxCandidat[]>([])
  const [counts, setCounts] = useState<Record<SursaInbox, number>>({ local:0, gmail:0, oblio:0, bonuri:0, altele:0, module:0, deasociat:0 })
  const [assocId, setAssocId] = useState('')
  const [eroare, setEroare] = useState('')
  const [sursaFiltru, setSursaFiltru] = useState<'toate'|SursaInbox>('toate')
  const [query, setQuery] = useState('')
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Anuleaza cererea anterioara la fiecare cautare noua - fara asta, un raspuns mai vechi (pt. un
  // termen scris mai devreme) poate sosi dupa unul mai nou si suprascrie rezultatele corecte.
  async function search(sursa = sursaFiltru, q = query) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    const params = new URLSearchParams({ firmaId, suma: String(tx.suma), valutaTx: tx.valuta || 'RON' })
    if (sursa !== 'toate') params.set('sursa', sursa)
    if (q.trim()) params.set('q', q.trim())
    try {
      const res = await fetch(`/api/inbox-facturi/cauta?${params.toString()}`, { signal: controller.signal })
      const data = await res.json().catch(() => ({}))
      setCandidati(res.ok ? (data.candidates || []) : [])
      if (res.ok && data.counts) setCounts(data.counts)
      setBusy(false); setDone(true)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') { setBusy(false); setDone(true) }
    }
  }

  function openAndSearch() {
    setOpen(true)
    if (!done) search()
  }

  function setSursa(s: typeof sursaFiltru) {
    setSursaFiltru(s)
    search(s, query)
  }

  // Doar textul se actualizeaza sincron la fiecare litera - cautarea propriu-zisa e debounce-uita,
  // iar campul de input ramane mereu montat (vezi randarea de mai jos) ca sa nu piarda focusul in
  // timp ce se cauta, altfel utilizatorul e nevoit sa dea click din nou intre litere.
  function setQ(q: string) {
    setQuery(q)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => search(sursaFiltru, q), 300)
  }

  async function associate(c: InboxCandidat) {
    setAssocId(c.id); setEroare('')
    const { url, idKey } = ASSOC_ENDPOINT[c.tabel || 'documente']
    const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ [idKey]: c.id, tranzactieId: tx.id }) }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    setAssocId('')
    if (!res?.ok) { setEroare(d.error || 'Asocierea a eșuat'); return }
    onAssociated()
  }

  if (!open) {
    return (
      <button onClick={openAndSearch} style={{ fontSize:'var(--fs-sm)', fontWeight:600, color:'var(--text-secondary)', background:'transparent', border:'1px solid var(--border)', borderRadius:'var(--r-md)', padding:'8px 12px', cursor:'pointer', width:'100%', textAlign:'center' }}>
        🔍 Caută în Inbox Facturi și Bonuri
      </button>
    )
  }

  return (
    <div style={{ padding:'12px', background:'var(--surface-secondary)', border:'1px solid var(--border)', borderRadius:'var(--r-md)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
        <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--text-secondary)' }}>Inbox Facturi &amp; Bonuri</span>
        <button onClick={() => setOpen(false)} style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)', background:'transparent', border:'none', cursor:'pointer' }}>Ascunde</button>
      </div>

      <div style={{ display:'flex', gap:'5px', flexWrap:'wrap', marginBottom:'8px' }}>
        {SURSE.map(s => {
          const n = s === 'toate' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[s] || 0
          if (s !== 'toate' && !n && sursaFiltru !== s) return null
          return (
            <button key={s} onClick={() => setSursa(s)} style={{ fontSize:'var(--fs-xs)', fontWeight:700, padding:'4px 9px', borderRadius:'var(--r-full)', border:`1px solid ${sursaFiltru===s?'var(--purple)':'var(--border)'}`, background:sursaFiltru===s?'var(--purple-soft)':'transparent', color:sursaFiltru===s?'var(--purple)':'var(--text-secondary)', cursor:'pointer' }}>
              {SURSA_LABEL[s]} ({n})
            </button>
          )
        })}
      </div>

      <input value={query} onChange={e => setQ(e.target.value)} placeholder="Caută după furnizor/firmă, sumă (ex. 714), număr document sau dată (15.09.2026)…" style={{ ...INP, marginBottom:'8px' }} />
      <p style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)', margin:'-2px 0 8px' }}>
        {query.trim().length >= 2 ? 'Caut în toate documentele firmei (Inbox, module, facturi de asociat, bonuri), inclusiv cele deja asociate.' : `Documente încă neasociate, cele mai apropiate de ${Math.abs(tx.suma ?? 0).toFixed(2)} ${tx.valuta} primele.`}
      </p>
      {eroare && <p role="alert" style={{ fontSize:'var(--fs-xs)', color:'var(--danger)', margin:'0 0 8px' }}>{eroare}</p>}

      {busy && !done ? (
        <p style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)' }}>Caut...</p>
      ) : candidati.length === 0 ? (
        <p style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)' }}>{busy ? 'Caut...' : 'Niciun document nu corespunde căutării. Încearcă furnizorul, suma sau numărul documentului.'}</p>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'6px', maxHeight:'360px', overflowY:'auto' }}>
          {candidati.map(c => (
            <div key={`${c.tabel}-${c.id}`} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-md)', opacity: c.deja ? .7 : 1 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:'8px' }}>
                  <span style={{ flex:1, minWidth:0, fontSize:'var(--fs-sm)', fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={c.fisier_nume}>{c.furnizor || c.fisier_nume}</span>
                  <span style={{ fontSize:'var(--fs-sm)', fontWeight:700, color:'var(--text-primary)', whiteSpace:'nowrap' }}>{c.suma != null ? `${c.suma.toFixed(2)} ${c.valuta}` : '—'}</span>
                </div>
                <div style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)', marginTop:'2px' }}>
                  <span style={{ padding:'1px 6px', borderRadius:'var(--r-full)', background:'var(--surface-secondary)', marginRight:'6px' }}>{c.sectiune || SURSA_LABEL[c.sursa]}</span>
                  {[c.numar_document ? `nr. ${c.numar_document}` : '', zi(c.data_document)].filter(Boolean).join(' · ')}
                  {c.suma == null && ' · sumă necunoscută'}
                  {c.monedaDiferita
                    ? c.suma_ron != null && c.curs_bnr != null
                      ? ` · ≈ ${c.suma_ron.toFixed(2)} lei la cursul BNR ${c.curs_bnr.toFixed(4)}${c.diferentaSuma !== null ? ` (diferență ${c.diferentaSuma.toFixed(2)} lei față de plată)` : ''}`
                      : ` · monedă diferită de tranzacție (${tx.valuta}) - verifică manual`
                    : c.diferentaSuma !== null && c.diferentaSuma > 0.01 ? ` · diferență ${c.diferentaSuma.toFixed(2)} ${c.valuta}` : c.diferentaSuma !== null ? ' · ✓ aceeași sumă' : ''}
                </div>
                {c.deja && <div style={{ fontSize:'var(--fs-xs)', color:'var(--warning)', marginTop:'2px' }}>asociat deja{c.deja.data ? ` cu ${c.deja.suma != null ? `${Math.abs(c.deja.suma).toFixed(2)} ${c.deja.valuta || ''} ` : ''}din ${zi(c.deja.data)}` : ' altei tranzacții'}</div>}
              </div>
              {c.docUrl && <VeziButon url={c.docUrl} nume={c.fisier_nume} />}
              <button onClick={() => associate(c)} disabled={!!assocId || !!c.deja} title={c.deja ? 'Documentul e deja asociat altei tranzacții' : undefined} style={{ fontSize:'var(--fs-xs)', fontWeight:600, padding:'6px 12px', borderRadius:'var(--r-sm)', border:'none', background: c.deja ? 'var(--surface-secondary)' : 'var(--accent-solid)', color: c.deja ? 'var(--text-muted)' : '#fff', cursor: c.deja ? 'not-allowed' : assocId ? 'wait' : 'pointer', opacity: assocId && assocId!==c.id ? .5 : 1, whiteSpace:'nowrap' }}>
                {assocId===c.id ? '...' : c.deja ? 'Asociat' : 'Asociază'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
