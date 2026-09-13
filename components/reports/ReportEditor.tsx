'use client'
import { useState } from 'react'
import type { DocumentTemplate, ListItem } from '@/lib/documentWorkspace/types'
import ReportSection from './ReportSection'
import ReportField from './ReportField'

export interface CampCustom { id: string; cheie: string; eticheta: string; valoare: string }

interface Props {
  template: DocumentTemplate
  sablonConfigurat: boolean
  configuring: boolean
  onConfigure: () => void
  values: Record<string, string | ListItem[]>
  onFieldChange: (key: string, value: string | ListItem[]) => void
  custom: CampCustom[]
  onCustomChange: (id: string, valoare: string) => void
  onCustomLabelChange: (id: string, eticheta: string) => void
  onCustomDelete: (id: string, eticheta: string) => void
  onGenerate: () => void
  generating: boolean
  configureError: string
}

function EditableLabel({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (editing) {
    return (
      <input
        autoFocus value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft.trim() && draft !== value) onCommit(draft.trim()) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
        style={{ fontSize: '11px', fontWeight: 600, color: 'var(--c-999999)', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '5px', padding: '2px 6px', outline: 'none' }}
      />
    )
  }
  return (
    <button onClick={() => { setDraft(value); setEditing(true) }} title="Redenumește" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--c-999999)', background: 'transparent', border: 'none', cursor: 'text', padding: 0, textAlign: 'left' }}>
      {value}
    </button>
  )
}

// Randeaza formularul pornind DOAR de la schema (template) - niciun cod de aici nu stie ca
// documentul e "raport lunar AB Textile"; alt document viitor ar folosi acelasi component
// cu alt DocumentTemplate.
export default function ReportEditor({
  template, sablonConfigurat, configuring, onConfigure, values, onFieldChange,
  custom, onCustomChange, onCustomLabelChange, onCustomDelete, onGenerate, generating, configureError,
}: Props) {
  if (!sablonConfigurat) {
    return (
      <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', padding: '20px 22px' }}>
        <p style={{ fontSize: '12px', color: 'var(--c-666666)', marginBottom: '14px', lineHeight: 1.6 }}>
          Detectez automat, în documentul din stânga, secțiunile care se schimbă lunar — o singură dată, apoi le completezi de aici, fără să mai deschizi Word.
        </p>
        <button onClick={onConfigure} disabled={configuring} style={{ fontSize: '12px', fontWeight: 600, padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--accent-mint)', color: 'var(--c-0a0a0a)', cursor: 'pointer', opacity: configuring ? .6 : 1 }}>
          {configuring ? 'Se configurează...' : 'Configurează formularul din documentul curent'}
        </button>
        {configureError && <p style={{ fontSize: '11px', color: 'var(--accent-red)', marginTop: '10px' }}>{configureError}</p>}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {template.sections.map(section => (
        <ReportSection key={section.id} title={section.title} description={section.description} collapsible={section.collapsible}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {section.fields.map(field => (
              <ReportField key={field.id} field={field} value={values[field.key] ?? (field.type === 'list' ? [] : '')} onChange={v => onFieldChange(field.key, v)}/>
            ))}
          </div>
        </ReportSection>
      ))}

      {custom.length > 0 && (
        <ReportSection title="Câmpuri suplimentare" description='Aceste informații vor fi incluse în raport.'>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {custom.map(c => (
              <div key={c.id}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <EditableLabel value={c.eticheta} onCommit={v => onCustomLabelChange(c.id, v)}/>
                  <button onClick={() => onCustomDelete(c.id, c.eticheta)} title="Șterge câmpul (textul rămâne fix, la valoarea curentă)" style={{ fontSize: '10px', fontWeight: 600, color: 'var(--accent-red)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
                    ✕ Șterge
                  </button>
                </div>
                <input
                  value={c.valoare}
                  onChange={e => onCustomChange(c.id, e.target.value)}
                  style={{ width: '100%', fontSize: '14px', color: 'var(--c-dddddd)', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '8px', padding: '9px 12px', outline: 'none' }}
                />
              </div>
            ))}
          </div>
        </ReportSection>
      )}

      {/* Documentul nu suporta inca sectiuni noi arbitrare - butonul e ascuns complet, nu doar dezactivat */}
      {template.allowCustomSections && (
        <button style={{ fontSize: '12px', fontWeight: 600, color: 'var(--c-777777)', background: 'transparent', border: '1px dashed var(--c-2a2a2a)', borderRadius: '10px', padding: '10px', cursor: 'pointer' }}>
          + Adaugă secțiune
        </button>
      )}

      <button
        onClick={onGenerate} disabled={generating}
        style={{ fontSize: '14px', fontWeight: 600, padding: '12px', borderRadius: '10px', border: 'none', background: 'var(--accent-mint)', color: 'var(--c-0a0a0a)', cursor: 'pointer', opacity: generating ? .6 : 1, marginTop: '4px' }}
      >
        {generating ? 'Se generează...' : 'Generează raportul →'}
      </button>
    </div>
  )
}
