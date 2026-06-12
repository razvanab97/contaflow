'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface TaskItem {
  key: string
  label: string
  completat: boolean
}

interface Props {
  tasks: TaskItem[]
  lunaId: string
  culoare: string
}

export default function TaskSection({ tasks, lunaId, culoare }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(tasks)
  const [loading, setLoading] = useState<string | null>(null)

  async function toggle(key: string) {
    const current = items.find(t => t.key === key)
    if (!current || loading) return
    const next = !current.completat
    setLoading(key)
    setItems(prev => prev.map(t => t.key === key ? { ...t, completat: next } : t))
    const res = await fetch('/api/tasks/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lunaId, taskKey: key, completat: next }),
    })
    if (!res.ok) {
      setItems(prev => prev.map(t => t.key === key ? { ...t, completat: !next } : t))
    } else {
      router.refresh()
    }
    setLoading(null)
  }

  const done = items.filter(t => t.completat).length
  const total = items.length
  const r = parseInt(culoare.slice(1,3),16) + ',' + parseInt(culoare.slice(3,5),16) + ',' + parseInt(culoare.slice(5,7),16)

  return (
    <div style={{ background: '#111', border: '1px solid #1E1E1E', borderRadius: '12px', padding: '20px 22px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#3A3A3A', textTransform: 'uppercase', letterSpacing: '.1em' }}>
          Task-uri modul
        </span>
        <span style={{ fontSize: '12px', fontWeight: 600, color: done === total ? '#4ADE80' : culoare }}>
          {done}/{total}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.map(task => (
          <button
            key={task.key}
            onClick={() => toggle(task.key)}
            disabled={loading === task.key}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '6px 0', textAlign: 'left', width: '100%',
              opacity: loading === task.key ? 0.5 : 1,
            }}
          >
            <div style={{
              width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
              background: task.completat ? `rgba(${r},.12)` : '#1A1A1A',
              border: task.completat ? `1.5px solid rgba(${r},.4)` : '1.5px solid #2A2A2A',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all .15s',
            }}>
              {task.completat && (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke={culoare} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span style={{
              fontSize: '13px', fontWeight: 500,
              color: task.completat ? '#555' : '#CCC',
              textDecoration: task.completat ? 'line-through' : 'none',
            }}>
              {task.label}
            </span>
          </button>
        ))}
      </div>

      {done === total && (
        <div style={{ marginTop: '14px', padding: '8px 12px', background: 'rgba(74,222,128,.06)', borderRadius: '8px', border: '1px solid rgba(74,222,128,.15)' }}>
          <span style={{ fontSize: '12px', color: '#4ADE80', fontWeight: 500 }}>✓ Modul complet</span>
        </div>
      )}
    </div>
  )
}
