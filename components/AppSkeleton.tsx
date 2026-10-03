// Schelet de continut afisat instant de Next.js la navigare, inainte ca datele reale sa
// soseasca de la Supabase - elimina ecranul alb/inghetat dintre click si randare. Sidebar-ul
// e persistent la nivel de shell (app/(app)/layout.tsx) si nu se remonteaza la navigare,
// deci nu mai are nevoie de schelet propriu aici.
export default function AppSkeleton({ maxWidth }: { maxWidth?: string }) {
  return (
    <main className="page" style={maxWidth ? { maxWidth } : undefined}>
      <div className="skeleton" style={{ width: '160px', height: '12px', marginBottom: '12px' }} />
      <div className="skeleton" style={{ width: '260px', height: '26px', marginBottom: '28px' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div className="skeleton" style={{ height: '90px', borderRadius: 'var(--r-lg)' }} />
        <div className="skeleton" style={{ height: '140px', borderRadius: 'var(--r-lg)' }} />
        <div className="skeleton" style={{ height: '140px', borderRadius: 'var(--r-lg)' }} />
      </div>
    </main>
  )
}
