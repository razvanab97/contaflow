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
    <div className="card card-pad">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text-primary)' }}>Facturi din Personal Computer</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
            Pune fișiere în <code>~/Desktop/Facturi ContaFlow</code> (rulează <code>npm run watch:facturi</code>), apoi sincronizează aici — se repartizează automat pe firma potrivită.
          </div>
        </div>
        <button onClick={sync} disabled={syncBusy} title="Verifică din nou folderul local, chiar dacă nu arată nimic în așteptare" className="btn btn-primary" style={{ flexShrink: 0, opacity: syncBusy ? .6 : 1 }}>
          {syncBusy ? 'Sincronizez...' : `Sincronizează${pendingCount ? ` (${pendingCount})` : ''}`}
        </button>
      </div>

      {message && <div role="status" style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '12px', padding: '8px 10px', background: 'var(--surface-secondary)', borderRadius: 'var(--r-md)' }}>{message}</div>}

      {rezultate.length > 0 && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {rezultate.map((r, i) => (
            <div key={`${r.fisier}-${i}`} style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{r.fisier}</span>
              <span>→</span>
              <span style={{ fontWeight: 700, color: r.status === 'imported' ? 'var(--success)' : r.status === 'eroare' ? 'var(--danger)' : 'var(--text-muted)' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '8px 10px', borderRadius: 'var(--r-md)', background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: '160px', fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                    {file.fisier_nume}
                    <span style={{ fontSize: 'var(--fs-xs)', color: file.status === 'eroare' ? 'var(--danger)' : 'var(--warning)', marginLeft: '6px' }}>
                      {file.status === 'nedetectat' ? '· firmă nedetectată' : `· eroare: ${file.error_message || ''}`}
                    </span>
                  </div>
                  {kind && (
                    <button onClick={() => togglePreview(file.id)} className="btn btn-sm btn-ghost" style={{ color: 'var(--accent)' }}>
                      {open ? 'Ascunde' : 'Vezi'}
                    </button>
                  )}
                  <select value={assignPick[file.id] || ''} onChange={e => setAssignPick(prev => ({ ...prev, [file.id]: e.target.value }))} style={{ height: '28px', padding: '0 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-primary)' }}>
                    <option value="">Alege firma...</option>
                    {firme.map(f => <option key={f.id} value={f.id}>{f.nume}</option>)}
                  </select>
                  <button onClick={() => assign(file)} disabled={!assignPick[file.id] || assignBusy === file.id} className="btn btn-sm btn-primary" style={{ opacity: (!assignPick[file.id] || assignBusy === file.id) ? .5 : 1 }}>
                    {assignBusy === file.id ? '...' : 'Atribuie'}
                  </button>
                </div>
                {open && kind === 'pdf' && (
                  <iframe src={`/api/inbox-facturi/global/document?id=${encodeURIComponent(file.id)}&preview=1`} style={{ width: '100%', height: '65vh', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', marginTop: '6px', background: '#fff' }} />
                )}
                {open && kind === 'image' && (
                  <img src={`/api/inbox-facturi/global/document?id=${encodeURIComponent(file.id)}&preview=1`} alt={file.fisier_nume} style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', marginTop: '6px', background: '#fff' }} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
