'use client'
import type { Extras } from './types'

export default function ExtrasHeader({
  firmaNume, lunaLabel, culoare,
  pageTab, onPageTabChange,
  extrase, activeExtrasId, onSelectExtras, onOpenImport,
}: {
  firmaNume: string; lunaLabel: string; culoare: string
  pageTab: 'extras'|'facturi'|'note'; onPageTabChange: (t: 'extras'|'facturi'|'note') => void
  extrase: Extras[]; activeExtrasId: string; onSelectExtras: (id: string) => void
  onOpenImport: () => void
}) {
  return (
    <div style={{ marginBottom:'16px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'2px' }}>
        <div style={{ width:'9px', height:'9px', borderRadius:'50%', background:culoare }} />
        <h1 style={{ fontSize:'19px', fontWeight:700, color:'var(--text-primary)' }}>Extras de cont</h1>
      </div>
      <p style={{ fontSize:'12.5px', color:'var(--text-secondary)', marginLeft:'17px', marginBottom:'14px' }}>{firmaNume} · {lunaLabel}</p>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'10px' }}>
        <div className="glass-surface" style={{ display:'flex', padding:'3px', borderRadius:'10px', gap:'3px', width:'fit-content' }}>
          {([['extras','Extras de cont'],['facturi','Facturi + chitanță'],['note','Note']] as const).map(([t,l]) => (
            <button key={t} onClick={() => onPageTabChange(t)} style={{ padding:'7px 16px', borderRadius:'7px', border:'none', cursor:'pointer', fontSize:'12px', fontWeight:700, background:pageTab===t?culoare:'transparent', color:pageTab===t?'var(--c-ffffff)':'var(--text-secondary)' }}>{l}</button>
          ))}
        </div>

        {pageTab === 'extras' && (
          <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
            {extrase.map(e => (
              <button key={e.id} onClick={() => onSelectExtras(e.id)} style={{ padding:'7px 12px', borderRadius:'8px', border:`1px solid ${activeExtrasId===e.id?culoare:'var(--border)'}`, background:activeExtrasId===e.id?culoare:'var(--surface)', color:activeExtrasId===e.id?'var(--c-ffffff)':'var(--text-secondary)', cursor:'pointer', fontSize:'11.5px', fontWeight:700 }}>
                {e.valuta}{e.iban ? ` ····${e.iban.slice(-6)}` : ''}
              </button>
            ))}
            <button onClick={onOpenImport} style={{ padding:'7px 12px', borderRadius:'8px', border:`1px solid ${culoare}`, background:'transparent', color:culoare, cursor:'pointer', fontSize:'11.5px', fontWeight:700 }}>
              ↑ Importă extras
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
