'use client'
import type { Tx } from './types'
import { CAT, shortReference } from './types'
import CopyButton from '@/components/CopyButton'

export default function TransactionDetails({ tx, index, total }: { tx: Tx; index: number; total: number }) {
  const cat = tx.categorie ? CAT[tx.categorie] || CAT.altele : CAT.altele
  const data = new Date(tx.data_tranzactie).toLocaleDateString('ro-RO', { day:'2-digit', month:'long', year:'numeric' })

  return (
    <div style={{ padding:'24px 28px', borderBottom:'1px solid var(--border-subtle)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
        <span style={{ fontSize:'11px', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>Tranzacția {index + 1} din {total}</span>
        <span style={{ fontSize:'11px', fontWeight:600, padding:'3px 9px', borderRadius:'20px', background:cat.bg, color:cat.c }}>{tx.categorie || 'altele'}</span>
      </div>

      <div style={{ fontSize:'30px', fontWeight:800, color:'var(--text-primary)', letterSpacing:'-0.5px', marginBottom:'16px' }}>
        {tx.tip==='credit' ? '+' : '-'}{tx.suma?.toFixed(2)} {tx.valuta}
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
        <div style={{ padding:'12px 16px', background: tx.documente?.furnizor ? 'var(--purple-soft)' : 'var(--surface-secondary)', border:`1px solid ${tx.documente?.furnizor ? 'var(--purple)' : 'var(--border)'}`, borderRadius:'10px' }}>
          <div style={{ fontSize:'10px', fontWeight:700, color: tx.documente?.furnizor ? 'var(--purple)' : 'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'4px' }}>
            {tx.documente?.furnizor ? 'Furnizor' : 'Entitate (extras bancă)'}
          </div>
          <div style={{ fontSize:'15px', fontWeight:700, color:'var(--text-primary)', lineHeight:'1.3', wordBreak:'break-word' }}>
            {tx.documente?.furnizor || tx.descriere_curatata || tx.descriere}
          </div>
          {tx.documente?.furnizor && (
            <div style={{ fontSize:'11px', color:'var(--text-secondary)', marginTop:'5px', wordBreak:'break-word' }}>{tx.descriere_curatata || tx.descriere}</div>
          )}
        </div>

        {!tx.documente?.furnizor && tx.descriere_curatata && tx.descriere_curatata !== tx.descriere && (
          <div>
            <div style={{ fontSize:'10px', fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'2px' }}>Descriere originală</div>
            <div style={{ fontSize:'11px', color:'var(--text-muted)', lineHeight:'1.4', wordBreak:'break-word' }}>{tx.descriere}</div>
          </div>
        )}

        <div style={{ display:'flex', gap:'24px', flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:'10px', fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'3px' }}>Data tranzacție</div>
            <div style={{ fontSize:'13px', color:'var(--text-primary)', fontWeight:500 }}>{data}</div>
          </div>
          {tx.referinta && (
            <div>
              <div style={{ fontSize:'10px', fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'3px' }}>Referință bancară</div>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <div style={{ fontSize:'13px', fontWeight:600, color:'var(--text-primary)', fontFamily:'monospace', wordBreak:'break-all' }}>{shortReference(tx.referinta)}</div>
                <CopyButton value={shortReference(tx.referinta)} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
