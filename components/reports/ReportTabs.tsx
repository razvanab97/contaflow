export type ReportTab = 'editare' | 'previzualizare' | 'istoric' | 'fisiere'

const TABS: { id: ReportTab; label: string }[] = [
  { id: 'editare', label: 'Editare' },
  { id: 'previzualizare', label: 'Previzualizare' },
  { id: 'istoric', label: 'Istoric' },
  { id: 'fisiere', label: 'Fișier original' },
]

export default function ReportTabs({ active, onChange }: { active: ReportTab; onChange: (tab: ReportTab) => void }) {
  return (
    <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--c-1a1a1a)' }}>
      {TABS.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            fontSize: '13px', fontWeight: 600, padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
            color: active === t.id ? 'var(--c-eeeeee)' : 'var(--c-777777)',
            borderBottom: active === t.id ? '2px solid var(--accent-mint)' : '2px solid transparent',
            marginBottom: '-1px',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
