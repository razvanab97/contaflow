'use client'
import type { DocumentFieldSchema, ListItem } from '@/lib/documentWorkspace/types'
import ReportListField from './ReportListField'

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', fontSize: '14px', color: 'var(--c-dddddd)', background: 'var(--c-0d0d0d)',
  border: '1px solid var(--c-2a2a2a)', borderRadius: '8px', padding: '9px 12px', outline: 'none', fontFamily: 'inherit',
}

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
      <div style={{ display: 'flex', gap: '10px' }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '11px', color: 'var(--c-777777)', display: 'block', marginBottom: '4px' }}>Data început</span>
          <input type="date" value={roToIso(start)} onChange={e => onChange(`${isoToRo(e.target.value)} – ${end}`)} style={INPUT_STYLE}/>
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '11px', color: 'var(--c-777777)', display: 'block', marginBottom: '4px' }}>Data sfârșit</span>
          <input type="date" value={roToIso(end)} onChange={e => onChange(`${start} – ${isoToRo(e.target.value)}`)} style={INPUT_STYLE}/>
        </div>
      </div>
    )
  }

  if (field.type === 'textarea') {
    return <textarea value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} style={{ ...INPUT_STYLE, minHeight: '80px', resize: 'vertical', lineHeight: 1.5 }}/>
  }

  // 'text' si fallback pentru tipuri nefolosite inca (richtext/select) - editare simpla de text
  return <input value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} style={INPUT_STYLE}/>
}
