// Schelet de continut afisat instant de Next.js la navigare, inainte ca datele reale sa
// soseasca de la Supabase - elimina ecranul alb/inghetat dintre click si randare. Sidebar-ul
// e persistent la nivel de shell (app/(app)/layout.tsx) si nu se remonteaza la navigare,
// deci nu mai are nevoie de schelet propriu aici.
export default function AppSkeleton({ maxWidth = '900px' }: { maxWidth?: string }) {
  return (
    <main style={{ flex: 1, padding: '44px 52px', maxWidth }}>
      <div style={{ width: '160px', height: '12px', borderRadius: '4px', background: 'var(--c-161616)', marginBottom: '16px' }} />
      <div style={{ width: '260px', height: '24px', borderRadius: '6px', background: 'var(--c-161616)', marginBottom: '28px' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ height: '90px', borderRadius: '12px', background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)' }} />
        <div style={{ height: '140px', borderRadius: '12px', background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)' }} />
      </div>
    </main>
  )
}
