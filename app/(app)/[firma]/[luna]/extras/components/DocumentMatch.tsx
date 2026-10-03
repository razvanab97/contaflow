'use client'
import type { ActiveSuggestion } from './types'

export default function DocumentMatch({ suggestion, busy, onConfirm }: { suggestion: ActiveSuggestion | null; busy: boolean; onConfirm: () => void }) {
  if (!suggestion) return null

  return (
    <div style={{ padding:'14px 16px', margin:'0 28px 16px', background:'var(--success-soft)', border:'1px solid var(--success)', borderRadius:'var(--r-md)' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:'10px', flexWrap:'wrap' }}>
        <svg width="16" height="16" fill="none" stroke="var(--success)" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink:0, marginTop:'2px' }}><path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5z"/></svg>
        <div style={{ flex:1, minWidth:'180px' }}>
          <div style={{ fontSize:'var(--fs-sm)', fontWeight:600, color:'var(--text-primary)' }}>✨ {suggestion.label}</div>
          <div style={{ fontSize:'var(--fs-xs)', color:'var(--text-secondary)', marginTop:'2px' }}>{suggestion.detaliu}</div>
          <div style={{ display:'flex', gap:'10px', marginTop:'6px', flexWrap:'wrap' }}>
            {suggestion.sumaPotrivita && <span style={{ fontSize:'var(--fs-xs)', fontWeight:600, color:'var(--success)' }}>✓ Sumă identică</span>}
            {suggestion.dataPotrivita && <span style={{ fontSize:'var(--fs-xs)', fontWeight:600, color:'var(--success)' }}>✓ Adăugată recent</span>}
          </div>
        </div>
        <button onClick={onConfirm} disabled={busy} style={{ fontSize:'var(--fs-sm)', fontWeight:600, padding:'7px 14px', borderRadius:'var(--r-sm)', border:'none', background:'var(--accent)', color:'#fff', cursor: busy ? 'wait' : 'pointer', opacity: busy ? .6 : 1, flexShrink:0 }}>
          {busy ? 'Se asociază...' : 'Asociază'}
        </button>
      </div>
    </div>
  )
}
