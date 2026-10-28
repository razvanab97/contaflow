'use client'
import { useEffect, useRef, useState } from 'react'
import type { ListItem } from '@/lib/documentWorkspace/types'
import css from './Report.module.css'

const nouId = () => `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

// Lista editabila rapida: Enter = rand nou sub cel curent (cu cursorul mutat acolo), Backspace pe un rand
// gol = il sterge si urca, ↑/↓ = treci intre randuri, ⋮⋮ = trage pentru reordonare.
export default function ReportListField({ items, onChange }: { items: ListItem[]; onChange: (items: ListItem[]) => void }) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})
  const [focusId, setFocusId] = useState<string | null>(null)
  useEffect(() => { if (focusId) { inputs.current[focusId]?.focus(); setFocusId(null) } }, [focusId, items])

  const update = (id: string, text: string) => onChange(items.map(i => i.id === id ? { ...i, text } : i))
  const remove = (id: string) => onChange(items.filter(i => i.id !== id))
  function insertAfter(idx: number) {
    const nou = { id: nouId(), text: '' }
    onChange([...items.slice(0, idx + 1), nou, ...items.slice(idx + 1)]); setFocusId(nou.id)
  }
  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return
    const next = [...items]; const [m] = next.splice(from, 1); next.splice(to, 0, m); onChange(next)
  }
  function onKey(e: React.KeyboardEvent<HTMLInputElement>, idx: number, item: ListItem) {
    if (e.key === 'Enter') { e.preventDefault(); insertAfter(idx) }
    else if (e.key === 'Backspace' && !item.text && items.length > 1) { e.preventDefault(); remove(item.id); setFocusId(items[Math.max(0, idx - 1)]?.id === item.id ? items[idx + 1]?.id : items[Math.max(0, idx - 1)].id) }
    else if (e.key === 'ArrowUp' && idx > 0) { e.preventDefault(); inputs.current[items[idx - 1].id]?.focus() }
    else if (e.key === 'ArrowDown' && idx < items.length - 1) { e.preventDefault(); inputs.current[items[idx + 1].id]?.focus() }
  }

  return (
    <div className={css.list}>
      {items.map((item, idx) => (
        <div key={item.id} className={css.row} data-drag={dragIdx === idx} draggable
          onDragStart={() => setDragIdx(idx)} onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); if (dragIdx != null) move(dragIdx, idx); setDragIdx(null) }} onDragEnd={() => setDragIdx(null)}>
          <span className={css.grip} title="Trage pentru a reordona" aria-hidden>⋮⋮</span>
          <span className={css.idx}>{idx + 1}.</span>
          <input ref={el => { inputs.current[item.id] = el }} className={css.rowInput} value={item.text} onChange={e => update(item.id, e.target.value)} onKeyDown={e => onKey(e, idx, item)} placeholder="Scrie aici…" aria-label={`Rândul ${idx + 1}`} />
          <button type="button" className={css.rm} onClick={() => remove(item.id)} title="Șterge rândul" aria-label={`Șterge rândul ${idx + 1}`}>×</button>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className={css.add} onClick={() => insertAfter(items.length - 1)}>+ Adaugă rând</button>
        {items.length > 0 && <span className={css.tip}>Enter = rând nou · Backspace pe rând gol = șterge</span>}
      </div>
    </div>
  )
}
