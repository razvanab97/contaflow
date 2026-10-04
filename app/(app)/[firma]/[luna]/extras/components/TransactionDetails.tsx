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

// Codul BIC al bancii (din ordinele de plata) -> numele bancii.
const BANCI: Record<string, string> = {
  BTRL: 'Banca Transilvania', INGB: 'ING Bank', RNCB: 'BCR', BRDE: 'BRD', RZBR: 'Raiffeisen Bank', BACX: 'UniCredit Bank',
  CECE: 'CEC Bank', TREZ: 'Trezoreria Statului', OTPV: 'OTP Bank', PIRB: 'First Bank', BREL: 'Libra Internet Bank',
  CARP: 'Patria Bank', EGNA: 'Vista Bank', BPOS: 'Banca Românească', REVO: 'Revolut', BUCU: 'Alpha Bank', WBAN: 'Intesa Sanpaolo',
  CITI: 'Citibank', DABA: 'Garanti BBVA', MIND: 'ProCredit Bank', UGBI: 'Garanti BBVA', PORL: 'Porsche Bank',
}
const RE_IBAN = /^[A-Z]{2}\d{2}[A-Z]{4}[A-Z0-9]{12,20}$/
const RE_BIC = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/

// Ordin de plata / incasare OP (format BT: "Operatie Order N;detalii plata;beneficiar;IBAN;BIC;BIC;"):
// fiecare segment primeste o eticheta, ca sa fie clar ce inseamna fiecare valoare.
function campuriOrdin(text: string, contraparte: string | null, credit: boolean) {
  // "pay;out" = cuvantul "payout" rupt de banca cu separatorul ";" (incasarile Airbnb)
  const seg = text.replace(/pay;out/gi, 'payout').split(';').map(x => x.replace(/\s+/g, ' ').trim()).filter(x => x && x.toLowerCase() !== 'null')
  if (seg.length < 3 || !seg.some(x => RE_IBAN.test(x) || RE_BIC.test(x))) return null
  const out: { label: string; valoare: string; nota?: string }[] = []
  const ord = seg[0].match(/^(.*?)\s*Order\s+(\S+)$/i)
  const cif = seg[0].match(/^(.*?)\s*C\.?I\.?F\.?:?\s*(RO)?(\d{2,10})$/i)
  const payout = !ord && !cif ? seg[0].match(/^(.*?)\s*payout\s+(\d+)$/i) : null
  out.push({ label: 'Operațiune', valoare: ord ? ord[1] : cif ? cif[1] : payout ? payout[1] : seg[0] })
  if (payout) out.push({ label: 'Nr. payout', valoare: payout[2] })
  if (ord) out.push({ label: 'Nr. ordin', valoare: ord[2] })
  if (cif) out.push({ label: `CIF ${credit ? 'plătitor' : 'beneficiar'}`, valoare: cif[3] })
  const ct = (contraparte || '').toLowerCase()
  const banci = new Set<string>()
  for (const x of seg.slice(1)) {
    if (RE_IBAN.test(x)) out.push({ label: `IBAN ${credit ? 'plătitor' : 'beneficiar'}`, valoare: x, nota: BANCI[x.slice(4, 8)] })
    else if (RE_BIC.test(x)) { const b = BANCI[x.slice(0, 4)]; if (!banci.has(x)) { banci.add(x); out.push({ label: 'Banca (BIC)', valoare: x, nota: b }) } }
    else if (ct && x.toLowerCase() === ct) out.push({ label: credit ? 'Plătitor' : 'Beneficiar', valoare: x })
    else if (/^\/+(ROC|RFB|REF)\//i.test(x)) out.push({ label: 'Referință plată', valoare: x.replace(/^\/+(ROC|RFB|REF)\//i, ''), nota: x.match(/^\/+(\w+)/)?.[1]?.toUpperCase() === 'RFB' ? 'referința beneficiarului (ex. nr. plată Booking)' : undefined })
    else if (/^\/\d{5,}$/.test(x)) out.push({ label: `Cont ${credit ? 'plătitor' : 'beneficiar'}`, valoare: x.slice(1) })
    else if (!out.some(o => o.label === 'Beneficiar' || o.label === 'Plătitor') && /\b(SRL|S\.R\.L|SA|S\.A|PFA|II|SCS|ASOCIATIA|LTD|GMBH)\b/i.test(x)) out.push({ label: credit ? 'Plătitor' : 'Beneficiar', valoare: x })
    else out.push({ label: 'Detalii plată', valoare: x, nota: /^\w{1,15}$/.test(x) ? 'textul scris la plată — adesea numărul facturii' : undefined })
  }
  return out
}

interface Fragment { pagina: number; totalPagini: number; fragment: string[]; referinta: string | null; pdfUrl: string }

function DetaliiExtras({ text, tx }: { text: string; tx: Tx }) {
  const randuri = text.split(';').map(x => x.replace(/\bOD null\b/gi, '').replace(/\s+/g, ' ').trim()).filter(x => x && x.toLowerCase() !== 'null')
  const ordin = campuriOrdin(text, tx.descriere_curatata || null, tx.tip === 'credit')
  const campuri = campuriDetalii(text).filter(c => !ordin || !['IBAN', 'Referință'].includes(c.label))
  const [frag, setFrag] = useState<Fragment | null>(null)
  const [fragStare, setFragStare] = useState<'idle' | 'busy' | 'ascuns'>('idle')
  const [fragEroare, setFragEroare] = useState<{ mesaj: string; pdfUrl?: string } | null>(null)

  async function veziComplet() {
    if (frag) { setFragStare(s => s === 'ascuns' ? 'idle' : 'ascuns'); return }
    setFragStare('busy'); setFragEroare(null)
    const r = await fetch(`/api/extras/fragment?txId=${encodeURIComponent(tx.id)}`).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    if (r?.ok) setFrag(d); else setFragEroare({ mesaj: d.error || 'Fragmentul nu a putut fi citit', pdfUrl: d.pdfUrl })
    setFragStare('idle')
  }
  return (
    <div style={{ padding:'14px 16px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-md)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px', marginBottom:'8px' }}>
        <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>Detalii din extras</span>
        <span style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'var(--fs-xs)', color:'var(--text-muted)' }}>Copiază tot <CopyButton value={text} /></span>
      </div>
      {ordin ? (
        <div style={{ display:'grid', gridTemplateColumns:'minmax(110px, max-content) 1fr', gap:'6px 14px', alignItems:'baseline' }}>
          {ordin.map((c, i) => (
            <div key={i} style={{ display:'contents' }}>
              <span style={{ fontSize:'var(--fs-xs)', fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.04em' }}>{c.label}</span>
              <span style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap', minWidth:0 }}>
                <span style={{ fontSize:'var(--fs-md)', fontWeight: c.label === 'Detalii plată' || c.label === 'Beneficiar' || c.label === 'Plătitor' ? 700 : 500, color:'var(--text-primary)', fontFamily: /IBAN|BIC|ordin/.test(c.label) ? 'monospace' : 'inherit', wordBreak:'break-all' }}>{c.valoare}</span>
                <CopyButton value={c.valoare} />
                {c.nota && <span style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)' }}>{c.nota}</span>}
              </span>
            </div>
          ))}
        </div>
      ) : (
      <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
        {randuri.map((r, i) => (
          <div key={i} style={{ fontSize:'var(--fs-md)', color:'var(--text-secondary)', lineHeight:'1.6', wordBreak:'break-word', paddingLeft: i ? '10px' : 0, borderLeft: i ? '2px solid var(--border)' : 'none' }}>
            <RandEvidentiat text={r} />
          </div>
        ))}
      </div>
      )}
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
      <div style={{ marginTop:'12px', paddingTop:'10px', borderTop:'1px dashed var(--border)' }}>
        <button onClick={veziComplet} disabled={fragStare === 'busy'} style={{ fontSize:'var(--fs-sm)', fontWeight:600, padding:'6px 12px', borderRadius:'var(--r-sm)', border:'1px solid var(--border)', background:'transparent', color:'var(--accent)', cursor: fragStare === 'busy' ? 'wait' : 'pointer' }}>
          {fragStare === 'busy' ? 'Caut în extras…' : frag && fragStare !== 'ascuns' ? 'Ascunde textul original' : 'Vezi complet în extras (PDF original)'}
        </button>
        {fragEroare && <span style={{ fontSize:'var(--fs-xs)', color:'var(--danger)', marginLeft:'8px' }}>{fragEroare.mesaj}{fragEroare.pdfUrl && <> · <a href={fragEroare.pdfUrl} target="_blank" rel="noreferrer" style={{ color:'var(--accent)' }}>deschide extrasul</a></>}</span>}
        {frag && fragStare !== 'ascuns' && (
          <div style={{ marginTop:'10px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px', flexWrap:'wrap', marginBottom:'6px' }}>
              <span style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)' }}>Exact cum apare în extras · pagina {frag.pagina} din {frag.totalPagini}</span>
              <a href={frag.pdfUrl} target="_blank" rel="noreferrer" style={{ fontSize:'var(--fs-xs)', fontWeight:600, color:'var(--accent)' }}>Deschide extrasul la pagina {frag.pagina} ↗</a>
            </div>
            <pre style={{ margin:0, padding:'10px 12px', background:'var(--surface-sunken)', border:'1px solid var(--border-subtle)', borderRadius:'var(--r-sm)', fontSize:'var(--fs-sm)', lineHeight:1.6, color:'var(--text-primary)', whiteSpace:'pre-wrap', wordBreak:'break-word', fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{frag.fragment.join('\n')}</pre>
            {frag.referinta && (
              <div style={{ display:'flex', alignItems:'center', gap:'6px', marginTop:'8px' }}>
                <span style={{ fontSize:'var(--fs-xs)', fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase' }}>Referință bancară (din extras)</span>
                <span style={{ fontSize:'var(--fs-md)', fontWeight:650, fontFamily:'monospace', color:'var(--text-primary)' }}>{frag.referinta}</span>
                <CopyButton value={frag.referinta} />
              </div>
            )}
          </div>
        )}
      </div>
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

      <div style={{ fontSize:'30px', fontWeight:800, color: tx.tip==='credit' ? 'var(--success)' : 'color-mix(in srgb, var(--danger) 62%, var(--text-secondary))', letterSpacing:'-0.5px', marginBottom:'16px' }}>
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
          <DetaliiExtras text={tx.descriere!} tx={tx} />
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
