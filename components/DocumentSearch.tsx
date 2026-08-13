'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

interface Rezultat {
  id: string; fisierNume: string; furnizor: string|null; numarDocument: string|null
  suma: number|null; locatie: string|null; utilitate: string|null; dataDocument: string|null
  sectiune: string; luna: string|null
}

const LUNI = ['','Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec']
function fmtLuna(s: string|null) {
  if (!s) return ''
  const [y, m] = s.split('-')
  return `${LUNI[+m]} ${y}`
}
function fmtData(s: string|null) {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  return y && m && d ? `${d}.${m}.${y}` : s
}

export default function DocumentSearch({ firmaId, culoare = '#888' }: { firmaId: string; culoare?: string }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Rezultat[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>|null>(null)

  const search = useCallback(async (term: string) => {
    if (term.trim().length < 2) { setResults([]); setLoading(false); return }
    const res = await fetch(`/api/documente/cautare?firmaId=${encodeURIComponent(firmaId)}&q=${encodeURIComponent(term)}`)
    const data = await res.json().catch(() => [])
    setResults(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [firmaId])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.trim().length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    setOpen(true)
    debounceRef.current = setTimeout(() => search(q), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [q, search])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onEscape(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEscape)
    return () => { document.removeEventListener('mousedown', onClickOutside); document.removeEventListener('keydown', onEscape) }
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative', padding: '0 18px 10px' }}>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => q.trim().length >= 2 && setOpen(true)}
        placeholder="Caută documente..."
        style={{ width: '100%', fontSize: '12px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #242424', background: '#111', color: '#DDD', outline: 'none' }}
      />
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: '18px', right: '18px', marginTop: '6px', maxHeight: '360px', overflowY: 'auto', background: '#161616', border: '1px solid #2A2A2A', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.4)', zIndex: 200 }}>
          {loading ? (
            <div style={{ padding: '14px', fontSize: '12px', color: '#666', textAlign: 'center' }}>Se caută...</div>
          ) : results.length === 0 ? (
            <div style={{ padding: '14px', fontSize: '12px', color: '#666', textAlign: 'center' }}>Niciun document găsit.</div>
          ) : (
            results.map(r => (
              <a
                key={r.id}
                href={`/api/chitante/document?id=${encodeURIComponent(r.id)}`}
                onClick={() => setOpen(false)}
                style={{ display: 'block', padding: '9px 12px', borderBottom: '1px solid #1E1E1E', textDecoration: 'none' }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#DDD', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.furnizor || r.fisierNume}
                </div>
                <div style={{ fontSize: '10px', color: '#777', marginTop: '2px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ color: culoare, fontWeight: 600 }}>{r.sectiune}</span>
                  {r.luna && <span>· {fmtLuna(r.luna)}</span>}
                  {r.dataDocument && <span>· {fmtData(r.dataDocument)}</span>}
                  {r.suma != null && <span>· {Number(r.suma).toFixed(2)} RON</span>}
                  {r.locatie && <span>· ap. {r.locatie}</span>}
                </div>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  )
}
