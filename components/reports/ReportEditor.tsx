'use client'
import { useEffect, useRef, useState } from 'react'
import type { DocumentTemplate, ListItem } from '@/lib/documentWorkspace/types'
import ReportSection from './ReportSection'
import ReportField from './ReportField'
import type { ReportExtraSection } from '@/lib/documentWorkspace/reportSections'
import css from './Report.module.css'

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
  sections: ReportExtraSection[]
  onSectionsChange: (sections: ReportExtraSection[]) => void
  activeField: string
  onFieldFocus: (key: string) => void
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
        style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '2px 6px', outline: 'none' }}
      />
    )
  }
  return (
    <button onClick={() => { setDraft(value); setEditing(true) }} title="Redenumește" style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'text', padding: 0, textAlign: 'left' }}>
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
  sections, onSectionsChange, activeField, onFieldFocus,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const fields = editorRef.current?.querySelectorAll<HTMLElement>('[data-editor-field]')
    fields?.forEach(field => {
      const active = field.dataset.editorField === activeField
      // Campul activ e evidentiat de cardul sectiunii (:focus-within); aici doar derulam la el.
      if (active && !editorRef.current?.contains(document.activeElement)) field.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }, [activeField])
  if (!sablonConfigurat) {
    return (
      <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: 'var(--r-lg)', padding: '20px 22px' }}>
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-666666)', marginBottom: '14px', lineHeight: 1.6 }}>
          Detectez automat, în documentul din stânga, secțiunile care se schimbă lunar — o singură dată, apoi le completezi de aici, fără să mai deschizi Word.
        </p>
        <button onClick={onConfigure} disabled={configuring} style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, padding: '9px 16px', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--accent-solid)', color: '#fff', cursor: 'pointer', opacity: configuring ? .6 : 1 }}>
          {configuring ? 'Se configurează...' : 'Configurează formularul din documentul curent'}
        </button>
        {configureError && <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)', marginTop: '10px' }}>{configureError}</p>}
      </div>
    )
  }

  return (
    <div ref={editorRef} onFocusCapture={event => {
      const field = (event.target as HTMLElement).closest<HTMLElement>('[data-editor-field]')
      if (field?.dataset.editorField) onFieldFocus(field.dataset.editorField)
    }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {template.sections.map((section, sIdx) => {
        const lista = section.fields.length === 1 && section.fields[0].type === 'list' ? values[section.fields[0].key] : null
        return (
        <ReportSection key={section.id} nr={sIdx + 1} count={Array.isArray(lista) ? lista.filter(i => i.text.trim()).length : undefined} title={section.title} description={section.description} collapsible={section.collapsible}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {section.fields.map(field => (
              <div key={field.id} data-editor-field={field.key} style={{ borderRadius: 'var(--r-sm)' }}><ReportField field={field} value={values[field.key] ?? (field.type === 'list' ? [] : '')} onChange={v => onFieldChange(field.key, v)}/></div>
            ))}
          </div>
        </ReportSection>
        )
      })}

      {custom.length > 0 && (
        <ReportSection nr="+" title="Câmpuri suplimentare" description='Aceste informații vor fi incluse în raport.'>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {custom.map(c => (
              <div key={c.id} data-editor-field={`custom:${c.id}`} style={{ borderRadius: 'var(--r-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <EditableLabel value={c.eticheta} onCommit={v => onCustomLabelChange(c.id, v)}/>
                  <button onClick={() => onCustomDelete(c.id, c.eticheta)} title="Șterge câmpul (textul rămâne fix, la valoarea curentă)" style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
                    ✕ Șterge
                  </button>
                </div>
                <input className={css.input} value={c.valoare} onChange={e => onCustomChange(c.id, e.target.value)} />
              </div>
            ))}
          </div>
        </ReportSection>
      )}

      {sections.map(section => (
        <ReportSection key={section.id} title={section.title || 'Secțiune nouă'} description="Inclusă în raport, înainte de semnătură" onDelete={() => onSectionsChange(sections.filter(s => s.id !== section.id))}>
          <div data-editor-field={`section:${section.id}:title`} style={{ borderRadius: 'var(--r-sm)', marginBottom: '10px' }}>
            <label className={css.label}>Titlul secțiunii
              <input value={section.title} onChange={e => onSectionsChange(sections.map(s => s.id === section.id ? { ...s, title: e.target.value } : s))} maxLength={300} className={css.input} style={{ marginTop: 5 }}/>
            </label>
          </div>
          <div data-editor-field={`section:${section.id}:content`} style={{ borderRadius: 'var(--r-sm)' }}>
            <label className={css.label}>Conținut
              <textarea value={section.content} onChange={e => onSectionsChange(sections.map(s => s.id === section.id ? { ...s, content: e.target.value } : s))} maxLength={20000} className={css.input} style={{ marginTop: 5 }}/>
            </label>
          </div>
        </ReportSection>
      ))}

      {template.allowCustomSections && (
        <button type="button" className={css.ghostBtn} disabled={sections.length >= 30} onClick={() => onSectionsChange([...sections, { id: crypto.randomUUID(), title: 'Secțiune nouă', content: '' }])}>
          + Adaugă secțiune
        </button>
      )}

      <button type="button" className={css.primary} onClick={onGenerate} disabled={generating}>
        {generating ? 'Se salvează...' : 'Salvează raportul'}
      </button>
    </div>
  )
}
