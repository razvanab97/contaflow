import Link from 'next/link'
import MonthSwitcher from './MonthSwitcher'
import ReportAutosaveStatus, { SaveStatus } from './ReportAutosaveStatus'

interface Props {
  firmaNume: string
  firmaSlug: string
  luna: string
  lunaLabel: string
  modulSlug: string
  title: string
  saveStatus: SaveStatus
  savedAt: Date | null
  onBeforeNavigate: () => void
}

export default function ReportHeader({ firmaNume, firmaSlug, luna, lunaLabel, modulSlug, title, saveStatus, savedAt, onBeforeNavigate }: Props) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--c-666666)', marginBottom: '10px', flexWrap: 'wrap' }}>
        <Link href="/dashboard" style={{ color: 'inherit', textDecoration: 'none' }}>Proiecte</Link>
        <span>›</span>
        <Link href={`/${firmaSlug}/${luna}`} style={{ color: 'inherit', textDecoration: 'none' }}>{firmaNume}</Link>
        <span>›</span>
        <span>{lunaLabel}</span>
        <span>›</span>
        <span style={{ color: 'var(--c-999999)' }}>{title}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--c-ffffff)', letterSpacing: '-0.5px', lineHeight: 1.2 }}>{title}</h1>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--c-777777)', textTransform: 'uppercase', letterSpacing: '.08em', marginTop: '4px' }}>{firmaNume}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
          <ReportAutosaveStatus status={saveStatus} savedAt={savedAt}/>
          <MonthSwitcher slug={firmaSlug} luna={luna} lunaLabel={lunaLabel} modulSlug={modulSlug} onBeforeNavigate={onBeforeNavigate}/>
        </div>
      </div>
    </div>
  )
}
