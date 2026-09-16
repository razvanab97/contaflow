'use client'
import { useCallback, useEffect, useState } from 'react'

interface WatchFile {
  id: string
  fisier_nume: string
  status: 'pending' | 'imported' | 'duplicat' | 'nedetectat' | 'eroare'
  error_message?: string | null
  created_at?: string | null
  firme?: { nume?: string | null; slug?: string | null } | null
}

interface Props {
  firme: { id: string; nume: string }[]
}

function isPreviewable(nume: string): 'pdf' | 'image' | null {
  const lower = nume.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (/\.(jpe?g|png)$/.test(lower)) return 'image'
  return null
}

export default function FacturiLocaleGlobal({ firme }: Props) {
  const [files, setFiles] = useState<WatchFile[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [syncBusy, setSyncBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [rezultate, setRezultate] = useState<{ fisier:string; status:string; firma:string|null }[]>([])
  const [assignPick, setAssignPick] = useState<Record<string, string>>({})
  const [assignBusy, setAssignBusy] = useState<string | null>(null)
  const [previewIds, setPreviewIds] = useState<Set<string>>(new Set())

  function togglePreview(id: string) {
    setPreviewIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  const load = useCallback(async () => {
    const res = await fetch('/api/inbox-facturi/global')
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setFiles(data.files || []); setPendingCount(data.pendingCount || 0) }
  }, [])

  useEffect(() => { load() }, [load])

  async function sync() {
    setSyncBusy(true)
    setMessage('')
    setRezultate([])
    const res = await fetch('/api/inbox-facturi/global/sync', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setMessage(data.error || 'Sincronizarea a eșuat')
    else if (data.total === 0) setMessage('Nu era nimic nou de sincronizat - am verificat oricum.')
    else {
      setMessage(`${data.imported} importate, ${data.duplicate} duplicate, ${data.nedetectat} fără firmă detectată, ${data.eroare} erori.`)
      setRezultate(Array.isArray(data.rezultate) ? data.rezultate : [])
    }
    await load()
    setSyncBusy(false)
  }

  async function assign(file: WatchFile) {
    const firmaId = assignPick[file.id]
    if (!firmaId) return
    setAssignBusy(file.id)
    const res = await fetch('/api/inbox-facturi/global/atribuie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: file.id, firmaId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setMessage(data.error || 'Atribuirea a eșuat')
    else setFiles(prev => prev.filter(f => f.id !== file.id)) // dispare imediat, fara sa astepte reload-ul
    await load()
    setAssignBusy(null)
  }

  const needsAttention = files.filter(f => f.status === 'nedetectat' || f.status === 'eroare')

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px 24px', marginBottom: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Facturi din Personal Computer</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Pune fișiere în <code>~/Desktop/Facturi ContaFlow</code> (rulează <code>npm run watch:facturi</code>), apoi sincronizează aici — se repartizează automat pe firma potrivită.
          </div>
        </div>
        <button onClick={sync} disabled={syncBusy} title="Verifică din nou folderul local, chiar dacă nu arată nimic în așteptare" style={{ fontSize: '12px', fontWeight: 700, padding: '9px 14px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', opacity: syncBusy ? .5 : 1, flexShrink: 0 }}>
          {syncBusy ? 'Sincronizez...' : `Sincronizează${pendingCount ? ` (${pendingCount})` : ''}`}
        </button>
      </div>

      {message && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '12px' }}>{message}</div>}

      {rezultate.length > 0 && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {rezultate.map((r, i) => (
            <div key={`${r.fisier}-${i}`} style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{r.fisier}</span>
              <span>→</span>
              <span style={{ fontWeight: 700, color: r.status === 'imported' ? 'var(--accent-green, #4ade80)' : r.status === 'eroare' ? 'var(--accent-red, #f87171)' : 'var(--text-muted)' }}>
                {r.firma ? r.firma : r.status === 'duplicat' ? 'deja existent' : r.status === 'nedetectat' ? 'firmă nedetectată' : 'eroare'}
              </span>
            </div>
          ))}
        </div>
      )}

      {needsAttention.length > 0 && (
        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {needsAttention.map(file => {
            const kind = isPreviewable(file.fisier_nume)
            const open = previewIds.has(file.id)
            return (
              <div key={file.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '8px 10px', borderRadius: '8px', background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: '160px', fontSize: '12px', color: 'var(--text-primary)' }}>
                    {file.fisier_nume}
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                      {file.status === 'nedetectat' ? '· firmă nedetectată' : `· eroare: ${file.error_message || ''}`}
                    </span>
                  </div>
                  {kind && (
                    <button onClick={() => togglePreview(file.id)} style={{ fontSize: '11px', fontWeight: 700, padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer' }}>
                      {open ? 'Ascunde' : 'Vezi'}
                    </button>
                  )}
                  <select value={assignPick[file.id] || ''} onChange={e => setAssignPick(prev => ({ ...prev, [file.id]: e.target.value }))} style={{ fontSize: '12px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}>
                    <option value="">Alege firma...</option>
                    {firme.map(f => <option key={f.id} value={f.id}>{f.nume}</option>)}
                  </select>
                  <button onClick={() => assign(file)} disabled={!assignPick[file.id] || assignBusy === file.id} style={{ fontSize: '11px', fontWeight: 700, padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', opacity: (!assignPick[file.id] || assignBusy === file.id) ? .5 : 1 }}>
                    {assignBusy === file.id ? '...' : 'Atribuie'}
                  </button>
                </div>
                {open && kind === 'pdf' && (
                  <iframe src={`/api/inbox-facturi/global/document?id=${encodeURIComponent(file.id)}&preview=1`} style={{ width: '100%', height: '65vh', border: '1px solid var(--border)', borderRadius: '8px', marginTop: '6px', background: '#fff' }} />
                )}
                {open && kind === 'image' && (
                  <img src={`/api/inbox-facturi/global/document?id=${encodeURIComponent(file.id)}&preview=1`} alt={file.fisier_nume} style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', border: '1px solid var(--border)', borderRadius: '8px', marginTop: '6px', background: '#fff' }} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
