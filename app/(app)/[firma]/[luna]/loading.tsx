export default function Loading() {
  return (
    <main style={{ flex: 1, padding: '44px 52px', maxWidth: '1400px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '36px' }}>
        <div style={{ width:'220px', height:'22px', borderRadius:'6px', background:'var(--c-161616)' }}/>
        <div style={{ width:'70px', height:'32px', borderRadius:'6px', background:'var(--c-161616)' }}/>
      </div>
      <div style={{ height:'2px', background:'var(--c-1a1a1a)', borderRadius:'2px', marginBottom:'36px' }}/>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:'12px' }}>
        {[0,1,2,3,4,5].map(i => (
          <div key={i} style={{ height:'96px', borderRadius:'12px', background:'var(--c-111111)', border:'1px solid var(--c-1e1e1e)' }}/>
        ))}
      </div>
    </main>
  )
}
