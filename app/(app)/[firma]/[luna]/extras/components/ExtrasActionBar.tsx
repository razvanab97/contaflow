'use client'

export default function ExtrasActionBar({
  index, total, isDone, isNA, onPrev, onNext, onSkip, onUnskip,
  onAssociatePrimary, associateDisabled, associateBusy, culoare,
}: {
  index: number; total: number
  isDone: boolean; isNA: boolean
  onPrev?: () => void; onNext?: () => void
  onSkip: () => void; onUnskip: () => void
  onAssociatePrimary?: () => void
  associateDisabled: boolean
  associateBusy: boolean
  culoare: string
}) {
  const BTN: React.CSSProperties = { fontSize:'13px', fontWeight:600, padding:'10px 16px', borderRadius:'8px', border:'none', cursor:'pointer', transition:'all .15s' }

  return (
    <div className="glass-floating" style={{ display:'flex', alignItems:'center', gap:'10px', padding:'12px 16px', borderTop:'1px solid var(--border)', flexWrap:'wrap' }}>
      <button disabled={!onPrev} onClick={onPrev} style={{ ...BTN, background:'var(--surface-secondary)', border:'1px solid var(--border)', color:onPrev?'var(--text-primary)':'var(--text-muted)', cursor:onPrev?'pointer':'not-allowed' }}>
        ← Anterioară
      </button>

      <span style={{ fontSize:'12px', fontWeight:600, color:'var(--text-muted)', flex:1, textAlign:'center', minWidth:'80px' }}>
        {index + 1} din {total}
      </span>

      {!isDone && (
        isNA ? (
          <button onClick={onUnskip} style={{ ...BTN, background:'var(--surface-secondary)', border:'1px solid var(--border)', color:'var(--text-secondary)' }}>Reactivează</button>
        ) : (
          <button onClick={onSkip} style={{ ...BTN, background:'var(--surface-secondary)', border:'1px solid var(--border)', color:'var(--text-secondary)' }}>Ignoră</button>
        )
      )}

      {onAssociatePrimary && (
        <button onClick={onAssociatePrimary} disabled={associateDisabled || associateBusy} style={{ ...BTN, background: associateDisabled ? 'var(--surface-secondary)' : 'var(--success)', color: associateDisabled ? 'var(--text-muted)' : 'var(--c-0a0a0a)', cursor: associateDisabled ? 'not-allowed' : associateBusy ? 'wait' : 'pointer', opacity: associateBusy ? .7 : 1 }}>
          {associateBusy ? 'Se asociază...' : 'Asociază și următoarea →'}
        </button>
      )}

      <button disabled={!onNext} onClick={onNext} style={{ ...BTN, background:'var(--surface-secondary)', border:'1px solid var(--border)', color:onNext?'var(--text-primary)':'var(--text-muted)', cursor:onNext?'pointer':'not-allowed' }}>
        Înainte →
      </button>
    </div>
  )
}
