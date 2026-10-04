'use client'
import { useState } from 'react'
import type { Tx } from './types'
import { CAT, shortReference } from './types'
import CopyButton from '@/components/CopyButton'

export default function TransactionDetails({ tx, index, total, onRefresh }: { tx: Tx; index: number; total: number; onRefresh?: () => void }) {
  const cat = tx.categorie ? CAT[tx.categorie] || CAT.altele : CAT.altele
  const [citire, setCitire] = useState<'idle' | 'busy' | 'gol' | 'eroare'>('idle')
  // Textul complet al tranzactiei din extras (comerciant, oras, nr. comanda, cod plata, IBAN) -
  // lipseste la extrasele PDF importate inainte ca importul sa-l pastreze.
  const areDetalii = !!tx.descriere && tx.descriere !== tx.descriere_curatata
  async function citesteDetalii() {
    setCitire('busy')
    const r = await fetch('/api/extras/detalii', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ extrasId: tx.extras_id }) }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    if (!r?.ok) { setCitire('eroare'); return }
    setCitire(d.actualizate ? 'idle' : 'gol')
    if (d.actualizate) onRefresh?.()
  }
  const data = new Date(tx.data_tranzactie).toLocaleDateString('ro-RO', { day:'2-digit', month:'long', year:'numeric' })

  return (
    <div style={{ padding:'24px 28px', borderBottom:'1px solid var(--border-subtle)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
        <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>Tranzacția {index + 1} din {total}</span>
        <span style={{ fontSize:'var(--fs-xs)', fontWeight:600, padding:'3px 9px', borderRadius:'var(--r-full)', background:cat.bg, color:cat.c }}>{tx.categorie || 'altele'}</span>
      </div>

      <div style={{ fontSize:'30px', fontWeight:800, color:'var(--text-primary)', letterSpacing:'-0.5px', marginBottom:'16px' }}>
        {tx.tip==='credit' ? '+' : '-'}{tx.suma?.toFixed(2)} {tx.valuta}
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
        <div style={{ padding:'12px 16px', background: tx.documente?.furnizor ? 'var(--purple-soft)' : 'var(--surface-secondary)', border:`1px solid ${tx.documente?.furnizor ? 'var(--purple)' : 'var(--border)'}`, borderRadius:'var(--r-md)' }}>
          <div style={{ fontSize:'var(--fs-xs)', fontWeight:700, color: tx.documente?.furnizor ? 'var(--purple)' : 'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'4px' }}>
            {tx.documente?.furnizor ? 'Furnizor' : 'Entitate (extras bancă)'}
          </div>
          <div style={{ fontSize:'var(--fs-lg)', fontWeight:700, color:'var(--text-primary)', lineHeight:'1.3', wordBreak:'break-word' }}>
            {tx.documente?.furnizor || tx.descriere_curatata || tx.descriere}
          </div>
          {tx.documente?.furnizor && (
            <div style={{ fontSize:'var(--fs-xs)', color:'var(--text-secondary)', marginTop:'5px', wordBreak:'break-word' }}>{tx.descriere_curatata || tx.descriere}</div>
          )}
        </div>

        {areDetalii ? (
          <div style={{ padding:'10px 14px', background:'var(--surface)', border:'1px dashed var(--border)', borderRadius:'var(--r-md)' }}>
            <div style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'4px' }}>Detalii din extras</div>
            <div style={{ fontSize:'var(--fs-sm)', color:'var(--text-secondary)', lineHeight:'1.45', wordBreak:'break-word' }}>{tx.descriere}</div>
          </div>
        ) : onRefresh && (
          <div>
            <button onClick={citesteDetalii} disabled={citire === 'busy'} style={{ fontSize:'var(--fs-xs)', fontWeight:600, padding:'6px 12px', borderRadius:'var(--r-sm)', border:'1px solid var(--border)', background:'transparent', color:'var(--accent)', cursor: citire === 'busy' ? 'wait' : 'pointer' }}>
              {citire === 'busy' ? 'Citesc extrasul...' : 'Citește detaliile complete din extras'}
            </button>
            {citire === 'gol' && <span style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)', marginLeft:'8px' }}>Extrasul nu are alte detalii pentru această tranzacție.</span>}
            {citire === 'eroare' && <span style={{ fontSize:'var(--fs-xs)', color:'var(--danger)', marginLeft:'8px' }}>Detaliile nu au putut fi citite.</span>}
          </div>
        )}

        <div style={{ display:'flex', gap:'24px', flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:'var(--fs-xs)', fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'3px' }}>Data tranzacție</div>
            <div style={{ fontSize:'var(--fs-md)', color:'var(--text-primary)', fontWeight:500 }}>{data}</div>
          </div>
          {tx.referinta && (
            <div>
              <div style={{ fontSize:'var(--fs-xs)', fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'3px' }}>Referință bancară</div>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <div style={{ fontSize:'var(--fs-md)', fontWeight:600, color:'var(--text-primary)', fontFamily:'monospace', wordBreak:'break-all' }}>{shortReference(tx.referinta)}</div>
                <CopyButton value={shortReference(tx.referinta)} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
