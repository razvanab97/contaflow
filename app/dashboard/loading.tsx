export default function Loading() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--c-0a0a0a)' }}>
      <aside style={{ width: '240px', flexShrink: 0, background: 'var(--c-0d0d0d)', borderRight: '1px solid var(--c-1a1a1a)' }} />
      <main style={{ flex: 1, padding: '44px 52px' }}>
        <div style={{ width: '180px', height: '12px', borderRadius: '4px', background: 'var(--c-161616)', marginBottom: '16px' }} />
        <div style={{ width: '220px', height: '28px', borderRadius: '6px', background: 'var(--c-161616)', marginBottom: '40px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))', gap: '12px' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ height: '260px', borderRadius: '16px', background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)' }} />
          ))}
        </div>
      </main>
    </div>
  )
}
