'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import UploadExtras from './UploadExtras'

const SB_URL = 'https://aqlmuoaaipbanjdptleg.supabase.co/rest/v1'
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbG11b2FhaXBiYW5qZHB0bGVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDY2NzE2OCwiZXhwIjoyMDk2MjQzMTY4fQ.VCnFDYSfxcbS9Hb9g12di7npy5plSvHpMrb6E2FEdfU'
const H = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }

const CAT_STYLE: Record<string, { bg: string; c: string }> = {
  client:   { bg: 'rgba(74,222,128,.15)',  c: '#4ADE80' },
  furnizor: { bg: 'rgba(96,165,250,.15)',  c: '#60A5FA' },
  taxa:     { bg: 'rgba(248,113,113,.15)', c: '#F87171' },
  angajat:  { bg: 'rgba(167,139,250,.15)', c: '#A78BFA' },
  transfer: { bg: 'rgba(150,150,150,.15)', c: '#AAA' },
  comision: { bg: 'rgba(251,146,60,.15)',  c: '#FB923C' },
  banca:    { bg: 'rgba(100,100,100,.15)', c: '#888' },
  altele:   { bg: 'rgba(80,80,80,.12)',    c: '#777' },
}

const PER_PAGE = 10

interface Tx {
  id: string
  extras_id: string
  data_tranzactie: string
  descriere: string
  descriere_curatata: string
  tip: 'debit' | 'credit'
  suma: number
  valuta: string
  categorie: string
  document_id: string | null
  note: string | null
  documente: { id: string; tip_document: string; furnizor: string; numar_document: string; fisier_nume: string } | null
}

interface Extras { id: string; valuta: string; nr_tranzactii: number; nr_documentate: number; procesat_ai: boolean; sold_final?: number }
interface Firma { id: string; slug: string; nume: string; culoare: string }

