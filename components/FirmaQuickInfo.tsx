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
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '28px' }}>
      <span title={label} style={{ width: '104px', flexShrink: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span title={value} style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-md)', color: value ? 'var(--text-primary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || '—'}</span>
      {value && <CopyButton value={value} />}
    </div>
  )
}

export default function FirmaQuickInfo({ cui, nrRegCom, adresa, judet, tara, proprietari }: Props) {
  const values: Record<string, string | null> = { cui, nrRegCom, adresa, judet, tara }

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: '8px' }}>
        Date firmă
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', padding: '8px 8px 8px 12px' }}>
        {FIELDS.map(({ key, label }) => (
          <Row key={key} label={label} value={values[key] || ''} />
        ))}

        {proprietari.length > 0 && (
          <>
            <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '4px 0' }} />
            {proprietari.map(p => (
              <Row key={p.id} label={p.nume} value={`${p.serie_ci ?? ''} ${p.numar_ci ?? ''}`.trim()} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
