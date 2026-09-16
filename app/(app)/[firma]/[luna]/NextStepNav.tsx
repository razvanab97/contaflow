import Link from 'next/link'

// Bara fixă jos-dreapta de pe fiecare pagină de modul - arată explicit ce urmează, ca utilizatorul
// să nu mai trebuiască să-și amintească sau să ghicească ordinea de lucru a lunii. Pur navigare
// (nu blochează pe baza task-urilor bifate) - utilizatorul decide singur când un modul e gata.
export default function NextStepNav({ slug, luna, nextLabel, nextHref }: { slug: string; luna: string; nextLabel: string | null; nextHref: string | null }) {
  if (!nextHref || !nextLabel) {
    return (
      <div style={{ position: 'sticky', bottom: '20px', display: 'flex', justifyContent: 'flex-end', marginTop: '32px' }}>
        <Link
          href={`/${slug}/${luna}`}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, padding: '10px 18px', borderRadius: '10px', border: '1px solid var(--success)', background: 'var(--success-soft)', color: 'var(--success)', textDecoration: 'none', boxShadow: 'var(--shadow-md)' }}
        >
          🎉 Ultimul pas al lunii - înapoi la rezumat
        </Link>
      </div>
    )
  }
  return (
    <div style={{ position: 'sticky', bottom: '20px', display: 'flex', justifyContent: 'flex-end', marginTop: '32px' }}>
      <Link
        href={nextHref}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, padding: '10px 18px', borderRadius: '10px', border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', textDecoration: 'none', boxShadow: 'var(--shadow-md)' }}
      >
        Pasul următor: {nextLabel} →
      </Link>
    </div>
  )
}
