'use client'
import { memo } from 'react'
import type { Tx } from './types'
import { txStatus } from './types'

const STATUS_LABEL: Record<ReturnType<typeof txStatus>, string> = {
  neasociata: 'Neasociată',
  asociata: 'Asociată',
  ignorata: 'Ignorată',
}
const STATUS_COLOR: Record<ReturnType<typeof txStatus>, string> = {
  neasociata: 'var(--purple)',
  asociata: 'var(--success)',
  ignorata: 'var(--text-muted)',
}

function TransactionRowImpl({ tx, isSelected, onClick }: { tx: Tx; isSelected: boolean; onClick: () => void }) {
  const status = txStatus(tx)
  const label = tx.documente?.furnizor || tx.descriere_curatata || tx.descriere
  const data = new Date(tx.data_tranzactie).toLocaleDateString('ro-RO', { day:'2-digit', month:'short' })

  return (
    <button
      onClick={onClick}
      data-tx-id={tx.id}
      style={{
        display:'flex', alignItems:'center', gap:'10px', width:'100%', textAlign:'left',
        padding:'10px 14px', border:'none', borderBottom:'1px solid var(--border-subtle)',
        background: isSelected ? 'var(--selected)' : 'transparent',
        cursor:'pointer', transition:'background .12s ease',
      }}
    >
      <span style={{ fontSize:'11px', fontWeight:600, color:'var(--text-muted)', flexShrink:0, width:'40px' }}>{data}</span>
      <span style={{ flex:1, minWidth:0, fontSize:'13px', fontWeight: tx.documente?.furnizor ? 600 : 500, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {label}
      </span>
      <span style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'2px', flexShrink:0 }}>
        <span style={{ fontSize:'13px', fontWeight:700, color:'var(--text-primary)' }}>
          {tx.tip==='credit'?'+':'-'}{tx.suma.toFixed(2)} {tx.valuta}
        </span>
        <span style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'10px', fontWeight:600, color:STATUS_COLOR[status] }}>
          <span style={{ width:'5px', height:'5px', borderRadius:'50%', background:STATUS_COLOR[status], flexShrink:0 }} />
          {STATUS_LABEL[status]}
        </span>
      </span>
    </button>
  )
}

export default memo(TransactionRowImpl)
