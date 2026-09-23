'use client'
import { useEffect, useState, useCallback } from 'react'
import SincronizareProiectMail from './proiect-mail/SincronizareProiectMail'

interface Achizitie {
  id: string
  denumire: string
  valoare: number | null
  sursa: string | null
  status: string
  scadenta: string | null
  nota: string | null
  created_at: string
}
interface AchizitieDoc { id: string; fisier_nume: string; tip_document: string; created_at: string }
interface Sugestie {
  id: string
  achizitie_id: string | null
  actiune: 'creare' | 'actualizare_status' | 'neclar'
  denumire: string | null
  valoare: number | null
  sursa: string | null
  status_propus: string | null
  incredere: 'sigur' | 'posibil'
  sursa_subiect: string | null
  sursa_data: string | null
  sursa_rezumat: string | null
}

interface Firma { id: string; slug: string; nume: string; culoare: string }
interface Props { firma: Firma; lunaId: string }

const STATUS_ORDER = ['oferta', 'nota_semnata', 'plata_initiata', 'dovada_trimisa', 'finalizat'] as const
const STATUS_LABEL: Record<string, string> = {
  oferta: 'Ofertă',
  nota_semnata: 'Notă semnată',
  plata_initiata: 'Plată inițiată',
  dovada_trimisa: 'Dovadă trimisă',
  finalizat: 'Finalizat',
}

const INP: React.CSSProperties = { fontSize: '13px', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '8px', padding: '8px 12px', color: 'var(--c-dddddd)', outline: 'none' }

function AchizitieDocumente({ achizitieId, culoare, etapaCuranta }: { achizitieId: string; culoare: string; etapaCuranta: string }) {
  const [docs, setDocs] = useState<AchizitieDoc[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/achizitii/documente?achizitieId=${achizitieId}`).then(r => r.json()).then(d => setDocs(Array.isArray(d) ? d : []))
  }, [achizitieId])

  useEffect(() => { load() }, [load])

  async function upload(file: File) {
    setBusy(true)
    const fd = new FormData()
    fd.append('file', file); fd.append('achizitieId', achizitieId); fd.append('etapa', etapaCuranta)
    await fetch('/api/achizitii/documente', { method: 'POST', body: fd })
    setBusy(false)
    load()
  }

  async function remove(id: string) {
    if (!confirm('Ștergi documentul?')) return
    await fetch(`/api/chitante/document?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
      {docs.map(d => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--c-999999)' }}>
          <span style={{ padding: '1px 6px', borderRadius: '999px', background: 'var(--c-1a1a1a)', fontSize: '10px', fontWeight: 700, color: 'var(--c-777777)' }}>{STATUS_LABEL[d.tip_document] || d.tip_document}</span>
          <a href={`/api/chitante/document?id=${d.id}`} style={{ color: culoare, textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.fisier_nume}</a>
          <button onClick={() => remove(d.id)} style={{ color: 'var(--accent-red)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '11px' }}>✕</button>
        </div>
      ))}
      <label style={{ fontSize: '11px', fontWeight: 600, color: culoare, cursor: 'pointer', opacity: busy ? .5 : 1 }}>
        {busy ? 'Se încarcă...' : `+ Adaugă document (${STATUS_LABEL[etapaCuranta]})`}
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} disabled={busy}
          onChange={e => { if (e.target.files?.[0]) upload(e.target.files[0]); e.target.value = '' }} />
      </label>
    </div>
  )
}

