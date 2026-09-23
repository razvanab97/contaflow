'use client'
import { useCallback, useEffect, useState } from 'react'
import { tint } from '@/lib/colors'
import SincronizareProiectMail from './proiect-mail/SincronizareProiectMail'
import ObligatieDocumente from './ObligatieDocumente'

interface ObligatieRow {
  id: string | null
  tipKey: string
  label: string
  destinatar: string | null
  sursaInstructiuni: string | null
  editabilLink: string | null
  scadenta: string | null
  trimis: boolean
}

interface Sugestie {
  id: string
  tip_key: string
  tip_sugestie: 'trimis' | 'scadenta_override'
  valoare_data: string | null
  incredere: 'sigur' | 'posibil'
  sursa_subiect: string | null
  sursa_data: string | null
  sursa_rezumat: string | null
}

interface Firma { id: string; slug: string; nume: string; culoare: string }
interface Props { firma: Firma; lunaId: string; luna: string }

function zileRamase(scadenta: string | null): number | null {
  if (!scadenta) return null
  const azi = new Date(); azi.setHours(0, 0, 0, 0)
  const t = new Date(scadenta + 'T00:00:00')
  return Math.round((t.getTime() - azi.getTime()) / 86400000)
}

function fmtData(s: string | null) {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  return d && m && y ? `${d}.${m}.${y}` : s
}

