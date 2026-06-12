'use client'
import { useEffect, useState } from 'react'

interface Tranzactie { id:string; tip:'credit'|'debit'; suma:number; valuta:string; data:string; descriere:string; categorie:string|null; document_id:string|null; luna:string|null }
interface DocVec { id:string; fisier_nume:string; tip_document:string|null; numar_document:string|null; luna:string|null }
interface Furnizor { name:string; totalDebit:number; totalCredit:number; txCount:number; docCount:number; luni:string[]; tranzactii:Tranzactie[]; documente:DocVec[] }

const LUNI_FULL: Record<string,string> = { '01':'Ian','02':'Feb','03':'Mar','04':'Apr','05':'Mai','06':'Iun','07':'Iul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec' }
function lunaShort(s:string) { const [y,m]=s.split('-'); return `${LUNI_FULL[m]||m} ${y?.slice(2)}` }

function fmt(n:number) { return new Intl.NumberFormat('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n) }

function initials(name:string) {
  const w = name.trim().split(/\s+/).filter(Boolean)
  if (w.length === 1) return w[0].slice(0,2).toUpperCase()
  return (w[0][0] + w[w.length-1][0]).toUpperCase()
}

function hashColor(name:string) {
  let h = 0
  for (let i=0;i<name.length;i++) h = (h*31+name.charCodeAt(i))&0xFFFFFF
  const colors = ['#6EE7B0','#60A5FA','#F5C96A','#A78BFA','#FB923C','#F87171','#34D399','#818CF8']
  return colors[Math.abs(h) % colors.length]
}

export default function FurnizoriClient({ firmaId, culoare }: { firmaId:string; culoare:string }) {
  const [data, setData] = useState<Furnizor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string|null>(null)
  const [tab, setTab] = useState<'tx'|'doc'>('tx')

  useEffect(() => {
    fetch(`/api/furnizori?firmaId=${encodeURIComponent(firmaId)}`)
      .then(r=>r.json())
      .then(d=>{ if(Array.isArray(d)) setData(d); else setError(d.error||'Eroare'); setLoading(false) })
      .catch(()=>{ setError('Eroare la încărcare'); setLoading(false) })
  }, [firmaId])

  const filtered = data.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))

  if (loading) return <div style={{ color:'#555', fontSize:'14px', padding:'32px 0' }}>Se încarcă...</div>
  if (error) return <div style={{ color:'#F87171', fontSize:'13px', padding:'24px 0' }}>{error}</div>

  return (
    <div>
      {/* Search */}
      <div style={{ marginBottom:'20px', position:'relative' }}>
        <svg style={{ position:'absolute', left:'14px', top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }} width="14" height="14" fill="none" stroke="#555" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Caută furnizor sau entitate..."
          style={{ width:'100%', padding:'10px 14px 10px 38px', background:'#111', border:'1px solid #222', borderRadius:'10px', fontSize:'13px', color:'#DDD', outline:'none' }}
        />
      </div>

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', marginBottom:'20px' }}>
        {[
          { label:'Entități unice', value:data.length },
          { label:'Tranzacții totale', value:data.reduce((s,f)=>s+f.txCount,0) },
          { label:'Documente atașate', value:data.reduce((s,f)=>s+f.docCount,0) },
        ].map(({label,value})=>(
          <div key={label} style={{ background:'#111', border:'1px solid #1E1E1E', borderRadius:'10px', padding:'14px 18px' }}>
            <div style={{ fontSize:'22px', fontWeight:800, color:'#EEE' }}>{value}</div>
            <div style={{ fontSize:'11px', color:'#555', fontWeight:600, marginTop:'2px' }}>{label}</div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ padding:'40px', background:'#111', border:'1px solid #1E1E1E', borderRadius:'12px', textAlign:'center' }}>
          <p style={{ fontSize:'13px', color:'#555' }}>
            {data.length === 0 ? 'Nu există tranzacții importate încă. Încarcă extrase bancare în modulul Extras de cont.' : 'Nicio entitate găsită.'}
          </p>
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
        {filtered.map(f => {
          const isOpen = expanded === f.name
          const color = hashColor(f.name)
          const hasBoth = f.totalDebit > 0 && f.totalCredit > 0

          return (
            <div key={f.name} style={{ background:'#111', border:`1px solid ${isOpen ? `rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},.25)` : '#1E1E1E'}`, borderRadius:'12px', overflow:'hidden' }}>
              {/* Header row */}
              <button onClick={()=>{ setExpanded(isOpen?null:f.name); setTab('tx') }} style={{ width:'100%', display:'flex', alignItems:'center', gap:'14px', padding:'14px 18px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left' }}>
                {/* Avatar */}
                <div style={{ width:'36px', height:'36px', borderRadius:'9px', background:`rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},.15)`, border:`1px solid rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},.3)`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:'12px', fontWeight:800, color }}>{initials(f.name)}</span>
                </div>

                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'14px', fontWeight:700, color:'#EEE', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', marginTop:'3px', flexWrap:'wrap' }}>
                    {f.luni.slice(0,4).map(l=>(
                      <span key={l} style={{ fontSize:'10px', fontWeight:600, color:'#555', background:'#1A1A1A', padding:'1px 7px', borderRadius:'20px' }}>{lunaShort(l)}</span>
                    ))}
                    {f.luni.length > 4 && <span style={{ fontSize:'10px', color:'#444' }}>+{f.luni.length-4}</span>}
                  </div>
                </div>

                <div style={{ display:'flex', gap:'16px', flexShrink:0, alignItems:'center' }}>
                  {f.totalDebit > 0 && (
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:'14px', fontWeight:700, color:'#F87171' }}>−{fmt(f.totalDebit)}</div>
                      <div style={{ fontSize:'10px', color:'#555' }}>plătit</div>
                    </div>
                  )}
                  {f.totalCredit > 0 && (
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:'14px', fontWeight:700, color:'#6EE7B0' }}>+{fmt(f.totalCredit)}</div>
                      <div style={{ fontSize:'10px', color:'#555' }}>primit</div>
                    </div>
                  )}
                  {hasBoth && (
                    <div style={{ textAlign:'right', paddingLeft:'8px', borderLeft:'1px solid #222' }}>
                      <div style={{ fontSize:'13px', fontWeight:700, color: f.totalCredit-f.totalDebit >= 0 ? '#6EE7B0' : '#F87171' }}>
                        {f.totalCredit-f.totalDebit >= 0 ? '+' : ''}{fmt(f.totalCredit-f.totalDebit)}
                      </div>
                      <div style={{ fontSize:'10px', color:'#555' }}>net</div>
                    </div>
                  )}
                  <div style={{ fontSize:'11px', color:'#555', minWidth:'32px', textAlign:'center' }}>
                    {f.txCount > 0 && <div>{f.txCount} tx</div>}
                    {f.docCount > 0 && <div style={{ color:'#6EE7B0' }}>{f.docCount} doc</div>}
                  </div>
                  <svg width="14" height="14" fill="none" stroke="#555" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink:0, transform:isOpen?'rotate(180deg)':'none', transition:'transform .2s' }}>
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </div>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{ borderTop:'1px solid #1A1A1A', padding:'16px 18px 18px' }}>
                  {/* Tabs */}
                  {f.docCount > 0 && f.txCount > 0 && (
                    <div style={{ display:'flex', gap:'6px', marginBottom:'14px' }}>
                      {([['tx',`Tranzacții (${f.txCount})`],['doc',`Documente (${f.docCount})`]] as const).map(([t,l])=>(
                        <button key={t} onClick={()=>setTab(t)} style={{ fontSize:'12px', fontWeight:600, padding:'5px 14px', borderRadius:'7px', border:`1px solid ${tab===t?culoare:'#2A2A2A'}`, background:tab===t?culoare:'#1A1A1A', color:tab===t?'#fff':'#888', cursor:'pointer' }}>{l}</button>
                      ))}
                    </div>
                  )}

                  {/* Tranzactii */}
                  {(tab === 'tx' || f.docCount === 0) && f.tranzactii.length > 0 && (
                    <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
                      {f.tranzactii.map(tx=>(
                        <div key={tx.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'#161616', borderRadius:'8px' }}>
                          <span style={{ fontSize:'11px', color:'#555', flexShrink:0, width:'60px' }}>{new Date(tx.data).toLocaleDateString('ro-RO',{day:'2-digit',month:'2-digit',year:'2-digit'})}</span>
                          <span style={{ flex:1, fontSize:'12px', color:'#AAA', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tx.descriere}</span>
                          {tx.luna && <span style={{ fontSize:'10px', color:'#444', flexShrink:0 }}>{lunaShort(tx.luna)}</span>}
                          {tx.document_id && <span style={{ fontSize:'10px', color:'#6EE7B0', flexShrink:0 }}>✓</span>}
                          <span style={{ fontSize:'13px', fontWeight:700, color:tx.tip==='credit'?'#6EE7B0':'#F87171', flexShrink:0 }}>
                            {tx.tip==='credit'?'+':'-'}{fmt(tx.suma)} {tx.valuta}
                          </span>
                        </div>
                      ))}
                      {f.txCount > 50 && <p style={{ fontSize:'11px', color:'#555', padding:'4px 12px' }}>...și încă {f.txCount-50} tranzacții</p>}
                    </div>
                  )}

                  {/* Documente */}
                  {tab === 'doc' && f.documente.length > 0 && (
                    <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
                      {f.documente.map(doc=>(
                        <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'#161616', borderRadius:'8px' }}>
                          <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:culoare, flexShrink:0 }}/>
                          <span style={{ flex:1, fontSize:'12px', color:'#CCC', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {doc.fisier_nume}
                            {doc.numar_document && <span style={{ color:'#666' }}> · {doc.numar_document}</span>}
                          </span>
                          {doc.luna && <span style={{ fontSize:'10px', color:'#444', flexShrink:0 }}>{lunaShort(doc.luna)}</span>}
                          <span style={{ fontSize:'11px', color:'#777', flexShrink:0 }}>{doc.tip_document||'doc'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
