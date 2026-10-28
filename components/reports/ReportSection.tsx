'use client'
import { useState } from 'react'
import css from './Report.module.css'

interface Props {
  title: string
  description?: string
  collapsible?: boolean
  defaultOpen?: boolean
  onDelete?: () => void
  nr?: number | string
  count?: number
  children: React.ReactNode
}

// Reordonarea SECTIUNILOR nu e oferita: ordinea reflecta pozitia reala din sablonul Word
// (detectata dupa text-ancora) - a le amesteca in UI n-ar schimba ordinea in documentul generat.
export default function ReportSection({ title, description, collapsible = true, defaultOpen = true, onDelete, nr, count, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={css.section}>
      <div role={collapsible ? 'button' : undefined} tabIndex={collapsible ? 0 : undefined} aria-expanded={collapsible ? open : undefined}
        className={css.head} data-static={!collapsible}
        onClick={() => collapsible && setOpen(o => !o)}
        onKeyDown={e => { if (collapsible && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setOpen(o => !o) } }}>
        {nr !== undefined && <span className={css.nr}>{nr}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={css.title}>{title}</div>
          {description && <div className={css.desc}>{description}</div>}
        </div>
        {count !== undefined && <span className={css.count}>{count} {count === 1 ? 'rând' : 'rânduri'}</span>}
        {onDelete && <button type="button" className={css.del} onClick={e => { e.stopPropagation(); onDelete() }} title="Șterge secțiunea" aria-label="Șterge secțiunea">✕</button>}
        {collapsible && <svg className={css.chev} data-open={open} width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden><path d="M6 9l6 6 6-6"/></svg>}
      </div>
      {open && <div className={css.body}>{children}</div>}
    </section>
  )
}
