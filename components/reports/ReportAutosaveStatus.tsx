export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export default function ReportAutosaveStatus({ status, savedAt }: { status: SaveStatus; savedAt: Date | null }) {
  if (status === 'idle' && !savedAt) return null

  const label =
    status === 'saving' ? 'Se salvează...' :
    status === 'error' ? 'Eroare la salvare' :
    savedAt ? `Salvat ${timeAgo(savedAt)}` : 'Nesalvat'

  const color =
    status === 'saving' ? 'var(--c-999999)' :
    status === 'error' ? 'var(--accent-red)' :
    'var(--accent-mint)'

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, color }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, flexShrink: 0, opacity: status === 'saving' ? 0.6 : 1 }}/>
      {label}
    </span>
  )
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 10) return 'acum'
  if (s < 60) return `acum ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `acum ${m} min`
  const h = Math.floor(m / 60)
  return `acum ${h} h`
}