function SugestieBanner({ s, culoare, onConfirm, onReject, busy }: { s: Sugestie; culoare: string; onConfirm: () => void; onReject: () => void; busy: boolean }) {
  const sigur = s.incredere === 'sigur'
  const titlu = s.actiune === 'actualizare_status' && s.status_propus
    ? `Mail propune trecerea la etapa "${STATUS_LABEL[s.status_propus] || s.status_propus}"`
    : s.actiune === 'neclar'
      ? 'Mail posibil legat de o achiziție, dar neclar'
      : `Achiziție nouă găsită în email${s.denumire ? `: ${s.denumire}` : ''}`
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap',
      padding: '10px 12px', borderRadius: '8px', marginTop: '10px',
      background: sigur ? 'rgba(74,222,128,.08)' : 'rgba(251,146,60,.08)',
      border: `1px solid ${sigur ? 'rgba(74,222,128,.3)' : 'rgba(251,146,60,.3)'}`,
      opacity: busy ? .6 : 1,
    }}>
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: sigur ? 'var(--accent-green)' : '#F59E0B' }}>✨ {titlu}</div>
        {s.valoare != null && <div style={{ fontSize: '11px', color: 'var(--c-999999)', marginTop: '2px' }}>{s.valoare.toLocaleString('ro-RO')} RON{s.sursa ? ` · ${s.sursa}` : ''}</div>}
        {s.sursa_rezumat && <div style={{ fontSize: '11px', color: 'var(--c-999999)', marginTop: '3px' }}>{s.sursa_rezumat}</div>}
        {(s.sursa_subiect || s.sursa_data) && (
          <div style={{ fontSize: '10px', color: 'var(--c-666666)', marginTop: '3px' }}>
            {s.sursa_subiect}{s.sursa_data ? ` · ${new Date(s.sursa_data).toLocaleDateString('ro-RO')}` : ''}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <button onClick={onConfirm} disabled={busy || (s.actiune !== 'actualizare_status' && !s.denumire)} style={{ fontSize: '11px', fontWeight: 700, padding: '6px 10px', borderRadius: '7px', border: 'none', background: 'var(--accent-green)', color: '#08210f', cursor: 'pointer', opacity: (s.actiune !== 'actualizare_status' && !s.denumire) ? .5 : 1 }}>Confirmă</button>
        <button onClick={onReject} disabled={busy} style={{ fontSize: '11px', color: 'var(--c-888888)', background: 'transparent', border: '1px solid var(--c-2a2a2a)', borderRadius: '7px', padding: '6px 10px', cursor: 'pointer' }}>Respinge</button>
      </div>
    </div>
  )
}

