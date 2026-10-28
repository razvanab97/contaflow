'use client'
import type { DocumentFieldSchema, ListItem } from '@/lib/documentWorkspace/types'
import ReportListField from './ReportListField'
import css from './Report.module.css'

// "01.07.2026" <-> "2026-07-01" (input type=date foloseste ISO, documentul foloseste format RO)
function roToIso(ro: string): string {
  const m = ro.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}
function isoToRo(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ''
}
function splitRange(value: string): [string, string] {
  const [start, end] = value.split('–').map(s => s.trim())
  return [start || '', end || '']
}

interface Props {
  field: DocumentFieldSchema
  value: string | ListItem[]
  onChange: (value: string | ListItem[]) => void
}

export default function ReportField({ field, value, onChange }: Props) {
  if (field.type === 'list') {
    return <ReportListField items={Array.isArray(value) ? value : []} onChange={items => onChange(items)}/>
  }

  if (field.type === 'date-range') {
    const [start, end] = splitRange(typeof value === 'string' ? value : '')
    return (
      <div className={css.range}>
        <label className={css.label}>Data început<input className={css.input} type="date" value={roToIso(start)} onChange={e => onChange(`${isoToRo(e.target.value)} – ${end}`)}/></label>
        <label className={css.label}>Data sfârșit<input className={css.input} type="date" value={roToIso(end)} onChange={e => onChange(`${start} – ${isoToRo(e.target.value)}`)}/></label>
      </div>
    )
  }

  if (field.type === 'textarea') {
    return <textarea className={css.input} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} placeholder={field.placeholder}/>
  }

  // 'text' si fallback pentru tipuri nefolosite inca (richtext/select) - editare simpla de text
  return <input className={css.input} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} placeholder={field.placeholder}/>
}
