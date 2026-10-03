'use client'

export default function ExtrasStats({
  total, documentate, neasociate, ignorate, pct,
  finalizat, finalizing, onToggleFinalizat, overallGata,
  onExport, exportingDocs, exportError, culoare,
}: {
  total: number; documentate: number; neasociate: number; ignorate: number; pct: number
  finalizat: boolean; finalizing: boolean; onToggleFinalizat: (v: boolean) => void; overallGata: boolean
  onExport: () => void; exportingDocs: boolean; exportError: string
  culoare: string
}) {
  if (total === 0) return null
  return (
    <div className="card" style={{ display:'flex', alignItems:'center', gap:'16px 24px', flexWrap:'wrap', padding:'12px 16px', marginBottom:'16px', minHeight:'60px' }}>
      <div style={{ display:'flex', gap:'18px', flexWrap:'wrap', flexShrink:0 }}>
        <Stat label="Tranzacții" value={total} />
        <Stat label="Documentate" value={documentate} color="var(--success)" />
        <Stat label="Neasociate" value={neasociate} color="var(--purple)" />
        <Stat label="Ignorate" value={ignorate} color="var(--text-muted)" />
      </div>

      <div style={{ flex:1, minWidth:'120px', display:'flex', alignItems:'center', gap:'10px' }}>
        <div className={`progress${pct === 100 ? ' is-done' : ''}`} style={{ flex:1 }}><span style={{ width:`${pct}%` }} /></div>
        <span style={{ fontSize:'var(--fs-md)', fontWeight:600, color:'var(--text-primary)', flexShrink:0 }}>{pct}%</span>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
        <button onClick={onExport} disabled={exportingDocs || documentate===0} className="btn btn-sm" style={{ color:documentate>0?'var(--text-primary)':'var(--text-muted)', opacity:exportingDocs?.6:1 }}>
          {exportingDocs ? 'Se generează...' : `Descarcă documentele (${documentate}) ↓`}
        </button>
        {finalizat ? (
          <div className="badge badge-success" style={{ height:'28px', padding:'0 4px 0 10px', gap:'6px' }}>
            <span>✓ Finalizat</span>
            <button onClick={() => onToggleFinalizat(false)} disabled={finalizing} style={{ border:'none', background:'transparent', color:'var(--text-muted)', fontSize:'var(--fs-xs)', textDecoration:'underline', padding:'2px 6px', borderRadius:'var(--r-xs)' }}>anulează</button>
          </div>
        ) : overallGata ? (
          <button onClick={() => onToggleFinalizat(true)} disabled={finalizing} className="btn btn-sm btn-primary" style={{ opacity:finalizing?.6:1 }}>
            Marchează finalizat
          </button>
        ) : null}
      </div>
      {exportError && <p role="alert" style={{ fontSize:'var(--fs-sm)', color:'var(--danger)', width:'100%' }}>{exportError}</p>}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div style={{ fontSize:'var(--fs-lg)', fontWeight:650, color: color || 'var(--text-primary)', marginTop:'2px' }}>{value}</div>
    </div>
  )
}
