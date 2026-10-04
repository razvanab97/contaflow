'use client'
import { deschideDocument } from '@/lib/vizualizare'
import { useCallback, useEffect, useRef, useState } from 'react'
import AiCautareFacturi from './AiCautareFacturi'

interface WatchFile {
  id: string
  fisier_nume: string
  status: 'pending' | 'imported' | 'duplicat' | 'nedetectat' | 'eroare'
  error_message?: string | null
  created_at?: string | null
  synced_at?: string | null
  firme?: { nume?: string | null; slug?: string | null } | null
}

interface Props {
  firme: { id: string; nume: string }[]
}

interface Totaluri { imported: number; asociate: number; duplicate: number; nedetectat: number; eroare: number; impartite: number }
const ZERO: Totaluri = { imported: 0, asociate: 0, duplicate: 0, nedetectat: 0, eroare: 0, impartite: 0 }

function isPreviewable(nume: string): 'pdf' | 'image' | null {
  const lower = nume.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (/\.(jpe?g|png)$/.test(lower)) return 'image'
  return null
}

function cand(iso?: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('ro-RO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Facturile puse in ~/Desktop/Facturi ContaFlow (urcate in coada de scripts/watch-facturi-locale.js)
// se repartizeaza automat pe firma beneficiara si intra in Inbox Facturi al acelei firme, in luna
// datei facturii - de unde se asociaza cu platile din extras (automat cand potrivirea e sigura, ca
// sugestie in rest). Sincronizarea porneste singura la deschiderea Dashboard-ului cand exista
// fisiere in asteptare si continua pe loturi (limita de 60s/apel) pana se goleste coada.
export default function FacturiLocaleGlobal({ firme }: Props) {
  const [files, setFiles] = useState<WatchFile[]>([])
  const [recente, setRecente] = useState<WatchFile[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [tot, setTot] = useState<Totaluri>(ZERO)
  const [message, setMessage] = useState('')
  const [assignPick, setAssignPick] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [previewIds, setPreviewIds] = useState<Set<string>>(new Set())
  const autoStarted = useRef(false)
  const stop = useRef(false)

  function togglePreview(id: string) {
    // Vezi -> vizualizatorul pop-up global (rapid, direct din storage)
    deschideDocument(`/api/inbox-facturi/global/document?id=${encodeURIComponent(id)}`)
  }

  const load = useCallback(async () => {
    const res = await fetch('/api/inbox-facturi/global', { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setFiles(data.files || [])
      setRecente(data.recente || [])
      setPendingCount(data.pendingCount || 0)
    }
    setLoaded(true)
    return res.ok ? (data.pendingCount || 0) as number : 0
  }, [])

  const sync = useCallback(async (reincearca?: string) => {
    setSyncBusy(true)
    setMessage('')
    stop.current = false
    const acc = { ...ZERO }
    let eroareServer = ''
    try {
      for (let i = 0; i < 60 && !stop.current; i++) {
        const res = await fetch('/api/inbox-facturi/global/sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(i === 0 && reincearca ? { reincearca } : {}),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { eroareServer = data.error || `Sincronizarea a eșuat (${res.status})`; break }
        for (const k of Object.keys(acc) as (keyof Totaluri)[]) acc[k] += data[k] || 0
        setTot({ ...acc })
        setPendingCount(data.ramase || 0)
        await load()
        if (!data.ramase || !data.total) break
      }
    } catch {
      eroareServer = 'Conexiunea s-a întrerupt — fișierele rămase se reiau la următoarea sincronizare.'
    }
    const parti = [
      acc.imported && `${acc.imported} ${acc.imported === 1 ? 'factură importată' : 'facturi importate'}${acc.asociate ? ` (${acc.asociate} asociate automat cu plăți)` : ''}`,
      acc.impartite && `${acc.impartite} ${acc.impartite === 1 ? 'pachet împărțit' : 'pachete împărțite'} în facturi separate`,
      acc.duplicate && `${acc.duplicate} deja existente`,
      acc.nedetectat && `${acc.nedetectat} de atribuit manual`,
      acc.eroare && `${acc.eroare} cu eroare`,
    ].filter(Boolean)
    setMessage(eroareServer || (parti.length ? parti.join(' · ') : 'Nimic nou de sincronizat.'))
    if (acc.imported) window.dispatchEvent(new CustomEvent('cf:toast', { detail: { text: `Facturi din calculator: ${parti.join(' · ')}.`, tone: 'success' } }))
    await load()
    setSyncBusy(false)
  }, [load])

  // Pornire automata cand exista fisiere in asteptare.
  useEffect(() => {
    load().then(n => {
      if (n > 0 && !autoStarted.current) { autoStarted.current = true; sync() }
    })
  }, [load, sync])

  async function assign(file: WatchFile) {
    const firmaId = assignPick[file.id]
    if (!firmaId) return
    setBusyId(file.id)
    const res = await fetch('/api/inbox-facturi/global/atribuie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: file.id, firmaId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setMessage(data.error || 'Atribuirea a eșuat')
    else setFiles(prev => prev.filter(f => f.id !== file.id))
    await load()
    setBusyId(null)
  }

  async function ignora(file: WatchFile) {
    if (!confirm(`„${file.fisier_nume}” nu e o factură? Iese din listă fără să fie importat.`)) return
    setBusyId(file.id)
    const res = await fetch('/api/inbox-facturi/global/atribuie', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: file.id, ignora: true }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setMessage(data.error || 'Nu s-a putut ignora')
    else setFiles(prev => prev.filter(f => f.id !== file.id))
    await load()
    setBusyId(null)
  }

  const nedetectate = files.filter(f => f.status === 'nedetectat')
  const erori = files.filter(f => f.status === 'eroare')
  const progresTotal = tot.imported + tot.duplicate + tot.nedetectat + tot.eroare + tot.impartite

  function rand(file: WatchFile, children: React.ReactNode) {
    const kind = isPreviewable(file.fisier_nume)
    const open = previewIds.has(file.id)
    const src = `/api/inbox-facturi/global/document?id=${encodeURIComponent(file.id)}&preview=1`
    return (
      <div key={file.id}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '8px 10px', borderRadius: 'var(--r-md)', background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: '180px', fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
            {file.fisier_nume}
            {file.error_message && (
              <div style={{ fontSize: 'var(--fs-xs)', color: file.status === 'eroare' ? 'var(--danger)' : 'var(--warning)', marginTop: '2px' }}>
                {file.error_message}
              </div>
            )}
          </div>
          {kind && (
            <button onClick={() => togglePreview(file.id)} className="btn btn-sm btn-ghost" style={{ color: 'var(--accent)' }}>
              {open ? 'Ascunde' : 'Vezi'}
            </button>
          )}
          {children}
        </div>
        {open && kind === 'pdf' && <iframe src={src} title={file.fisier_nume} style={{ width: '100%', height: '65vh', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', marginTop: '6px', background: '#fff' }} />}
        {open && kind === 'image' && <img src={src} alt={file.fisier_nume} style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', marginTop: '6px', background: '#fff' }} />}
      </div>
    )
  }

  return (
    <div className="card card-pad">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text-primary)' }}>Facturi din Personal Computer</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
            Pune fișiere în <code>~/Desktop/Facturi ContaFlow</code> (rulează <code>npm run watch:facturi</code>). Se repartizează automat pe firma beneficiară, în Inbox Facturi, pe luna facturii — și se asociază cu plata din extras.
          </div>
        </div>
        {syncBusy ? (
          <button onClick={() => { stop.current = true }} className="btn" style={{ flexShrink: 0 }}>Oprește</button>
        ) : (
          <button onClick={() => sync()} title="Verifică din nou coada, chiar dacă nu arată nimic în așteptare" className="btn btn-primary" style={{ flexShrink: 0 }}>
            Sincronizează{pendingCount ? ` (${pendingCount})` : ''}
          </button>
        )}
      </div>

      <AiCautareFacturi />

      {(syncBusy || progresTotal > 0) && (
        <div style={{ marginTop: '14px' }} aria-live="polite">
          <div className="progress"><span style={{ width: `${progresTotal + pendingCount > 0 ? Math.round((progresTotal / (progresTotal + pendingCount)) * 100) : 100}%` }} /></div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '6px' }}>
            {syncBusy ? 'Se sincronizează… ' : ''}{progresTotal} procesate{pendingCount ? ` · ${pendingCount} rămase` : ''}
          </div>
        </div>
      )}

      {message && <div role="status" style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '12px', padding: '8px 10px', background: 'var(--surface-secondary)', borderRadius: 'var(--r-md)' }}>{message}</div>}

      {nedetectate.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <div className="eyebrow" style={{ marginBottom: '8px', color: 'var(--warning)' }}>De atribuit manual · {nedetectate.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {nedetectate.map(file => rand(file, <>
                <select aria-label="Firma beneficiară" value={assignPick[file.id] || ''} onChange={e => setAssignPick(prev => ({ ...prev, [file.id]: e.target.value }))} style={{ height: '28px', padding: '0 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-primary)' }}>
                  <option value="">Alege firma...</option>
                  {firme.map(f => <option key={f.id} value={f.id}>{f.nume}</option>)}
                </select>
                <button onClick={() => assign(file)} disabled={!assignPick[file.id] || busyId === file.id} className="btn btn-sm btn-primary" style={{ opacity: (!assignPick[file.id] || busyId === file.id) ? .5 : 1 }}>
                  {busyId === file.id ? '…' : 'Atribuie'}
                </button>
                <button onClick={() => ignora(file)} disabled={busyId === file.id} className="btn btn-sm btn-ghost" title="AWB, proformă, document de transport — nu se importă">
                  Nu e factură
                </button>
              </>))}
          </div>
        </div>
      )}

      {erori.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <div className="eyebrow" style={{ marginBottom: '8px', color: 'var(--danger)' }}>Cu eroare · {erori.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {erori.map(file => rand(file, <>
                <button onClick={() => sync(file.id)} disabled={syncBusy} className="btn btn-sm" title="Pune fișierul înapoi în coadă și îl procesează din nou (un pachet cu mai multe facturi se împarte în facturi separate)">
                  Reîncearcă
                </button>
              </>))}
          </div>
        </div>
      )}

      {loaded && recente.length > 0 && (
        <details style={{ marginTop: '14px' }}>
          <summary style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', fontWeight: 600 }}>Ultimele procesate</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
            {recente.map(f => (
              <div key={f.id} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 200px', minWidth: 0, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fisier_nume}</span>
                <span style={{ fontWeight: 600, color: f.status === 'imported' ? 'var(--success)' : 'var(--text-muted)' }}>
                  {f.error_message?.startsWith('Pachet') ? 'împărțit' : f.error_message?.startsWith('Ignorat') ? 'ignorat (nu e factură)' : f.status === 'duplicat' ? 'deja existent' : f.firme?.nume || 'importat'}
                </span>
                <span>{cand(f.synced_at)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