export default function AchizitiiModule({ firma, lunaId }: Props) {
  const [items, setItems] = useState<Achizitie[] | null>(null)
  const [sugestii, setSugestii] = useState<Sugestie[]>([])
  const [sugestieBusy, setSugestieBusy] = useState<string | null>(null)
  const [denumire, setDenumire] = useState('')
  const [valoare, setValoare] = useState('')
  const [sursa, setSursa] = useState('cofinantare')
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/achizitii?firmaId=${firma.id}`).then(r => r.json()).then(d => setItems(Array.isArray(d) ? d : []))
    fetch(`/api/achizitii/sugestii?firmaId=${firma.id}`).then(r => r.json()).then(d => setSugestii(Array.isArray(d) ? d : []))
  }, [firma.id])

  useEffect(() => { load() }, [load])

  async function confirmSugestie(id: string) {
    setSugestieBusy(id)
    await fetch('/api/achizitii/sugestii/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sugestieId: id }) })
    setSugestieBusy(null)
    load()
  }

  async function respingeSugestie(id: string) {
    setSugestieBusy(id)
    setSugestii(prev => prev.filter(s => s.id !== id))
    await fetch('/api/achizitii/sugestii/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sugestieId: id }) })
    setSugestieBusy(null)
  }

  async function addAchizitie() {
    if (!denumire.trim()) return
    setAdding(true)
    await fetch('/api/achizitii', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firmaId: firma.id, lunaId, denumire: denumire.trim(), valoare: valoare ? Number(valoare) : null, sursa }),
    })
    setDenumire(''); setValoare('')
    setAdding(false)
    load()
  }

  async function setStatus(id: string, status: string) {
    setItems(prev => prev ? prev.map(i => i.id === id ? { ...i, status } : i) : prev)
    await fetch(`/api/achizitii/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
  }

  async function remove(id: string) {
    if (!confirm('Ștergi achiziția și toate documentele ei?')) return
    await fetch(`/api/achizitii/${id}`, { method: 'DELETE' })
    load()
  }

  if (!items) return <div style={{ padding: '24px', fontSize: '13px', color: 'var(--c-999999)' }}>Se încarcă...</div>

  const sugestiiNoi = sugestii.filter(s => !s.achizitie_id)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <SincronizareProiectMail firmaId={firma.id} culoare={firma.culoare} onSynced={load} />

      {sugestiiNoi.length > 0 && (
        <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', padding: '16px 18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--c-999999)', marginBottom: '4px' }}>Sugestii din email</div>
          {sugestiiNoi.map(s => (
            <SugestieBanner key={s.id} s={s} culoare={firma.culoare} busy={sugestieBusy === s.id}
              onConfirm={() => confirmSugestie(s.id)} onReject={() => respingeSugestie(s.id)} />
          ))}
        </div>
      )}

      <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', padding: '16px 18px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <input value={denumire} onChange={e => setDenumire(e.target.value)} placeholder="Denumire achiziție (ex. Aparat cu aburi)" style={{ ...INP, flex: '2 1 220px' }} />
        <input value={valoare} onChange={e => setValoare(e.target.value)} placeholder="Valoare (RON)" type="number" style={{ ...INP, flex: '1 1 120px' }} />
        <select value={sursa} onChange={e => setSursa(e.target.value)} style={{ ...INP, flex: '1 1 140px' }}>
          <option value="cofinantare">Cofinanțare</option>
          <option value="grant">Grant</option>
          <option value="altul">Altul</option>
        </select>
        <button onClick={addAchizitie} disabled={adding || !denumire.trim()} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: firma.culoare, color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: adding || !denumire.trim() ? .5 : 1 }}>
          + Adaugă
        </button>
      </div>

      {items.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: 'var(--c-777777)', background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px' }}>
          Nicio achiziție încă.
        </div>
      ) : items.map(item => {
        const idx = STATUS_ORDER.indexOf(item.status as typeof STATUS_ORDER[number])
        const next = STATUS_ORDER[idx + 1]
        return (
          <div key={item.id} style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--c-eeeeee)' }}>{item.denumire}</div>
                <div style={{ fontSize: '11px', color: 'var(--c-777777)', marginTop: '2px' }}>
                  {item.valoare != null ? `${item.valoare.toLocaleString('ro-RO')} RON` : 'fără valoare'} · {item.sursa || '—'}
                </div>
              </div>
              <button onClick={() => remove(item.id)} style={{ fontSize: '11px', color: 'var(--accent-red)', background: 'transparent', border: 'none', cursor: 'pointer' }}>Șterge</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
              {STATUS_ORDER.map((s, i) => (
                <span key={s} style={{
                  fontSize: '10.5px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px',
                  background: i <= idx ? `${firma.culoare}22` : 'var(--c-1a1a1a)',
                  color: i <= idx ? firma.culoare : 'var(--c-666666)',
                  border: `1px solid ${i <= idx ? firma.culoare : 'var(--c-262626)'}`,
                }}>
                  {STATUS_LABEL[s]}
                </span>
              ))}
              {next && (
                <button onClick={() => setStatus(item.id, next)} style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '999px', border: 'none', background: firma.culoare, color: '#fff', cursor: 'pointer' }}>
                  → {STATUS_LABEL[next]}
                </button>
              )}
            </div>

            <AchizitieDocumente achizitieId={item.id} culoare={firma.culoare} etapaCuranta={item.status} />

            {sugestii.filter(s => s.achizitie_id === item.id).map(s => (
              <SugestieBanner key={s.id} s={s} culoare={firma.culoare} busy={sugestieBusy === s.id}
                onConfirm={() => confirmSugestie(s.id)} onReject={() => respingeSugestie(s.id)} />
            ))}
          </div>
        )
      })}
    </div>
  )
}
