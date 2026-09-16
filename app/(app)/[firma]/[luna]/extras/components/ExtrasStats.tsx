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
    <div style={{ display:'flex', alignItems:'center', gap:'20px', flexWrap:'wrap', padding:'12px 16px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', marginBottom:'16px', minHeight:'56px' }}>
      <div style={{ display:'flex', gap:'18px', flexWrap:'wrap', flexShrink:0 }}>
        <Stat label="Tranzacții" value={total} />
        <Stat label="Documentate" value={documentate} color="var(--success)" />
        <Stat label="Neasociate" value={neasociate} color="var(--purple)" />
        <Stat label="Ignorate" value={ignorate} color="var(--text-muted)" />
      </div>

      <div style={{ flex:1, minWidth:'120px', height:'4px', background:'var(--border-subtle)', borderRadius:'2px' }}>
        <div style={{ height:'4px', background:culoare, borderRadius:'2px', width:`${pct}%`, transition:'width .2s ease' }} />
      </div>
      <span style={{ fontSize:'12px', fontWeight:600, color:'var(--text-secondary)', flexShrink:0 }}>{pct}%</span>

      <div style={{ display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
        <button onClick={onExport} disabled={exportingDocs || documentate===0} style={{ fontSize:'11px', fontWeight:600, padding:'6px 12px', borderRadius:'7px', border:`1px solid ${documentate>0?culoare:'var(--border)'}`, background:'transparent', color:documentate>0?culoare:'var(--text-muted)', cursor:documentate>0?'pointer':'not-allowed', opacity:exportingDocs?.6:1 }}>
          {exportingDocs ? 'Se generează...' : `Descarcă documentele (${documentate}) ↓`}
        </button>
        {finalizat ? (
          <div style={{ display:'flex', alignItems:'center', gap:'6px', padding:'6px 10px', background:'var(--success-soft)', border:'1px solid var(--success)', borderRadius:'7px' }}>
            <span style={{ fontSize:'11px', fontWeight:600, color:'var(--success)' }}>✓ Finalizat</span>
            <button onClick={() => onToggleFinalizat(false)} disabled={finalizing} style={{ border:'none', background:'transparent', color:'var(--text-muted)', fontSize:'10px', cursor:'pointer', textDecoration:'underline' }}>anulează</button>
          </div>
        ) : overallGata ? (
          <button onClick={() => onToggleFinalizat(true)} disabled={finalizing} style={{ fontSize:'11px', fontWeight:700, padding:'6px 12px', borderRadius:'7px', border:`1px solid ${culoare}`, background:culoare, color:'var(--c-ffffff)', cursor:'pointer', opacity:finalizing?.6:1 }}>
            Marchează finalizat
          </button>
        ) : null}
      </div>
      {exportError && <p style={{ fontSize:'11px', color:'var(--danger)', width:'100%' }}>{exportError}</p>}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div style={{ fontSize:'9.5px', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>{label}</div>
      <div style={{ fontSize:'15px', fontWeight:700, color: color || 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}
