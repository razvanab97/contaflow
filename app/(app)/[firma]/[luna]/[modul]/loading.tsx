export default function Loading() {
  return (
    <main style={{ flex:1, padding:'44px 52px', maxWidth:'1300px' }}>
      <div style={{ marginBottom:'32px' }}>
        <div style={{ width:'160px', height:'12px', borderRadius:'4px', background:'var(--c-161616)', marginBottom:'16px' }}/>
        <div style={{ width:'240px', height:'24px', borderRadius:'6px', background:'var(--c-161616)', marginBottom:'10px' }}/>
        <div style={{ width:'320px', height:'14px', borderRadius:'4px', background:'var(--c-141414)', marginLeft:'22px' }}/>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
        <div style={{ height:'90px', borderRadius:'12px', background:'var(--c-111111)', border:'1px solid var(--c-1e1e1e)' }}/>
        <div style={{ height:'140px', borderRadius:'12px', background:'var(--c-111111)', border:'1px solid var(--c-1e1e1e)' }}/>
      </div>
    </main>
  )
}
