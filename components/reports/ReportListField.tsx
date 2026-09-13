'use client'
import { useState } from 'react'
import type { ListItem } from '@/lib/documentWorkspace/types'

const ROW_STYLE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--c-0d0d0d)',
  border: '1px solid var(--c-2a2a2a)', borderRadius: '8px', padding: '2px 4px 2px 10px',
}
const INPUT_STYLE: React.CSSProperties = {
  flex: 1, minWidth: 0, fontSize: '13px', color: 'var(--c-dddddd)', background: 'transparent',
  border: 'none', outline: 'none', padding: '8px 0',
}

export default function ReportListField({ items, onChange }: { items: ListItem[]; onChange: (items: ListItem[]) => void }) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  function update(id: string, text: string) {
    onChange(items.map(i => i.id === id ? { ...i, text } : i))
  }
  function remove(id: string) {
    onChange(items.filter(i => i.id !== id))
  }
  function add() {
    onChange([...items, { id: `i${Date.now().toString(36)}`, text: '' }])
  }
  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {items.map((item, idx) => (
        <div
          key={item.id}
          style={{ ...ROW_STYLE, opacity: dragIdx === idx ? 0.4 : 1 }}
          draggable
          onDragStart={() => setDragIdx(idx)}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); if (dragIdx != null) move(dragIdx, idx); setDragIdx(null) }}
          onDragEnd={() => setDragIdx(null)}
        >
          <span style={{ cursor: 'grab', color: 'var(--c-555555)', fontSize: '13px', flexShrink: 0, userSelect: 'none' }} title="Trage pentru a reordona">⋮⋮</span>
          <input value={item.text} onChange={e => update(item.id, e.target.value)} placeholder="Text..." style={INPUT_STYLE}/>
          <button onClick={() => remove(item.id)} title="Șterge" style={{ width: '24px', height: '24px', flexShrink: 0, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--c-666666)', fontSize: '15px', lineHeight: 1 }}>×</button>
        </div>
      ))}
      <button
        onClick={add}
        style={{ alignSelf: 'flex-start', fontSize: '12px', fontWeight: 600, color: 'var(--accent-mint)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0' }}
      >
        + Adaugă
      </button>
    </div>
  )
}
