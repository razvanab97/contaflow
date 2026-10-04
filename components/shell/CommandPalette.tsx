'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { FirmaNav } from '@/components/Sidebar'
import Icon, { MODULE_ICONS } from '@/components/ui/Icon'
import { getFirmaModules, esteLunaCalendaristica } from '@/lib/firma-config'
import { etichetaLunaScurta } from '@/lib/accounting-period'
import { deschideDocument } from '@/lib/vizualizare'

interface Rezultat {
  id: string; fisierNume: string; furnizor: string | null; numarDocument: string | null
  suma: number | null; locatie: string | null; dataDocument: string | null
  sectiune: string; luna: string | null; downloadUrl: string
  firmaId: string | null; tip: 'document' | 'model' | 'factura' | 'bon' | 'tranzactie' | 'rezervare' | 'factura_client' | 'comision' | 'mail'; valuta?: string | null; modul?: string | null
}

interface Cmd {
  id: string
  group: string
  title: string
  sub?: string
  icon: string
  dot?: string
  keywords?: string
  meta?: React.ReactNode
  run: (opts: { newTab: boolean }) => void
}

const RECENT_KEY = 'cf-palette-recent'
const LUNI = ['', 'Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function norm(s: string) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }
function shift(luna: string, d: number) { const [y, m] = luna.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1 + d, 1)); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}` }
function fmtData(s: string | null) { if (!s) return ''; const [y, m, d] = s.split('-'); return y && m && d ? `${d}.${m}.${y}` : s }
// Grupurile rezultatelor din cautare, in ordinea afisarii.
const GRUP_ORDINE = ['Rezervări', 'Facturi client & comision', 'Documente', 'Tranzacții bancare', 'Mail contabil']
function grupRezultat(tip: string) {
  return tip === 'tranzactie' ? 'Tranzacții bancare' : tip === 'rezervare' ? 'Rezervări' : tip === 'factura_client' || tip === 'comision' ? 'Facturi client & comision' : tip === 'mail' ? 'Mail contabil' : 'Documente'
}
function fmtLuna(s: string | null) { if (!s) return ''; const [y, m] = s.split('-'); return `${LUNI[+m]} ${y}` }
function fmtSuma(v: number | null, valuta?: string | null) {
  if (v == null || Number.isNaN(v)) return ''
  return `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} ${valuta || 'RON'}`
}

// Evidentiaza in text bucatile care se potrivesc cu termenii cautati (fara diacritice).
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length || !text) return <>{text}</>
  const n = norm(text)
  const marks: [number, number][] = []
  for (const t of terms) {
    if (!t) continue
    let i = n.indexOf(t)
    while (i >= 0) { marks.push([i, i + t.length]); i = n.indexOf(t, i + t.length) }
  }
  if (!marks.length) return <>{text}</>
  marks.sort((a, b) => a[0] - b[0])
  const out: React.ReactNode[] = []
  let pos = 0
  marks.forEach(([a, b], k) => {
    if (a < pos) return
    if (a > pos) out.push(text.slice(pos, a))
    out.push(<mark key={k} className="hl">{text.slice(a, b)}</mark>)
    pos = b
  })
  out.push(text.slice(pos))
  return <>{out}</>
}

// Paleta de comenzi ⌘K - motorul de cautare global al aplicatiei: navigare la orice firma /
// modul / pagina, actiuni rapide (luna, export, tema) si cautare de documente + tranzactii in
// TOATE firmele (sau doar in firma curenta - Tab comuta). Complet din tastatura.
export default function CommandPalette({ open, onClose, firme, firmaAtiva, luna, lunaInPath }: {
  open: boolean; onClose: () => void
  firme: FirmaNav[]; firmaAtiva?: FirmaNav; luna: string; lunaInPath: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<'all' | 'firma'>('all')
  const [docs, setDocs] = useState<Rezultat[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [active, setActive] = useState(0)
  const [recent, setRecent] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const firmaById = useMemo(() => new Map(firme.map(f => [f.id, f])), [firme])

  useEffect(() => {
    if (!open) return
    setQ(''); setDocs([]); setError(''); setActive(0)
    setScope('all')
    try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')) } catch { setRecent([]) }
    requestAnimationFrame(() => inputRef.current?.focus())
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  function remember(term: string) {
    const t = term.trim()
    if (t.length < 2) return
    const next = [t, ...recent.filter(r => r.toLowerCase() !== t.toLowerCase())].slice(0, 6)
    setRecent(next)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch {}
  }

  const go = useCallback((href: string, newTab = false) => {
    onClose()
    if (newTab) window.open(href, '_blank', 'noopener')
    else router.push(href)
  }, [onClose, router])

  // ── Comenzi statice (navigare + actiuni) ───────────────────────────────────
  const commands = useMemo<Cmd[]>(() => {
    const list: Cmd[] = []
    list.push({ id: 'nav-dashboard', group: 'Navigare', title: 'Dashboard', sub: 'Toate firmele', icon: 'dashboard', keywords: 'acasa home start', run: ({ newTab }) => go('/dashboard', newTab) })
    for (const f of firme) {
      const nume = f.nume.replace(' SRL', '')
      list.push({ id: `hub-${f.slug}`, group: 'Firme', title: nume, sub: `Rezumatul lunii · ${etichetaLunaScurta(luna, esteLunaCalendaristica(f.slug))}`, icon: 'calendar', dot: f.culoare, meta: `${f.pct}%`, keywords: 'firma rezumat luna hub', run: ({ newTab }) => go(`/${f.slug}/${luna}`, newTab) })
      for (const m of getFirmaModules(f.slug)) {
        list.push({ id: `mod-${f.slug}-${m.slug}`, group: 'Module', title: m.label, sub: `${nume} · ${m.description}`, icon: MODULE_ICONS[m.slug] || 'fileText', dot: f.culoare, keywords: `${nume} modul`, run: ({ newTab }) => go(`/${f.slug}/${luna}/${m.linkDirect || m.slug}`, newTab) })
      }
      for (const [sub, label, icon] of [['furnizori', 'Furnizori', 'users'], ['date-personale', 'Date personale', 'idCard'], ['model-documente', 'Model documente', 'fileText'], ['facturi-de-asociat', 'Facturi de asociat', 'link']] as const) {
        list.push({ id: `pg-${f.slug}-${sub}`, group: 'Pagini firmă', title: label, sub: nume, icon, dot: f.culoare, keywords: `${nume} pagina`, run: ({ newTab }) => go(`/${f.slug}/${sub}`, newTab) })
      }
    }
    if (firmaAtiva) {
      const parts = pathname.split('/').filter(Boolean)
      const rest = lunaInPath ? parts.slice(2).join('/') : ''
      const base = `/${firmaAtiva.slug}`
      list.push({ id: 'act-prev', group: 'Acțiuni', title: 'Luna anterioară', sub: etichetaLunaScurta(shift(luna, -1), esteLunaCalendaristica(firmaAtiva.slug)), icon: 'chevronLeft', keywords: 'luna inapoi precedenta', run: () => go(`${base}/${shift(luna, -1)}${rest ? '/' + rest : ''}`) })
      list.push({ id: 'act-next', group: 'Acțiuni', title: 'Luna următoare', sub: etichetaLunaScurta(shift(luna, 1), esteLunaCalendaristica(firmaAtiva.slug)), icon: 'chevronRight', keywords: 'luna inainte urmatoare', run: () => go(`${base}/${shift(luna, 1)}${rest ? '/' + rest : ''}`) })
      const onHub = lunaInPath && parts.length === 2
      if (onHub) {
        list.push({ id: 'act-pdf', group: 'Acțiuni', title: 'Exportă PDF cu toate documentele lunii', sub: firmaAtiva.nume, icon: 'download', keywords: 'export descarca pdf toate', run: () => { onClose(); window.dispatchEvent(new CustomEvent('cf:export', { detail: 'pdf' })) } })
        list.push({ id: 'act-zip', group: 'Acțiuni', title: 'Exportă ZIP pe categorii', sub: firmaAtiva.nume, icon: 'download', keywords: 'export descarca zip arhiva', run: () => { onClose(); window.dispatchEvent(new CustomEvent('cf:export', { detail: 'zip' })) } })
      }
    }
    for (const [key, label, icon] of [['light', 'Temă: Deschis', 'sun'], ['dark', 'Temă: Întunecat', 'moon'], ['glass', 'Temă: Glass', 'glass'], ['system', 'Temă: Sistem', 'monitor']] as const) {
      list.push({ id: `theme-${key}`, group: 'Acțiuni', title: label, icon, keywords: 'tema aspect culori dark light mod', run: () => { window.dispatchEvent(new CustomEvent('cf:theme', { detail: key })); onClose() } })
    }
    return list
  }, [firme, firmaAtiva, luna, lunaInPath, pathname, go, onClose])

  const terms = useMemo(() => norm(q).split(/\s+/).filter(Boolean), [q])

  const matchedCommands = useMemo(() => {
    if (!terms.length) {
      // Fara text: ce e relevant acum - modulele firmei active + firmele + actiunile.
      const activeMods = firmaAtiva ? commands.filter(c => c.id.startsWith(`mod-${firmaAtiva.slug}-`)).map(c => ({ ...c, group: `Module · ${firmaAtiva.nume.replace(' SRL', '')}` })) : []
      return [
        ...commands.filter(c => c.id === 'nav-dashboard' || c.group === 'Firme'),
        ...activeMods,
        ...commands.filter(c => c.group === 'Acțiuni' && !c.id.startsWith('theme-')),
      ]
    }
    const scored: { c: Cmd; s: number }[] = []
    for (const c of commands) {
      const hay = norm(`${c.title} ${c.sub || ''} ${c.keywords || ''}`)
      if (!terms.every(t => hay.includes(t))) continue
      const title = norm(c.title)
      let s = 0
      if (title.startsWith(terms[0])) s += 3
      if (terms.every(t => title.includes(t))) s += 2
      if (firmaAtiva && c.id.includes(`-${firmaAtiva.slug}-`)) s += 1
      if (c.group === 'Firme') s += 1
      scored.push({ c, s })
    }
    return scored.sort((a, b) => b.s - a.s).slice(0, 12).map(x => x.c)
  }, [commands, terms, firmaAtiva])

  // ── Cautare documente/tranzactii (server) ───────────────────────────────────
  useEffect(() => {
    if (!open) return
    const term = q.trim()
    abortRef.current?.abort()
    if (term.length < 2) { setDocs([]); setLoading(false); setError(''); return }
    setLoading(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const t = setTimeout(async () => {
      try {
        const fid = scope === 'firma' && firmaAtiva ? firmaAtiva.id : 'all'
        const res = await fetch(`/api/documente/cautare?firmaId=${encodeURIComponent(fid)}&q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        const data = await res.json().catch(() => [])
        if (!res.ok) { setError(data?.error || 'Căutarea a eșuat'); setDocs([]) }
        else { setError(''); setDocs(Array.isArray(data) ? data : []) }
        setLoading(false)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') { setLoading(false); setError('Căutarea a eșuat') }
      }
    }, 220)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q, scope, open, firmaAtiva])

  // Grupate pe tip - API-ul le intoarce intercalate. Rezultatele aduse prin legatura (documentul unei
  // tranzactii gasite etc.) vin dupa potrivirile directe din grupul lor.
  const docCommands = useMemo<Cmd[]>(() => [...docs].sort((a, b) => GRUP_ORDINE.indexOf(grupRezultat(a.tip)) - GRUP_ORDINE.indexOf(grupRezultat(b.tip)) || Number(a.sectiune.startsWith('legat')) - Number(b.sectiune.startsWith('legat'))).map(r => {
    const f = r.firmaId ? firmaById.get(r.firmaId) : undefined
    const firmaNume = f ? f.nume.replace(' SRL', '') : ''
    const isTx = r.tip === 'tranzactie'
    const faraFisier = !r.downloadUrl && !!r.modul
    const lunaKey = r.luna ? r.luna.slice(0, 7) : null
    const subParts = [r.sectiune, r.luna ? fmtLuna(r.luna) : '', r.dataDocument ? fmtData(r.dataDocument) : '', r.numarDocument ? `nr. ${r.numarDocument}` : '', r.locatie ? `ap. ${r.locatie}` : ''].filter(Boolean)
    return {
      id: `${r.tip}-${r.id}`,
      group: grupRezultat(r.tip),
      title: r.furnizor || r.fisierNume,
      sub: subParts.join(' · '),
      icon: isTx ? 'bank' : r.tip === 'bon' ? 'fuel' : r.tip === 'model' ? 'fileText' : r.tip === 'factura' ? 'link' : r.tip === 'rezervare' ? 'bed' : r.tip === 'mail' ? 'mail' : r.tip === 'factura_client' ? 'star' : 'receipt',
      dot: f?.culoare,
      keywords: firmaNume,
      meta: <><div className="num" style={{ color: isTx ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 600 }}>{fmtSuma(r.suma, r.valuta)}</div>{scope === 'all' && firmaNume && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{firmaNume}</div>}</>,
      run: ({ newTab }) => {
        remember(q)
        if (isTx) {
          if (f && lunaKey) go(`/${f.slug}/${lunaKey}/extras`, newTab)
          return
        }
        // Rezervari, mailuri: se deschide modulul lunii lor (nu au un fisier propriu)
        if (faraFisier) {
          if (f && lunaKey) go(`/${f.slug}/${lunaKey}/${r.modul}`, newTab)
          return
        }
        onClose()
        // Enter -> vizualizatorul pop-up; Cmd/Ctrl+Enter -> descarcare directa (ca inainte)
        if (newTab) window.location.href = r.downloadUrl
        else deschideDocument(r.downloadUrl, r.fisierNume)
      },
    }
  }), [docs, firmaById, scope, go, onClose, q]) // eslint-disable-line react-hooks/exhaustive-deps

  const recentCommands = useMemo<Cmd[]>(() => (!terms.length ? recent.map(r => ({
    id: `recent-${r}`, group: 'Căutări recente', title: r, icon: 'history', run: () => setQ(r),
  })) : []), [recent, terms])

  const items = useMemo(() => {
    const docsFirst = terms.length > 0 && /\d/.test(q)  // sume/date -> documentele sunt mai relevante
    return docsFirst ? [...docCommands, ...matchedCommands] : [...recentCommands, ...matchedCommands, ...docCommands]
  }, [matchedCommands, docCommands, recentCommands, terms, q])

  useEffect(() => { setActive(0) }, [q, scope])
  useEffect(() => { if (active >= items.length) setActive(Math.max(0, items.length - 1)) }, [items.length, active])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (items.length ? (i + 1) % items.length : 0)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (items.length ? (i - 1 + items.length) % items.length : 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const it = items[active]; if (it) { if (terms.length && !it.id.startsWith('recent-')) remember(q); it.run({ newTab: e.metaKey || e.ctrlKey }) } }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'Tab' && firmaAtiva) { e.preventDefault(); setScope(s => (s === 'all' ? 'firma' : 'all')) }
  }

  if (!open) return null

  let lastGroup = ''
  return (
    <>
      <div className="palette-backdrop" onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Căutare și comenzi" onKeyDown={onKey}>
        <div className="palette-input-row">
          <Icon name="search" size={18} style={{ color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Caută documente, sume, furnizori, tranzacții sau sari la un modul…"
            aria-label="Caută"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `pal-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          {loading && <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin .7s linear infinite', flexShrink: 0 }} />}
          {firmaAtiva && (
            <div className="palette-scope" role="group" aria-label="Unde caut documente">
              <button type="button" aria-pressed={scope === 'all'} onClick={() => { setScope('all'); inputRef.current?.focus() }}>Toate firmele</button>
              <button type="button" aria-pressed={scope === 'firma'} onClick={() => { setScope('firma'); inputRef.current?.focus() }}>{firmaAtiva.nume.replace(' SRL', '')}</button>
            </div>
          )}
        </div>

        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {items.length === 0 && !loading && (
            <div className="empty-state" style={{ margin: '8px', border: 'none' }}>
              {terms.length ? <><strong>Niciun rezultat pentru „{q.trim()}”</strong><span style={{ fontSize: 'var(--fs-sm)' }}>Încearcă o sumă (ex. 300 sau 300,01), o dată (15.08.2026), un furnizor sau un număr de factură.</span></> : <span>Începe să tastezi…</span>}
            </div>
          )}
          {error && <div role="alert" style={{ margin: '6px 10px', fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>{error}</div>}
          {items.map((it, idx) => {
            const header = it.group !== lastGroup ? (lastGroup = it.group, (
              <div className="palette-group" key={`g-${it.group}-${idx}`}>
                <span>{it.group}</span>
                {GRUP_ORDINE.includes(it.group) && <span style={{ textTransform: 'none', letterSpacing: 0 }}>{docCommands.filter(d => d.group === it.group).length}</span>}
              </div>
            )) : null
            return (
              <div key={it.id}>
                {header}
                <button
                  type="button"
                  id={`pal-${idx}`}
                  data-idx={idx}
                  role="option"
                  aria-selected={idx === active}
                  className="palette-item"
                  onMouseMove={() => active !== idx && setActive(idx)}
                  onClick={e => { if (terms.length && !it.id.startsWith('recent-')) remember(q); it.run({ newTab: e.metaKey || e.ctrlKey }) }}
                >
                  <span className="palette-item-icon"><Icon name={it.icon} size={15} /></span>
                  <span className="palette-item-main">
                    <span className="palette-item-title" style={{ display: 'block' }}><Highlight text={it.title} terms={terms} /></span>
                    {it.sub && (
                      <span className="palette-item-sub">
                        {it.dot && <span className="dot" style={{ background: it.dot, width: 6, height: 6 }} />}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Highlight text={it.sub} terms={terms} /></span>
                      </span>
                    )}
                  </span>
                  {it.meta && <span className="palette-item-meta">{it.meta}</span>}
                </button>
              </div>
            )
          })}
        </div>

        <div className="palette-foot">
          <span><span className="kbd">↑</span><span className="kbd">↓</span> navighează</span>
          <span><span className="kbd">↵</span> deschide / vezi</span>
          <span><span className="kbd">⌘↵</span> tab nou / descarcă</span>
          {firmaAtiva && <span><span className="kbd">Tab</span> toate firmele / doar firma</span>}
          <span style={{ marginLeft: 'auto' }}><span className="kbd">Esc</span> închide</span>
        </div>
      </div>
    </>
  )
}
