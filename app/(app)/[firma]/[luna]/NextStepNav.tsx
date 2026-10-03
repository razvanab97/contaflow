import Link from 'next/link'
import Icon from '@/components/ui/Icon'

// Bara fixă jos-dreapta de pe fiecare pagină de modul - arată explicit ce urmează, ca utilizatorul
// să nu mai trebuiască să-și amintească sau să ghicească ordinea de lucru a lunii. Pur navigare
// (nu blochează pe baza task-urilor bifate) - utilizatorul decide singur când un modul e gata.
export default function NextStepNav({ slug, luna, nextLabel, nextHref }: { slug: string; luna: string; nextLabel: string | null; nextHref: string | null }) {
  if (!nextHref || !nextLabel) {
    return (
      <div className="next-step">
        <Link
          href={`/${slug}/${luna}`}
          className="btn btn-lg"
          style={{ borderColor: 'color-mix(in srgb, var(--success) 45%, transparent)', background: 'var(--success-soft)', color: 'var(--success)', boxShadow: 'var(--shadow-md)' }}
        >
          <Icon name="check" size={16} strokeWidth={2.25} /> Ultimul pas al lunii — înapoi la rezumat
        </Link>
      </div>
    )
  }
  return (
    <div className="next-step">
      <Link href={nextHref} className="btn btn-primary btn-lg" style={{ boxShadow: 'var(--shadow-md)', maxWidth: '100%' }}>
        <span style={{ fontWeight: 500, opacity: .85 }}>Pasul următor:</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{nextLabel}</span>
        <Icon name="arrowRight" size={16} />
      </Link>
    </div>
  )
}
