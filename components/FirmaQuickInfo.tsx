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
      <span title={label} style={{ width: '96px', flexShrink: 0, fontSize: '11px', color: 'var(--c-777777)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span title={value} style={{ flex: 1, minWidth: 0, fontSize: '12px', color: value ? 'var(--c-cccccc)' : 'var(--c-555555)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || '—'}</span>
      {value && <CopyButton value={value} />}
    </div>
  )
}

export default function FirmaQuickInfo({ cui, nrRegCom, adresa, judet, tara, proprietari }: Props) {
  const values: Record<string, string | null> = { cui, nrRegCom, adresa, judet, tara }

  return (
    <div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--c-888888)', marginBottom: '10px' }}>
        Date firmă
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-1e1e1e)', borderRadius: '8px', padding: '12px 14px' }}>
        {FIELDS.map(({ key, label }) => (
          <Row key={key} label={label} value={values[key] || ''} />
        ))}

        {proprietari.length > 0 && (
          <>
            <div style={{ height: '1px', background: 'var(--c-1e1e1e)', margin: '3px 0' }} />
            {proprietari.map(p => (
              <Row key={p.id} label={p.nume} value={`${p.serie_ci ?? ''} ${p.numar_ci ?? ''}`.trim()} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
