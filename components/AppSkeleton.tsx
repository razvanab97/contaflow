// Schelet generic (sidebar + conținut) afișat instant de Next.js la navigare, înainte ca
// datele reale să sosească de la Supabase - elimină ecranul alb/înghețat dintre click și randare.
export default function AppSkeleton({ maxWidth = '900px' }: { maxWidth?: string }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--c-0a0a0a)' }}>
      <aside style={{ width: '240px', flexShrink: 0, background: 'var(--c-0d0d0d)', borderRight: '1px solid var(--c-1a1a1a)' }} />
      <main style={{ flex: 1, padding: '44px 52px', maxWidth }}>
        <div style={{ width: '160px', height: '12px', borderRadius: '4px', background: 'var(--c-161616)', marginBottom: '16px' }} />
        <div style={{ width: '260px', height: '24px', borderRadius: '6px', background: 'var(--c-161616)', marginBottom: '28px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ height: '90px', borderRadius: '12px', background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)' }} />
          <div style={{ height: '140px', borderRadius: '12px', background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)' }} />
        </div>
      </main>
    </div>
  )
}
