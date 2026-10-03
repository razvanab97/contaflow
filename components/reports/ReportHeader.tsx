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
    <div className="page-header" style={{ marginBottom: '18px' }}>
      <div className="page-header-main">
        <Link href={`/${firmaSlug}/${luna}`} onClick={() => onBeforeNavigate()} className="crumb-link" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--fs-sm)', margin: '0 0 8px -6px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
          Rezumatul lunii · {lunaLabel}
        </Link>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{firmaNume}</p>
      </div>
      <div className="page-header-actions" style={{ gap: '14px' }}>
        <ReportAutosaveStatus status={saveStatus} savedAt={savedAt}/>
        <MonthSwitcher slug={firmaSlug} luna={luna} lunaLabel={lunaLabel} modulSlug={modulSlug} onBeforeNavigate={onBeforeNavigate}/>
      </div>
    </div>
  )
}
