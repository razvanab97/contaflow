export default function Loading() {
  return (
    <main className="page">
      <div className="skeleton" style={{ width: '240px', height: '26px', marginBottom: '14px' }} />
      <div className="skeleton" style={{ width: '220px', height: '40px', marginBottom: '28px' }} />
      <div className="stat-grid" style={{ marginBottom: '28px' }}>
        <div className="skeleton" style={{ height: '96px', borderRadius: 'var(--r-lg)', gridColumn: 'span 2' }} />
        {[0, 1].map(i => <div key={i} className="skeleton" style={{ height: '96px', borderRadius: 'var(--r-lg)' }} />)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
        {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton" style={{ height: '84px', borderRadius: 0 }} />)}
      </div>
    </main>
  )
}