export default function ExtrasClient({ firma, lunaId, luna, lunaLabel, extrase: initialExtrase, slug }: {
  firma: Firma; lunaId: string; luna: string; lunaLabel: string
  extrase: Extras[]; slug: string
}) {
  const [tranzactii, setTranzactii] = useState<Tx[]>([])
  const [extrase, setExtrase] = useState<Extras[]>(initialExtrase)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'lipsa' | 'ok' | 'na'>('all')
  const [page, setPage] = useState(1)
  const c = firma.culoare || '#F27A1A'
  const rgb = `${parseInt(c.slice(1,3),16)},${parseInt(c.slice(3,5),16)},${parseInt(c.slice(5,7),16)}`

  async function loadTranzactii() {
    setLoading(true)
    const currentExtrase = await fetch(
      `${SB_URL}/extrase?luna_id=eq.${lunaId}&select=id,valuta,nr_tranzactii,nr_documentate,procesat_ai,sold_final&order=valuta`,
      { headers: H }
    ).then(r => r.json())
    setExtrase(currentExtrase)

    let all: Tx[] = []
    for (const e of currentExtrase) {
      const txs = await fetch(
        `${SB_URL}/tranzactii?extras_id=eq.${e.id}&select=id,extras_id,data_tranzactie,descriere,descriere_curatata,tip,suma,valuta,categorie,document_id,note,documente(id,tip_document,furnizor,numar_document,fisier_nume)&order=data_tranzactie`,
        { headers: H }
      ).then(r => r.json())
      all = [...all, ...(Array.isArray(txs) ? txs : [])]
    }

    // Sort: nerezolvate primul
    all.sort((a, b) => {
      const aR = !!a.document_id || a.note === 'na'
      const bR = !!b.document_id || b.note === 'na'
      if (aR === bR) return new Date(a.data_tranzactie).getTime() - new Date(b.data_tranzactie).getTime()
      return aR ? 1 : -1
    })
    setTranzactii(all)
    setLoading(false)
  }

  useEffect(() => { loadTranzactii() }, [lunaId])

  const filtered = tranzactii.filter(t =>
    filter === 'lipsa' ? (!t.document_id && t.note !== 'na') :
    filter === 'ok' ? !!t.document_id :
    filter === 'na' ? t.note === 'na' : true
  )
  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const pageItems = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const counts = {
    all: tranzactii.length,
    lipsa: tranzactii.filter(t => !t.document_id && t.note !== 'na').length,
    ok: tranzactii.filter(t => !!t.document_id).length,
    na: tranzactii.filter(t => t.note === 'na').length,
  }
  const rez = counts.ok + counts.na
  const pct = tranzactii.length > 0 ? Math.round((rez / tranzactii.length) * 100) : 0

  function changeFilter(f: typeof filter) { setFilter(f); setPage(1) }

  async function markNA(id: string) {
    await fetch('/api/tranzactii/note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, note: 'na' }) })
    await loadTranzactii()
  }
  async function clearNA(id: string) {
    await fetch('/api/tranzactii/note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, note: null }) })
    await loadTranzactii()
  }

  const PB = (dis: boolean, active = false) => ({
    fontSize: '12px', fontWeight: 600 as const, padding: '5px 11px', borderRadius: '7px',
    border: `1px solid ${active ? c : '#2A2A2A'}`, background: active ? c : '#1A1A1A',
    color: dis ? '#333' : active ? '#fff' : '#888', cursor: dis ? 'not-allowed' as const : 'pointer' as const, opacity: dis ? .5 : 1,
  })

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0A0A0A' }}>
      {/* Sidebar */}
      <aside style={{ width: '220px', flexShrink: 0, background: '#0D0D0D', borderRight: '1px solid #1E1E1E', display: 'flex', flexDirection: 'column', padding: '20px 0', position: 'sticky', top: 0, height: '100vh' }}>
        <div style={{ padding: '4px 18px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', background: '#FFF', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" fill="none" stroke="#111" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
          </div>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#FFF' }}>ContaFlow</span>
        </div>
        <Link href={`/${slug}/${luna}`} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 18px', fontSize: '13px', color: '#888' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          {firma.nume.replace(' SRL', '')}
        </Link>
        <div style={{ height: '1px', background: '#1E1E1E', margin: '8px 14px' }} />
        <div style={{ padding: '8px 18px 4px', fontSize: '13px', fontWeight: 600, color: '#DDD' }}>Extras de cont</div>
        {extrase.map(e => (
          <div key={e.id} style={{ padding: '3px 18px 3px 28px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: '#777' }}>{e.valuta}</span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#4ADE80' }}>{e.nr_tranzactii} tx</span>
          </div>
        ))}
        {tranzactii.length > 0 && <>
          <div style={{ height: '1px', background: '#1E1E1E', margin: '12px 14px' }} />
          <div style={{ padding: '0 18px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#555', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '.08em' }}>Progres</div>
            <div style={{ height: '3px', background: '#1E1E1E', borderRadius: '2px', marginBottom: '6px' }}>
              <div style={{ height: '3px', background: c, borderRadius: '2px', width: `${pct}%` }} />
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFF' }}>{rez}/{tranzactii.length}</div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{pct}% rezolvate</div>
          </div>
        </>}
        <div style={{ marginTop: 'auto', padding: '12px 18px', fontSize: '11px', color: '#555' }}>{lunaLabel}</div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: '40px 44px', background: '#0F0F0F' }}>
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: c }} />
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#FFF' }}>Extras de cont</h1>
          </div>
          <p style={{ fontSize: '13px', color: '#888', marginLeft: '17px' }}>{firma.nume} · {lunaLabel}</p>
        </div>

        {/* Upload cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '40px' }}>
          {['RON', 'EUR'].map(v => (
            <UploadExtras key={v} valuta={v} firmaId={firma.id} lunaId={lunaId}
              extras={extrase.find(x => x.valuta === v) || null}
              culoare={c}
              onDone={loadTranzactii}
            />
          ))}
        </div>

        {/* Tranzactii */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <div style={{ width: '24px', height: '24px', border: `2px solid ${c}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ fontSize: '13px', color: '#777' }}>Se încarcă tranzacțiile...</p>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : tranzactii.length === 0 ? (
          <div style={{ padding: '40px', background: '#161616', border: '1px solid #242424', borderRadius: '12px', textAlign: 'center' }}>
            <p style={{ fontSize: '13px', color: '#888' }}>Importă CSV sau PDF mai sus pentru a vedea tranzacțiile.</p>
          </div>
        ) : (
          <>
            {/* Filtre */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#FFF' }}>
                Tranzacții <span style={{ color: '#666', fontWeight: 400 }}>({tranzactii.length})</span>
              </h2>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {([['all', `Toate (${counts.all})`], ['lipsa', `Fără doc (${counts.lipsa})`], ['ok', `Cu doc (${counts.ok})`], ['na', `N/A (${counts.na})`]] as const).map(([f, l]) => (
                  <button key={f} onClick={() => changeFilter(f)} style={PB(false, filter === f)}>{l}</button>
                ))}
              </div>
            </div>

            {/* Cards tranzactii */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {pageItems.map(tx => (
                <TxCard key={tx.id} tx={tx} firmaId={firma.id} lunaId={lunaId} culoare={c}
                  onNA={() => markNA(tx.id)}
                  onClearNA={() => clearNA(tx.id)}
                  onDocAdded={loadTranzactii}
                />
              ))}
              {pageItems.length === 0 && (
                <div style={{ padding: '40px', background: '#161616', border: '1px solid #242424', borderRadius: '12px', textAlign: 'center' }}>
                  <p style={{ fontSize: '13px', color: '#666' }}>Nicio tranzacție în această categorie.</p>
                </div>
              )}
            </div>

            {/* Paginare */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', padding: '12px 18px', background: '#161616', border: '1px solid #242424', borderRadius: '12px' }}>
                <span style={{ fontSize: '12px', color: '#888' }}>Pagina {page}/{totalPages} · {filtered.length} tranzacții</span>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <button onClick={() => setPage(1)} disabled={page === 1} style={PB(page === 1)}>«</button>
                  <button onClick={() => setPage(p => p - 1)} disabled={page === 1} style={PB(page === 1)}>‹</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .reduce<(number | string)[]>((a, p, i, arr) => {
                      if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) a.push('…')
                      a.push(p); return a
                    }, [])
                    .map((p, i) => typeof p === 'string'
                      ? <span key={`e${i}`} style={{ fontSize: '12px', color: '#555', padding: '0 4px' }}>…</span>
                      : <button key={p} onClick={() => setPage(p as number)} style={PB(false, page === p)}>{p}</button>
                    )}
                  <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages} style={PB(page === totalPages)}>›</button>
                  <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={PB(page === totalPages)}>»</button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function TxCard({ tx, firmaId, lunaId, culoare, onNA, onClearNA, onDocAdded }: {
  tx: Tx; firmaId: string; lunaId: string; culoare: string
  onNA: () => void; onClearNA: () => void; onDocAdded: () => void
}) {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [tip, setTip] = useState('factura')
  const [furnizor, setFurnizor] = useState('')
  const [numDoc, setNumDoc] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const isNA = tx.note === 'na'
  const isDone = !!tx.document_id
  const cat = tx.categorie ? CAT_STYLE[tx.categorie] || CAT_STYLE.altele : CAT_STYLE.altele
  const data = new Date(tx.data_tranzactie).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: '2-digit' })
  const r = `${parseInt(culoare.slice(1,3),16)},${parseInt(culoare.slice(3,5),16)},${parseInt(culoare.slice(5,7),16)}`

  async function upload(files: FileList) {
    setUploading(true)
    const fd = new FormData()
    fd.append('file', files[0])
    fd.append('txId', tx.id)
    fd.append('firmaId', firmaId)
    fd.append('lunaId', lunaId)
    fd.append('tip', tip)
    fd.append('furnizor', furnizor)
    fd.append('numDoc', numDoc)
    const res = await fetch('/api/tranzactii/doc', { method: 'POST', body: fd })
    setUploading(false)
    if (res.ok) { setOpen(false); onDocAdded() }
  }

  const border = isDone ? 'rgba(74,222,128,.2)' : isNA ? '#1E1E1E' : '#242424'
  const bg = isDone ? 'rgba(74,222,128,.04)' : isNA ? '#141414' : '#161616'
  const INP: React.CSSProperties = { fontSize: '12px', background: '#0F0F0F', border: '1px solid #2A2A2A', borderRadius: '8px', padding: '7px 11px', color: '#BBB', outline: 'none', width: '100%' }

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 16px' }}>
        {/* Status box */}
        <div style={{ width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDone ? '#4ADE80' : isNA ? '#252525' : 'transparent', border: isDone ? 'none' : isNA ? '1px solid #333' : '1.5px solid #2A2A2A' }}>
          {isDone && <svg width="11" height="11" fill="none" stroke="#0A0A0A" strokeWidth="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>}
          {isNA && <svg width="10" height="10" fill="none" stroke="#555" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>}
        </div>

        {/* Data */}
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#666', flexShrink: 0, width: '52px' }}>{data}</span>

        {/* Descriere + categorie */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '13px', fontWeight: 500, color: isNA ? '#555' : '#DDD', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isNA ? 'line-through' : 'none' }}>
            {tx.descriere_curatata || tx.descriere}
          </p>
          <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 7px', borderRadius: '20px', background: cat.bg, color: cat.c, display: 'inline-block', marginTop: '2px' }}>
            {tx.categorie || 'altele'}
          </span>
        </div>

        {/* Suma */}
        <span style={{ fontSize: '14px', fontWeight: 700, flexShrink: 0, color: tx.tip === 'credit' ? '#4ADE80' : '#F87171' }}>
          {tx.tip === 'credit' ? '+' : '-'}{tx.suma?.toFixed(2)} {tx.valuta}
        </span>

        {/* Actiuni */}
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          {!isDone && !isNA && <>
            <button onClick={() => setOpen(o => !o)} style={{ fontSize: '11px', fontWeight: 700, padding: '5px 12px', borderRadius: '7px', border: 'none', background: open ? '#333' : culoare, color: '#fff', cursor: 'pointer' }}>
              {open ? 'Anulează' : '+ Doc'}
            </button>
            <button onClick={onNA} style={{ fontSize: '11px', fontWeight: 600, padding: '5px 9px', borderRadius: '7px', border: '1px solid #2A2A2A', background: '#1A1A1A', color: '#888', cursor: 'pointer' }}>
              N/A
            </button>
          </>}
          {isDone && (
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '5px 12px', borderRadius: '7px', background: 'rgba(74,222,128,.15)', color: '#4ADE80' }}>
              {tx.documente?.tip_document || 'doc'} ✓
            </span>
          )}
          {isNA && (
            <button onClick={onClearNA} style={{ fontSize: '11px', fontWeight: 600, padding: '5px 9px', borderRadius: '7px', border: '1px solid #2A2A2A', background: '#1A1A1A', color: '#666', cursor: 'pointer' }}>
              Anulează N/A
            </button>
          )}
        </div>
      </div>

      {/* Upload panel */}
      {open && !isDone && (
        <div style={{ padding: '12px 16px 14px', borderTop: '1px solid #1A1A1A', background: '#111' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            <select value={tip} onChange={e => setTip(e.target.value)} style={INP}>
              <option value="factura">Factură</option>
              <option value="aviz_plata">Aviz plată</option>
              <option value="chitanta">Chitanță</option>
              <option value="ordin_plata">Ordin plată</option>
              <option value="contract">Contract</option>
              <option value="dispozitie_plata">Dispoziție plată</option>
              <option value="altul">Altul</option>
            </select>
            <input type="text" placeholder="Furnizor" value={furnizor} onChange={e => setFurnizor(e.target.value)} style={INP} />
            <input type="text" placeholder="Nr. document" value={numDoc} onChange={e => setNumDoc(e.target.value)} style={INP} />
          </div>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); e.dataTransfer.files.length && upload(e.dataTransfer.files) }}
            style={{ border: `1.5px dashed ${drag ? culoare : '#2A2A2A'}`, borderRadius: '10px', padding: '18px', textAlign: 'center', cursor: 'pointer', background: drag ? `rgba(${r},.06)` : '#0D0D0D' }}
          >
            {uploading
              ? <p style={{ fontSize: '12px', color: '#777' }}>Se încarcă...</p>
              : <p style={{ fontSize: '12px', fontWeight: 600, color: '#888' }}>drag & drop sau click · PDF / JPG / PNG</p>
            }
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => e.target.files && upload(e.target.files)} />
        </div>
      )}

      {/* Doc atasat */}
      {isDone && tx.documente && (
        <div style={{ padding: '7px 16px 9px', borderTop: '1px solid rgba(74,222,128,.1)', background: 'rgba(74,222,128,.03)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="13" height="13" fill="none" stroke="#4ADE80" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14,2 14,8 20,8" /></svg>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#4ADE80' }}>{tx.documente.fisier_nume}</span>
          {tx.documente.furnizor && <span style={{ fontSize: '11px', color: '#555' }}>· {tx.documente.furnizor}</span>}
          {tx.documente.numar_document && <span style={{ fontSize: '11px', color: '#555' }}>· {tx.documente.numar_document}</span>}
        </div>
      )}
    </div>
  )
}
