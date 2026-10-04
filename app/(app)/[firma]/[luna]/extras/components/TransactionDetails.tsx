'use client'
import { useState } from 'react'
import type { Tx } from './types'
import { CAT, shortReference } from './types'
import CopyButton from '@/components/CopyButton'

// Detaliile brute din extras (un rand lung, separat prin ";") -> randuri lizibile, cu sumele, codurile
// si IBAN-urile evidentiate, plus campurile utile extrase separat, fiecare cu buton de copiere.
const CAMPURI: { label: string; re: RegExp }[] = [
  { label: 'Valoare', re: /valoare tranzac[tț]ie:?\s*([\d.,]+\s*[A-Z]{3})/i },
  { label: 'Comision', re: /comision tranzac[tț]ie:?\s*([\d.,]+\s*[A-Z]{3})/i },
  { label: 'IBAN', re: /\b([A-Z]{2}\d{2}[A-Z]{4}[A-Z0-9]{12,20})\b/ },
  { label: 'Data', re: /\b(\d{2}[./]\d{2}[./]\d{4})\b/ },
  { label: 'TID', re: /\bTID:\s*(\S+)/i },
  { label: 'RRN', re: /\bRRN:\s*(\S+)/i },
  { label: 'Referință', re: /\b(?:ref(?:erinta)?|nr\.? comanda|comanda)[:.]?\s*([A-Z0-9-]{5,})/i },
]
const EVIDENTIAT = /(\b[A-Z]{2}\d{2}[A-Z]{4}[A-Z0-9]{12,20}\b|\b\d+[.,]\d{2}\s*(?:RON|EUR|USD|HUF|BGN)\b|\b(?:TID|RRN):\s*\S+|\b\d{2}[./]\d{2}[./]\d{4}\b)/g

function campuriDetalii(text: string) {
  const out: { label: string; valoare: string }[] = []
  for (const c of CAMPURI) { const m = text.match(c.re); if (m?.[1] && !out.some(x => x.valoare === m[1])) out.push({ label: c.label, valoare: m[1].trim() }) }
  return out
}

function RandEvidentiat({ text }: { text: string }) {
  const parti = text.split(EVIDENTIAT)
  return <>{parti.map((p, i) => i % 2 === 1
    ? <span key={i} style={{ fontWeight:700, color:'var(--text-primary)', fontFamily: /^\d/.test(p) && !/RON|EUR|USD|HUF|BGN/.test(p) ? 'inherit' : /[A-Z]{2}\d{2}[A-Z]{4}|TID|RRN/.test(p) ? 'monospace' : 'inherit', background:'var(--surface-sunken)', padding:'0 4px', borderRadius:'var(--r-xs)' }}>{p}</span>
    : <span key={i}>{p}</span>)}</>
}

function DetaliiExtras({ text }: { text: string }) {
  const randuri = text.split(';').map(x => x.replace(/\bOD null\b/gi, '').replace(/\s+/g, ' ').trim()).filter(x => x && x.toLowerCase() !== 'null')
  const campuri = campuriDetalii(text)
  return (
    <div style={{ padding:'14px 16px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-md)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px', marginBottom:'8px' }}>
        <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>Detalii din extras</span>
        <span style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'var(--fs-xs)', color:'var(--text-muted)' }}>Copiază tot <CopyButton value={text} /></span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
        {randuri.map((r, i) => (
          <div key={i} style={{ fontSize:'var(--fs-md)', color:'var(--text-secondary)', lineHeight:'1.6', wordBreak:'break-word', paddingLeft: i ? '10px' : 0, borderLeft: i ? '2px solid var(--border)' : 'none' }}>
            <RandEvidentiat text={r} />
          </div>
        ))}
      </div>
      {campuri.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', marginTop:'12px', paddingTop:'12px', borderTop:'1px dashed var(--border)' }}>
          {campuri.map(c => (
            <div key={c.label + c.valoare} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'4px 4px 4px 10px', background:'var(--surface-secondary)', border:'1px solid var(--border-subtle)', borderRadius:'var(--r-md)' }}>
              <span style={{ fontSize:'var(--fs-xs)', fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.04em' }}>{c.label}</span>
              <span style={{ fontSize:'var(--fs-md)', fontWeight:650, color:'var(--text-primary)', fontFamily: c.label === 'Valoare' || c.label === 'Comision' || c.label === 'Data' ? 'inherit' : 'monospace', wordBreak:'break-all' }}>{c.valoare}</span>
              <CopyButton value={c.valoare} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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
          <DetaliiExtras text={tx.descriere!} />
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
