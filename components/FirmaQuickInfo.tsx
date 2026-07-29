'use client'
import { useState } from 'react'
import CopyButton from './CopyButton'

interface Proprietar {
  id: string
  nume: string
  serie_ci: string | null
  numar_ci: string | null
}

interface Props {
  cui: string | null
  nrRegCom: string | null
  adresa: string | null
  judet: string | null
  tara: string | null
  proprietari: Proprietar[]
}

const FIELDS: { key: 'cui' | 'nrRegCom' | 'adresa' | 'judet' | 'tara'; label: string }[] = [
  { key: 'cui', label: 'CUI' },
  { key: 'nrRegCom', label: 'Nr. reg. ONRC' },
  { key: 'adresa', label: 'Adresă' },
  { key: 'judet', label: 'Județ' },
  { key: 'tara', label: 'Țară' },
]

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span title={label} style={{ width: '96px', flexShrink: 0, fontSize: '11px', color: '#777', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span title={value} style={{ flex: 1, minWidth: 0, fontSize: '12px', color: value ? '#CCC' : '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || '—'}</span>
      {value && <CopyButton value={value} />}
    </div>
  )
}

export default function FirmaQuickInfo({ cui, nrRegCom, adresa, judet, tara, proprietari }: Props) {
  const [open, setOpen] = useState(false)
  const values: Record<string, string | null> = { cui, nrRegCom, adresa, judet, tara }

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#888', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
          <path d="M9 18l6-6-6-6" />
        </svg>
        Date firmă
      </button>

      {open && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '7px', background: '#0D0D0D', border: '1px solid #1E1E1E', borderRadius: '8px', padding: '12px 14px' }}>
          {FIELDS.map(({ key, label }) => (
            <Row key={key} label={label} value={values[key] || ''} />
          ))}

          {proprietari.length > 0 && (
            <>
              <div style={{ height: '1px', background: '#1E1E1E', margin: '3px 0' }} />
              {proprietari.map(p => (
                <Row key={p.id} label={p.nume} value={`${p.serie_ci ?? ''} ${p.numar_ci ?? ''}`.trim()} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
