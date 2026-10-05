'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export interface TaskItem {
  key: string
  label: string
  completat: boolean
  descriere?: string
  important?: boolean
}

interface Props {
  tasks: TaskItem[]
  lunaId: string
  culoare: string
  onItemsChange?: (items: TaskItem[]) => void
}

export default function TaskSection({ tasks, lunaId, culoare, onItemsChange }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(tasks)
  const [loading, setLoading] = useState<string | null>(null)
  const [celebrate, setCelebrate] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setItems(tasks) }, [tasks])

  function updateItems(updater: (items: TaskItem[]) => TaskItem[]) {
    setItems(prev => {
      const next = updater(prev)
      onItemsChange?.(next)
      return next
    })
  }

  async function toggle(key: string) {
    const current = items.find(t => t.key === key)
    if (!current || loading) return
    const next = !current.completat
    setLoading(key)
    updateItems(prev => prev.map(t => t.key === key ? { ...t, completat: next } : t))
    const res = await fetch('/api/tasks/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lunaId, taskKey: key, completat: next }),
    })
    if (!res.ok) {
      updateItems(prev => prev.map(t => t.key === key ? { ...t, completat: !next } : t))
    } else {
      // Ultima bifa a modulului -> moment de "gata": puls pe card + notificare + confetti discret.
      const doneAfter = items.filter(t => (t.key === key ? next : t.completat)).length
      if (next && doneAfter === items.length && items.length > 0) {
        setCelebrate(true)
        setTimeout(() => setCelebrate(false), 1900)
        window.dispatchEvent(new CustomEvent('cf:toast', { detail: { text: 'Modul complet — toate task-urile sunt bifate.', tone: 'success', confetti: true } }))
      }
      router.refresh()
    }
    setLoading(null)
  }

  const done = items.filter(t => t.completat).length
  const total = items.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  // Checklist-ul modulului: bife mari (tinta usoara pe mobil), progres vizibil, stare "complet"
  // integrata in antet in loc de un bloc separat sub lista.
  return (
    <div ref={cardRef} className={`card${celebrate ? ' celebrate' : ''}`} style={{ padding: '16px 16px 10px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <span className="eyebrow" style={{ flexShrink: 0 }}>Task-uri modul</span>
        <div className={`progress${done === total ? ' is-done' : ''}`} style={{ flex: 1, maxWidth: '160px' }}><span style={{ width: `${pct}%` }} /></div>
        <span style={{ marginLeft: 'auto', flexShrink: 0 }} className={done === total ? 'badge badge-success' : 'badge'}>
          {done === total ? `✓ Modul complet · ${done}/${total}` : `${done}/${total}`}
        </span>
      </div>

      <div role="list" style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map(task => (
          <button
            key={task.key}
            role="listitem"
            aria-pressed={task.completat}
            onClick={() => toggle(task.key)}
            disabled={loading === task.key}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '12px',
              background: task.important && !task.completat ? 'var(--accent-soft)' : 'transparent',
              border: task.important ? `1.5px solid ${task.completat ? 'var(--border)' : 'var(--accent)'}` : 'none',
              padding: task.important ? '12px' : '8px 8px', margin: task.important ? '6px -8px' : '0 -8px', borderRadius: 'var(--r-md)', textAlign: 'left', width: 'calc(100% + 16px)',
              opacity: loading === task.key ? 0.5 : 1,
            }}
          >
            <div style={{
              width: '18px', height: '18px', borderRadius: 'var(--r-xs)', flexShrink: 0, marginTop: '1px',
              background: task.completat ? 'var(--success)' : 'var(--surface)',
              border: task.completat ? '1.5px solid var(--success)' : '1.5px solid var(--border-hover)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background-color .15s, border-color .15s',
            }}>
              {task.completat && (
                <svg className="check-pop" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 6l3 3 5-5" stroke="var(--surface)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              {task.important && (
                <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: task.completat ? 'var(--text-muted)' : 'var(--accent)', marginBottom: '3px' }}>
                  {task.completat ? '✓ Important · contabilitate' : '⚠ Important · contabilitate'}
                </div>
              )}
              <span style={{
                fontSize: 'var(--fs-md)', fontWeight: task.important ? 700 : 500,
                color: task.completat ? 'var(--text-muted)' : 'var(--text-primary)',
                textDecoration: task.completat ? 'line-through' : 'none',
              }}>
                {task.label}
              </span>
              {task.descriere && (
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.45 }}>
                  {task.descriere}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
