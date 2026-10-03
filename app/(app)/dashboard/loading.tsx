export default function Loading() {
  return (
    <main className="page">
      <div className="skeleton" style={{ width: '200px', height: '12px', marginBottom: '12px' }} />
      <div className="skeleton" style={{ width: '220px', height: '30px', marginBottom: '28px' }} />
      <div className="stat-grid" style={{ marginBottom: '28px' }}>
        {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '96px', borderRadius: 'var(--r-lg)' }} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: '12px' }}>
        {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '300px', borderRadius: 'var(--r-lg)' }} />)}
      </div>
    </main>
  )
}
