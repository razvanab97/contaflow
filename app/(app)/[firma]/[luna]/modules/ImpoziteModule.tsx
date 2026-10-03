'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TaskDef } from '@/lib/firma-config'
import { tint } from '@/lib/colors'
import TaxMailPanel from './TaxMailPanel'

export interface ImpozitStare {
  tip_key: string
  suma: number | null
  scadenta: string | null
  platit: boolean
}

interface Firma { id: string; slug: string; nume: string; culoare: string }
interface Props { firma: Firma; lunaId: string; luna: string; tasks: TaskDef[]; stari: ImpozitStare[] }

export default function ImpoziteModule({ firma, lunaId, luna, tasks, stari }: Props) {
  const router = useRouter()
  const stariMap: Record<string, ImpozitStare> = {}
  for (const s of stari) stariMap[s.tip_key] = s

  const [rows, setRows] = useState<Record<string, ImpozitStare>>(
    Object.fromEntries(tasks.map(t => [t.key, stariMap[t.key] || { tip_key: t.key, suma: null, scadenta: null, platit: false }]))
  )
  const [saving, setSaving] = useState<string | null>(null)
  const [importTotals, setImportTotals] = useState({count:0,total:0,remaining:0})

  async function save(tipKey: string, patch: Partial<ImpozitStare>) {
    const next = { ...rows[tipKey], ...patch }
    setRows(prev => ({ ...prev, [tipKey]: next }))
    setSaving(tipKey)
    const res = await fetch('/api/impozite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lunaId, tipKey, suma: next.suma, scadenta: next.scadenta, platit: next.platit }),
    })
    setSaving(null)
    if (res.ok) router.refresh()
  }

  const totalSume = importTotals.count ? importTotals.total : tasks.reduce((sum, t) => sum + (rows[t.key]?.suma || 0), 0)
  const totalRamas = importTotals.count ? importTotals.remaining : tasks.reduce((sum, t) => sum + (rows[t.key]?.platit ? 0 : (rows[t.key]?.suma || 0)), 0)
  const r = parseInt(firma.culoare.slice(1,3),16) + ',' + parseInt(firma.culoare.slice(3,5),16) + ',' + parseInt(firma.culoare.slice(5,7),16)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1, background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: 'var(--r-lg)', padding: '16px 18px' }}>
          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-777777)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '6px' }}>{importTotals.count ? 'Total din emailurile importate' : 'Total impozite'}</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--c-ffffff)' }}>{totalSume.toLocaleString('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2})} RON</div>
        </div>
        <div style={{ flex: 1, background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: 'var(--r-lg)', padding: '16px 18px' }}>
          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-777777)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '6px' }}>{importTotals.count ? 'Rămas din emailurile importate' : 'Rămas de plătit'}</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: totalRamas > 0 ? 'var(--warning)' : 'var(--success)' }}>{totalRamas.toLocaleString('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2})} RON</div>
        </div>
      </div>

      <TaxMailPanel firma={firma} lunaId={lunaId} luna={luna} onTotals={setImportTotals}/>

      <details open={importTotals.count ? undefined : true} style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: 'var(--r-lg)', padding: '20px 22px' }}>
        <summary style={{cursor:'pointer',fontSize:'var(--fs-base)',fontWeight:700,marginBottom:12}}>Categorii introduse manual{importTotals.count ? ' · evidență separată, fără dublare în total' : ''}</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {tasks.map(task => {
            const row = rows[task.key]
            const isSaving = saving === task.key
            return (
              <div key={task.key} style={{
                display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
                padding: '12px', borderRadius: 'var(--r-md)',
                background: row.platit ? `${tint(r,.06)}` : 'var(--c-161616)',
                border: `1px solid ${row.platit ? `${tint(r,.25)}` : 'var(--c-262626)'}`,
                opacity: isSaving ? 0.6 : 1,
              }}>
                <button
                  onClick={() => save(task.key, { platit: !row.platit })}
                  disabled={isSaving}
                  style={{
                    width: '22px', height: '22px', borderRadius: 'var(--r-sm)', flexShrink: 0, cursor: 'pointer',
                    background: row.platit ? `${tint(r,.15)}` : 'var(--c-1a1a1a)',
                    border: row.platit ? `1.5px solid ${tint(r,.5)}` : '1.5px solid var(--c-2a2a2a)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {row.platit && (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke={firma.culoare} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                <span style={{ flex: '1 1 220px', fontSize: 'var(--fs-md)', fontWeight: 500, color: row.platit ? 'var(--c-777777)' : 'var(--c-dddddd)', textDecoration: row.platit ? 'line-through' : 'none' }}>
                  {task.label}
                </span>

                <input
                  type="number"
                  placeholder="Sumă (RON)"
                  defaultValue={row.suma ?? ''}
                  onBlur={e => save(task.key, { suma: e.target.value ? parseFloat(e.target.value) : null })}
                  style={{
                    width: '120px', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: 'var(--r-sm)',
                    padding: '6px 10px', fontSize: 'var(--fs-md)', color: 'var(--c-ffffff)', outline: 'none',
                  }}
                />

                <input
                  type="date"
                  defaultValue={row.scadenta ?? ''}
                  onChange={e => save(task.key, { scadenta: e.target.value || null })}
                  style={{
                    background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: 'var(--r-sm)',
                    padding: '6px 10px', fontSize: 'var(--fs-md)', color: 'var(--c-cccccc)', outline: 'none',
                  }}
                />
              </div>
            )
          })}
        </div>
      </details>
    </div>
  )
}
