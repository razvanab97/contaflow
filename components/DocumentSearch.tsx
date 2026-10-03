'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Icon from './ui/Icon'

interface Rezultat {
  id: string; fisierNume: string; furnizor: string|null; numarDocument: string|null
  suma: number|null; locatie: string|null; utilitate: string|null; dataDocument: string|null
  sectiune: string; luna: string|null; downloadUrl: string
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

// Cautare globala de documente ale firmei active, in header. Desktop: camp permanent cu
// scurtatura ⌘K / Ctrl+K (sau "/"). Mobil: iconita care deschide campul pe toata latimea
// header-ului. Navigare din tastatura prin rezultate (↑/↓/Enter).
export default function DocumentSearch({ firmaId, culoare = 'var(--c-888888)' }: { firmaId: string; culoare?: string }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Rezultat[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [isMac, setIsMac] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>|null>(null)
  const abortRef = useRef<AbortController|null>(null)

  // Anuleaza cererea anterioara la fiecare litera noua tastata - fara asta, un raspuns mai vechi
  // (pentru un termen mai scurt) poate sosi dupa unul mai nou si suprascrie rezultatele corecte.
  const search = useCallback(async (term: string) => {
    if (term.trim().length < 2) { setResults([]); setLoading(false); return }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch(`/api/documente/cautare?firmaId=${encodeURIComponent(firmaId)}&q=${encodeURIComponent(term)}`, { signal: controller.signal })
      const data = await res.json().catch(() => [])
      setResults(Array.isArray(data) ? data : [])
      setActiveIdx(-1)
      setLoading(false)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setLoading(false)
    }
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
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent))
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) { setOpen(false); setMobileOpen(false) }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); setMobileOpen(false); inputRef.current?.blur(); return }
      const target = e.target as HTMLElement
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable || target.tagName === 'SELECT')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setMobileOpen(true)
        requestAnimationFrame(() => inputRef.current?.focus())
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClickOutside); document.removeEventListener('keydown', onKey) }
  }, [])

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(results.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); window.location.href = results[activeIdx].downloadUrl; setOpen(false) }
  }

  return (
    <div ref={containerRef} className={`doc-search${mobileOpen ? ' is-mobile-open' : ''}`}>
      <button type="button" className="doc-search-trigger btn btn-ghost btn-icon" aria-label="Caută documente"
        onClick={() => { setMobileOpen(true); requestAnimationFrame(() => inputRef.current?.focus()) }}>
        <Icon name="search" />
      </button>

      <div className="doc-search-field">
        <span className="doc-search-icon"><Icon name="search" size={15} /></span>
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => q.trim().length >= 2 && setOpen(true)}
          onKeyDown={onInputKey}
          placeholder="Caută documente, furnizori, sume…"
          aria-label="Caută documente"
          role="combobox"
          aria-expanded={open}
          aria-controls="doc-search-results"
        />
        {q ? (
          <button type="button" className="doc-search-clear" aria-label="Golește căutarea" onClick={() => { setQ(''); inputRef.current?.focus() }}>
            <Icon name="close" size={13} />
          </button>
        ) : (
          <span className="kbd doc-search-kbd">{isMac ? '⌘K' : 'Ctrl K'}</span>
        )}
        <button type="button" className="doc-search-cancel" onClick={() => { setMobileOpen(false); setOpen(false) }}>Anulează</button>
      </div>

      {open && (
        <div id="doc-search-results" role="listbox" className="menu popover-in doc-search-results">
          {loading ? (
            <div style={{ padding: '16px', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', textAlign: 'center' }}>Se caută…</div>
          ) : results.length === 0 ? (
            <div style={{ padding: '16px', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', textAlign: 'center' }}>Niciun document găsit pentru „{q.trim()}”.</div>
          ) : (
            <>
              <div className="eyebrow" style={{ padding: '6px 10px 4px' }}>{results.length} {results.length === 1 ? 'rezultat' : 'rezultate'}</div>
              {results.map((r, i) => (
                <a
                  key={r.id}
                  href={r.downloadUrl}
                  role="option"
                  aria-selected={i === activeIdx}
                  onClick={() => setOpen(false)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`menu-item${i === activeIdx ? ' is-hover' : ''}`}
                  style={{ display: 'block', background: i === activeIdx ? 'var(--hover)' : undefined }}
                >
                  <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.furnizor || r.fisierNume}
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ color: culoare, fontWeight: 600 }}>{r.sectiune}</span>
                    {r.luna && <span>· {fmtLuna(r.luna)}</span>}
                    {r.dataDocument && <span>· {fmtData(r.dataDocument)}</span>}
                    {r.numarDocument && <span>· nr. {r.numarDocument}</span>}
                    {r.suma != null && <span>· {Number(r.suma).toFixed(2)} RON</span>}
                    {r.locatie && <span>· ap. {r.locatie}</span>}
                  </div>
                </a>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
