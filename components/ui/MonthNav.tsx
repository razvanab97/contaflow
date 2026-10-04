import Link from 'next/link'
import Icon from './Icon'
import { accountingPeriodLabel, accountingWorkLabel, workMonthLabel } from '@/lib/accounting-period'
import { esteLunaCalendaristica } from '@/lib/firma-config'

function shift(luna: string, delta: number) {
  const d = new Date(luna + '-01')
  d.setMonth(d.getMonth() + delta)
  return d.toISOString().slice(0, 7)
}

// Comutator compact de luna contabila (◀ perioada ▶), comun hub-ului si paginilor de modul.
// `suffix` pastreaza sub-pagina curenta (ex. "/extras") la schimbarea lunii.
export default function MonthNav({ slug, luna, suffix = '' }: { slug: string; luna: string; suffix?: string }) {
  const calendar = esteLunaCalendaristica(slug)
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '2px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', maxWidth: '100%' }}>
      <Link href={`/${slug}/${shift(luna, -1)}${suffix}`} prefetch aria-label="Luna anterioară" className="btn btn-ghost btn-icon btn-sm">
        <Icon name="chevronLeft" />
      </Link>
      <div style={{ padding: '0 8px', textAlign: 'center', minWidth: 0, lineHeight: 1.2 }}>
        <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{calendar ? workMonthLabel(luna) : accountingPeriodLabel(luna)}</div>
        {!calendar && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{accountingWorkLabel(luna)}</div>}
      </div>
      <Link href={`/${slug}/${shift(luna, 1)}${suffix}`} prefetch aria-label="Luna următoare" className="btn btn-ghost btn-icon btn-sm">
        <Icon name="chevronRight" />
      </Link>
    </div>
  )
}
