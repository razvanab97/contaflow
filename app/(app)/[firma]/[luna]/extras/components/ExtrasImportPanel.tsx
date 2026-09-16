'use client'
import UploadExtras from '../UploadExtras'
import type { Extras } from './types'

export default function ExtrasImportPanel({
  open, onClose, extrase, firmaId, lunaId, culoare, onDone, unlockCode, newSlots, onAddSlot,
}: {
  open: boolean; onClose: () => void
  extrase: Extras[]
  firmaId: string; lunaId: string; culoare: string
  onDone: () => void
  unlockCode?: string
  newSlots: number; onAddSlot: () => void
}) {
  if (!open) return null

  return (
    <div style={{ position:'fixed', inset:0, zIndex:60, display:'flex', justifyContent:'flex-end' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.35)' }} />
      <div className="glass-floating" style={{ position:'relative', width:'min(560px, 92vw)', height:'100%', overflowY:'auto', padding:'28px', borderLeft:'1px solid var(--border)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'18px' }}>
          <h2 style={{ fontSize:'15px', fontWeight:700, color:'var(--text-primary)' }}>Importă extras</h2>
          <button onClick={onClose} style={{ fontSize:'14px', color:'var(--text-muted)', background:'transparent', border:'none', cursor:'pointer' }}>✕</button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
          {extrase.map(e => (
            <UploadExtras key={e.id} extrasId={e.id} valuta={e.valuta||'RON'} firmaId={firmaId} lunaId={lunaId}
              extras={e} culoare={culoare} onDone={onDone} unlockCode={unlockCode}/>
          ))}
          {!extrase.some(e => e.valuta==='RON') && (
            <UploadExtras key="ron-empty" valuta="RON" firmaId={firmaId} lunaId={lunaId} extras={null} culoare={culoare} onDone={onDone} unlockCode={unlockCode}/>
          )}
          {!extrase.some(e => e.valuta==='EUR') && (
            <UploadExtras key="eur-empty" valuta="EUR" firmaId={firmaId} lunaId={lunaId} extras={null} culoare={culoare} onDone={onDone} unlockCode={unlockCode}/>
          )}
          {Array.from({length:newSlots}).map((_,i) => (
            <UploadExtras key={`new-${i}`} valuta="AUTO" firmaId={firmaId} lunaId={lunaId} extras={null} culoare={culoare}
              onDone={onDone} unlockCode={unlockCode}/>
          ))}
          <button onClick={onAddSlot} style={{ padding:'12px', border:'1px solid var(--border)', borderRadius:'10px', background:'var(--surface-secondary)', color:'var(--text-secondary)', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
            + Adaugă cont
          </button>
        </div>
      </div>
    </div>
  )
}
