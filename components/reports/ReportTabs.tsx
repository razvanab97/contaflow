export type ReportTab = 'editare' | 'previzualizare' | 'istoric' | 'fisiere'

const TABS: { id: ReportTab; label: string }[] = [
  { id: 'editare', label: 'Editare' },
  { id: 'previzualizare', label: 'Previzualizare' },
  { id: 'istoric', label: 'Istoric' },
  { id: 'fisiere', label: 'Fișier original' },
]

export default function ReportTabs({ active, onChange }: { active: ReportTab; onChange: (tab: ReportTab) => void }) {
  return (
    <div role="tablist" aria-label="Vizualizare raport" style={{ display: 'flex', gap: '2px', padding: '4px', background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-full)', width: 'fit-content', maxWidth: '100%', minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
      {TABS.map(t => {
        const on = active === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            style={{
              fontSize: 'var(--fs-md)', fontWeight: 550, height: '32px', padding: '0 14px', border: 'none', borderRadius: 'var(--r-full)', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
              background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: on ? 'var(--shadow-sm)' : 'none',
              transition: 'background-color .15s, color .15s',
            }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
