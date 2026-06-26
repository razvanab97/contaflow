'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TaskDef } from '@/lib/firma-config'

export interface ImpozitStare {
  tip_key: string
  suma: number | null
  scadenta: string | null
  platit: boolean
}

interface Firma { id: string; slug: string; nume: string; culoare: string }
interface Props { firma: Firma; lunaId: string; tasks: TaskDef[]; stari: ImpozitStare[] }

export default function ImpoziteModule({ firma, lunaId, tasks, stari }: Props) {
  const router = useRouter()
  const stariMap: Record<string, ImpozitStare> = {}
  for (const s of stari) stariMap[s.tip_key] = s

  const [rows, setRows] = useState<Record<string, ImpozitStare>>(
    Object.fromEntries(tasks.map(t => [t.key, stariMap[t.key] || { tip_key: t.key, suma: null, scadenta: null, platit: false }]))
  )
  const [saving, setSaving] = useState<string | null>(null)

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

  const totalSume = tasks.reduce((sum, t) => sum + (rows[t.key]?.suma || 0), 0)
  const totalRamas = tasks.reduce((sum, t) => sum + (rows[t.key]?.platit ? 0 : (rows[t.key]?.suma || 0)), 0)
  const r = parseInt(firma.culoare.slice(1,3),16) + ',' + parseInt(firma.culoare.slice(3,5),16) + ',' + parseInt(firma.culoare.slice(5,7),16)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1, background: '#111', border: '1px solid #1E1E1E', borderRadius: '12px', padding: '16px 18px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#777', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '6px' }}>Total impozite</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#FFF' }}>{totalSume.toLocaleString('ro-RO')} RON</div>
        </div>
        <div style={{ flex: 1, background: '#111', border: '1px solid #1E1E1E', borderRadius: '12px', padding: '16px 18px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#777', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '6px' }}>Rămas de plătit</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: totalRamas > 0 ? '#F59E0B' : '#6EE7B0' }}>{totalRamas.toLocaleString('ro-RO')} RON</div>
        </div>
      </div>

      <div style={{ background: '#111', border: '1px solid #1E1E1E', borderRadius: '12px', padding: '20px 22px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {tasks.map(task => {
            const row = rows[task.key]
            const isSaving = saving === task.key
            return (
              <div key={task.key} style={{
                display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
                padding: '12px', borderRadius: '10px',
                background: row.platit ? `rgba(${r},.06)` : '#161616',
                border: `1px solid ${row.platit ? `rgba(${r},.25)` : '#262626'}`,
                opacity: isSaving ? 0.6 : 1,
              }}>
                <button
                  onClick={() => save(task.key, { platit: !row.platit })}
                  disabled={isSaving}
                  style={{
                    width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0, cursor: 'pointer',
                    background: row.platit ? `rgba(${r},.15)` : '#1A1A1A',
                    border: row.platit ? `1.5px solid rgba(${r},.5)` : '1.5px solid #2A2A2A',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {row.platit && (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke={firma.culoare} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                <span style={{ flex: '1 1 220px', fontSize: '13px', fontWeight: 500, color: row.platit ? '#777' : '#DDD', textDecoration: row.platit ? 'line-through' : 'none' }}>
                  {task.label}
                </span>

                <input
                  type="number"
                  placeholder="Sumă (RON)"
                  defaultValue={row.suma ?? ''}
                  onBlur={e => save(task.key, { suma: e.target.value ? parseFloat(e.target.value) : null })}
                  style={{
                    width: '120px', background: '#0D0D0D', border: '1px solid #2A2A2A', borderRadius: '6px',
                    padding: '6px 10px', fontSize: '13px', color: '#FFF', outline: 'none',
                  }}
                />

                <input
                  type="date"
                  defaultValue={row.scadenta ?? ''}
                  onChange={e => save(task.key, { scadenta: e.target.value || null })}
                  style={{
                    background: '#0D0D0D', border: '1px solid #2A2A2A', borderRadius: '6px',
                    padding: '6px 10px', fontSize: '13px', color: '#CCC', outline: 'none',
                  }}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