export default function ObligatiiModule({ firma, lunaId, luna }: Props) {
  const [rows, setRows] = useState<ObligatieRow[] | null>(null)
  const [sugestii, setSugestii] = useState<Sugestie[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [sugestieBusy, setSugestieBusy] = useState<string | null>(null)
  const [tab, setTab] = useState<'checklist' | 'documente'>('checklist')
  const r = `${parseInt(firma.culoare.slice(1, 3), 16)},${parseInt(firma.culoare.slice(3, 5), 16)},${parseInt(firma.culoare.slice(5, 7), 16)}`

  const load = useCallback(() => {
    fetch(`/api/obligatii?lunaId=${encodeURIComponent(lunaId)}`)
      .then(res => res.json())
      .then(data => setRows(Array.isArray(data) ? data : []))
    fetch(`/api/obligatii/sugestii?lunaId=${encodeURIComponent(lunaId)}`)
      .then(res => res.json())
      .then(data => setSugestii(Array.isArray(data) ? data : []))
  }, [lunaId])

  useEffect(() => { load() }, [load])

  async function save(tipKey: string, patch: Partial<ObligatieRow>) {
    if (!rows) return
    const next = rows.map(row => row.tipKey === tipKey ? { ...row, ...patch } : row)
    setRows(next)
    setSaving(tipKey)
    const updated = next.find(row => row.tipKey === tipKey)!
    await fetch('/api/obligatii', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lunaId, tipKey, scadenta: updated.scadenta, trimis: updated.trimis }),
    })
    setSaving(null)
  }

  async function confirmSugestie(id: string) {
    setSugestieBusy(id)
    await fetch('/api/obligatii/sugestii/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sugestieId: id }) })
    setSugestieBusy(null)
    load()
  }

  async function respingeSugestie(id: string) {
    setSugestieBusy(id)
    setSugestii(prev => prev.filter(s => s.id !== id))
    await fetch('/api/obligatii/sugestii/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sugestieId: id }) })
    setSugestieBusy(null)
  }

  if (!rows) {
    return <div style={{ padding: '24px', fontSize: '13px', color: 'var(--c-999999)' }}>Se încarcă...</div>
  }

  const sorted = [...rows].sort((a, b) => {
    if (a.trimis !== b.trimis) return a.trimis ? 1 : -1
    return (a.scadenta || '9999').localeCompare(b.scadenta || '9999')
  })
  const restante = rows.filter(row => !row.trimis && zileRamase(row.scadenta) !== null && (zileRamase(row.scadenta) as number) < 0).length
  const curand = rows.filter(row => !row.trimis && zileRamase(row.scadenta) !== null && (zileRamase(row.scadenta) as number) >= 0 && (zileRamase(row.scadenta) as number) <= 5).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <SincronizareProiectMail firmaId={firma.id} culoare={firma.culoare} onSynced={load} />

      <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--c-1e1e1e)' }}>
        {(['checklist', 'documente'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontSize: '12px', fontWeight: 700, padding: '9px 14px', borderRadius: '8px 8px 0 0',
            border: 'none', borderBottom: tab === t ? `2px solid ${firma.culoare}` : '2px solid transparent',
            background: 'transparent', color: tab === t ? firma.culoare : 'var(--c-777777)', cursor: 'pointer',
          }}>
            {t === 'checklist' ? 'Checklist' : 'Documente'}
          </button>
        ))}
      </div>

      {tab === 'documente' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {rows.map(row => (
            <ObligatieDocumente
              key={row.tipKey}
              obligatieStareId={row.id}
              label={row.label}
              destinatar={row.destinatar}
              sursaInstructiuni={row.sursaInstructiuni}
              editabilLink={row.editabilLink}
              firmaSlug={firma.slug}
              luna={luna}
              culoare={firma.culoare}
            />
          ))}
        </div>
      ) : (
      <>
      {(restante > 0 || curand > 0) && (
        <div style={{ display: 'flex', gap: '12px' }}>
          {restante > 0 && (
            <div style={{ flex: 1, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.35)', borderRadius: '12px', padding: '14px 18px' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-red)' }}>{restante}</div>
              <div style={{ fontSize: '12px', color: 'var(--c-999999)' }}>{restante === 1 ? 'restanță' : 'restanțe'} — termen depășit</div>
            </div>
          )}
          {curand > 0 && (
            <div style={{ flex: 1, background: 'rgba(251,146,60,.08)', border: '1px solid rgba(251,146,60,.35)', borderRadius: '12px', padding: '14px 18px' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#F59E0B' }}>{curand}</div>
              <div style={{ fontSize: '12px', color: 'var(--c-999999)' }}>{curand === 1 ? 'urmează' : 'urmează'} în max. 5 zile</div>
            </div>
          )}
        </div>
      )}

      <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', padding: '20px 22px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sorted.map(row => {
            const zile = zileRamase(row.scadenta)
            const isSaving = saving === row.tipKey
            const overdue = !row.trimis && zile !== null && zile < 0
            const curandRow = !row.trimis && zile !== null && zile >= 0 && zile <= 5
            const bg = row.trimis ? tint(r, .06) : overdue ? 'rgba(239,68,68,.06)' : curandRow ? 'rgba(251,146,60,.06)' : 'var(--c-161616)'
            const border = row.trimis ? tint(r, .25) : overdue ? 'rgba(239,68,68,.35)' : curandRow ? 'rgba(251,146,60,.35)' : 'var(--c-262626)'
            const rowSugestii = sugestii.filter(s => s.tip_key === row.tipKey)

            return (
              <div key={row.tipKey} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
                  padding: '12px', borderRadius: '10px', background: bg, border: `1px solid ${border}`,
                  opacity: isSaving ? 0.6 : 1,
                }}>
                  <button
                    onClick={() => save(row.tipKey, { trimis: !row.trimis })}
                    disabled={isSaving}
                    style={{
                      width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0, cursor: 'pointer',
                      background: row.trimis ? tint(r, .15) : 'var(--c-1a1a1a)',
                      border: row.trimis ? `1.5px solid ${tint(r, .5)}` : '1.5px solid var(--c-2a2a2a)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {row.trimis && (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke={firma.culoare} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>

                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: row.trimis ? 'var(--c-777777)' : 'var(--c-dddddd)', textDecoration: row.trimis ? 'line-through' : 'none' }}>
                      {row.label}
                    </div>
                    {row.destinatar && (
                      <div style={{ fontSize: '11px', color: 'var(--c-777777)', marginTop: '2px' }}>→ {row.destinatar}</div>
                    )}
                  </div>

                  {!row.trimis && zile !== null && (
                    <span style={{ fontSize: '11px', fontWeight: 700, color: overdue ? 'var(--accent-red)' : curandRow ? '#F59E0B' : 'var(--c-888888)', whiteSpace: 'nowrap' }}>
                      {overdue ? `întârziat ${Math.abs(zile)} zile` : zile === 0 ? 'astăzi' : `în ${zile} zile`}
                    </span>
                  )}

                  <input
                    type="date"
                    defaultValue={row.scadenta ?? ''}
                    onChange={e => save(row.tipKey, { scadenta: e.target.value || null })}
                    style={{
                      background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px',
                      padding: '6px 10px', fontSize: '13px', color: 'var(--c-cccccc)', outline: 'none',
                    }}
                  />
                </div>

                {rowSugestii.map(s => {
                  const busy = sugestieBusy === s.id
                  const sigur = s.incredere === 'sigur'
                  return (
                    <div key={s.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap',
                      padding: '10px 12px', marginLeft: '34px', borderRadius: '8px',
                      background: sigur ? 'rgba(74,222,128,.08)' : 'rgba(251,146,60,.08)',
                      border: `1px solid ${sigur ? 'rgba(74,222,128,.3)' : 'rgba(251,146,60,.3)'}`,
                      opacity: busy ? .6 : 1,
                    }}>
                      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: sigur ? 'var(--accent-green)' : '#F59E0B' }}>
                          ✨ {s.tip_sugestie === 'scadenta_override' ? `Mail propune scadență ${fmtData(s.valoare_data)}` : 'Am găsit un mail care pare să confirme trimiterea'}
                        </div>
                        {s.sursa_rezumat && <div style={{ fontSize: '11px', color: 'var(--c-999999)', marginTop: '3px' }}>{s.sursa_rezumat}</div>}
                        <div style={{ fontSize: '10px', color: 'var(--c-666666)', marginTop: '3px' }}>
                          {s.sursa_subiect}{s.sursa_data ? ` · ${new Date(s.sursa_data).toLocaleDateString('ro-RO')}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button onClick={() => confirmSugestie(s.id)} disabled={busy} style={{ fontSize: '11px', fontWeight: 700, padding: '6px 10px', borderRadius: '7px', border: 'none', background: 'var(--accent-green)', color: '#08210f', cursor: 'pointer' }}>Confirmă</button>
                        <button onClick={() => respingeSugestie(s.id)} disabled={busy} style={{ fontSize: '11px', color: 'var(--c-888888)', background: 'transparent', border: '1px solid var(--c-2a2a2a)', borderRadius: '7px', padding: '6px 10px', cursor: 'pointer' }}>Respinge</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
      </>
      )}
    </div>
  )
}
