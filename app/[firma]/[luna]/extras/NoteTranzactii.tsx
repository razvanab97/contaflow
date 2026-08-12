'use client'
import { useState } from 'react'

interface Tx {
  id: string; extras_id: string; data_tranzactie: string
  descriere: string; descriere_curatata: string
  tip: 'debit'|'credit'; suma: number; valuta: string
  note: string|null
}

const QUICK_NOTES = ['Aștept factura', 'Nu am primit factura', 'Am trimis email furnizor', 'De verificat cu clientul']

export default function NoteTranzactii({ txs, firmaNume, lunaId, lunaLabel, culoare, onUpdateNote }: {
  txs: Tx[]; firmaNume: string; lunaId: string; lunaLabel: string; culoare: string
  onUpdateNote: (id: string, note: string|null) => void
}) {
  const [search, setSearch] = useState('')
  const [pickedId, setPickedId] = useState<string|null>(null)
  const [customText, setCustomText] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')

  const noted = txs.filter(t => t.note && t.note !== 'na')
    .sort((a, b) => new Date(a.data_tranzactie).getTime() - new Date(b.data_tranzactie).getTime())

  const q = search.trim().toLowerCase()
  const results = q.length < 2 ? [] : txs
    .filter(t => !(t.note && t.note !== 'na'))
    .filter(t => (t.descriere_curatata || t.descriere || '').toLowerCase().includes(q) || String(t.suma).includes(q))
    .slice(0, 8)

  const picked = txs.find(t => t.id === pickedId) || null

  function saveNote(id: string, note: string) {
    onUpdateNote(id, note)
    setPickedId(null)
    setCustomText('')
    setSearch('')
  }

  async function downloadPdf() {
    setDownloading(true)
    setDownloadError('')
    try {
      const res = await fetch('/api/tranzactii/note-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lunaId, firmaNume, lunaLabel })
      })
      if (!res.ok) { setDownloadError('PDF-ul nu a putut fi generat'); setDownloading(false); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${firmaNume}_${lunaLabel}_note_tranzactii.pdf`.replace(/\s+/g, '_')
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setDownloadError('PDF-ul nu a putut fi generat')
    }
    setDownloading(false)
  }

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#FFF', marginBottom: '4px' }}>Note pe tranzacții</h2>
        <p style={{ fontSize: '12px', color: '#888' }}>Caută o tranzacție din extras și notează un status (ex: „Aștept factura”). Notele apar mai jos și pot fi exportate ca PDF scurt.</p>
      </div>

      {/* Search + pick */}
      <div style={{ marginBottom: '24px', position: 'relative' }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPickedId(null) }}
          placeholder="Caută tranzacție după descriere sau sumă..."
          style={{ width: '100%', maxWidth: '460px', padding: '10px 14px', borderRadius: '9px', border: '1px solid #2A2A2A', background: '#161616', color: '#EEE', fontSize: '13px', outline: 'none' }}
        />
        {results.length > 0 && !pickedId && (
          <div style={{ marginTop: '8px', maxWidth: '460px', border: '1px solid #242424', borderRadius: '9px', overflow: 'hidden' }}>
            {results.map(t => (
              <button key={t.id} onClick={() => { setPickedId(t.id); setSearch('') }} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', width: '100%', padding: '9px 12px', border: 'none', borderBottom: '1px solid #1E1E1E', background: '#141414', color: '#DDD', fontSize: '12px', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.data_tranzactie} · {t.descriere_curatata || t.descriere}</span>
                <span style={{ fontWeight: 700, flexShrink: 0, color: t.tip === 'credit' ? '#4ADE80' : '#F87171' }}>{t.tip === 'credit' ? '+' : '-'}{Number(t.suma).toFixed(2)} {t.valuta}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {picked && (
        <div style={{ marginBottom: '24px', padding: '16px', background: '#141414', border: `1px solid ${culoare}55`, borderRadius: '12px', maxWidth: '520px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFF' }}>{picked.descriere_curatata || picked.descriere}</p>
              <p style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{picked.data_tranzactie} · {picked.tip === 'credit' ? '+' : '-'}{Number(picked.suma).toFixed(2)} {picked.valuta}</p>
            </div>
            <button onClick={() => setPickedId(null)} style={{ border: 'none', background: 'transparent', color: '#666', cursor: 'pointer', fontSize: '13px' }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {QUICK_NOTES.map(n => (
              <button key={n} onClick={() => saveNote(picked.id, n)} style={{ fontSize: '11px', fontWeight: 600, padding: '6px 11px', borderRadius: '7px', border: '1px solid #2A2A2A', background: '#1A1A1A', color: '#CCC', cursor: 'pointer' }}>{n}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={customText}
              onChange={e => setCustomText(e.target.value)}
              placeholder="Sau text personalizat..."
              onKeyDown={e => { if (e.key === 'Enter' && customText.trim()) saveNote(picked.id, customText.trim()) }}
              style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #2A2A2A', background: '#111', color: '#EEE', fontSize: '12px', outline: 'none' }}
            />
            <button disabled={!customText.trim()} onClick={() => customText.trim() && saveNote(picked.id, customText.trim())} style={{ fontSize: '12px', fontWeight: 700, padding: '8px 14px', borderRadius: '8px', border: 'none', background: customText.trim() ? culoare : '#2A2A2A', color: '#fff', cursor: customText.trim() ? 'pointer' : 'not-allowed' }}>Salvează</button>
          </div>
        </div>
      )}

      {/* List of noted transactions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#DDD' }}>De urmărit ({noted.length})</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {downloadError && <span style={{ fontSize: '11px', color: '#F87171' }}>{downloadError}</span>}
          <button onClick={downloadPdf} disabled={downloading || noted.length === 0} style={{ fontSize: '11px', fontWeight: 700, padding: '7px 12px', borderRadius: '8px', border: `1px solid ${noted.length > 0 ? culoare : '#2A2A2A'}`, background: 'transparent', color: noted.length > 0 ? culoare : '#555', cursor: noted.length > 0 ? 'pointer' : 'not-allowed', opacity: downloading ? .6 : 1 }}>
            {downloading ? 'Se generează PDF-ul...' : 'Descarcă PDF ↓'}
          </button>
        </div>
      </div>

      {noted.length === 0 ? (
        <div style={{ padding: '32px', background: '#141414', border: '1px solid #242424', borderRadius: '12px', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: '#666' }}>Nicio tranzacție notată încă.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {noted.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '11px 14px', background: '#141414', border: '1px solid #222', borderRadius: '10px' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: '12px', fontWeight: 600, color: '#DDD', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.descriere_curatata || t.descriere}</p>
                <p style={{ fontSize: '10.5px', color: '#777', marginTop: '2px' }}>{t.data_tranzactie} · {t.tip === 'credit' ? '+' : '-'}{Number(t.suma).toFixed(2)} {t.valuta}</p>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#D8A657', background: 'rgba(216,166,87,.1)', padding: '4px 10px', borderRadius: '7px', flexShrink: 0, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.note}</span>
              <button onClick={() => onUpdateNote(t.id, null)} style={{ fontSize: '11px', fontWeight: 600, padding: '5px 9px', borderRadius: '7px', border: '1px solid #2A2A2A', background: '#1A1A1A', color: '#666', cursor: 'pointer', flexShrink: 0 }}>Șterge</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
