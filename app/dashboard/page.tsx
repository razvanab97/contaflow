import { getServerSupabase } from '@/lib/supabase/server'
import Link from 'next/link'

const LUNA = new Date().toISOString().slice(0, 7)

function lunaLabel(s: string) {
  const [y,m] = s.split('-')
  return `${['','Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec'][+m]} ${y}`
}
function initials(n: string) { return n.split(' ').slice(0,2).map(w=>w[0]).join('') }
function rgb(h: string) { return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}` }

export default async function Dashboard() {
  const sb = await getServerSupabase()
  const { data: firme } = await sb.from('firme').select('*').eq('activa', true).order('created_at')
  const { data: luni } = await sb.from('luni_contabile').select('*')
  const luniMap: Record<string,{status:string;progres_pct:number}> = {}
  for (const l of luni||[]) luniMap[`${l.firma_id}_${l.luna.slice(0,7)}`] = l

  const ll = lunaLabel(LUNA)

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#0A0A0A' }}>
      <aside style={{ width:'220px', flexShrink:0, background:'#0D0D0D', borderRight:'1px solid #1E1E1E', display:'flex', flexDirection:'column', padding:'20px 0', position:'sticky', top:0, height:'100vh' }}>
        <div style={{ padding:'4px 18px 24px', display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ width:'28px', height:'28px', background:'#FFF', borderRadius:'7px', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="14" height="14" fill="none" stroke="#111" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
          </div>
          <span style={{ fontSize:'15px', fontWeight:700, color:'#FFF' }}>ContaFlow</span>
        </div>
        <div style={{ padding:'0 18px 8px', fontSize:'10px', fontWeight:700, color:'#444', letterSpacing:'.12em', textTransform:'uppercase' }}>Firme</div>
        {(firme||[]).map(f => (
          <Link key={f.id} href={`/${f.slug}/${LUNA}`} style={{ display:'flex', alignItems:'center', gap:'9px', padding:'8px 18px', color:'#999', fontSize:'13px', fontWeight:500 }}>
            <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:f.culoare, flexShrink:0 }}/>
            <span style={{ flex:1 }}>{f.nume.replace(' SRL','')}</span>
            <span style={{ fontSize:'10px', color:'#444' }}>{luniMap[`${f.id}_${LUNA}`] ? 'activ' : '—'}</span>
          </Link>
        ))}
        <div style={{ marginTop:'auto', padding:'12px 18px', fontSize:'11px', color:'#555' }}>{ll}</div>
      </aside>

      <main style={{ flex:1, padding:'40px 44px', background:'#0F0F0F' }}>
        <div style={{ marginBottom:'32px' }}>
          <h1 style={{ fontSize:'24px', fontWeight:700, color:'#FFF', letterSpacing:'-0.5px' }}>Bună, Razvan</h1>
          <p style={{ fontSize:'13px', color:'#777', marginTop:'4px' }}>{ll} · {(firme||[]).length} firme active</p>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', marginBottom:'32px' }}>
          {[
            { label:'Firme active', val:String((firme||[]).length) },
            { label:'Luni inițializate', val:String((firme||[]).filter(f=>luniMap[`${f.id}_${LUNA}`]).length) },
            { label:'Export ZIP', val:'—' },
          ].map(s => (
            <div key={s.label} style={{ background:'#161616', border:'1px solid #242424', borderRadius:'12px', padding:'16px 18px' }}>
              <div style={{ fontSize:'10px', fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:'8px' }}>{s.label}</div>
              <div style={{ fontSize:'24px', fontWeight:700, color:'#FFF', letterSpacing:'-0.5px' }}>{s.val}</div>
            </div>
          ))}
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          {(firme||[]).map(f => {
            const luna = luniMap[`${f.id}_${LUNA}`]
            const pct = luna?.progres_pct||0
            const r = rgb(f.culoare)
            const statusLabel = luna ? (luna.status==='finalizata'?'finalizată':luna.status==='trimisa_contabil'?'trimisă':'în lucru') : 'neîncepută'
            const statusColor = luna ? (luna.status==='finalizata' ? {bg:'rgba(74,222,128,.15)',c:'#4ADE80'} : {bg:'rgba(251,146,60,.15)',c:'#FB923C'}) : {bg:'#1A1A1A',c:'#555'}
            return (
              <div key={f.id} style={{ background:'#161616', border:'1px solid #242424', borderRadius:'14px', padding:'18px 22px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'14px' }}>
                  <div style={{ width:'36px', height:'36px', borderRadius:'9px', background:`rgba(${r},.18)`, color:f.culoare, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:700, flexShrink:0 }}>
                    {initials(f.nume)}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'15px', fontWeight:600, color:'#FFF' }}>{f.nume}</div>
                    <div style={{ fontSize:'11px', color:'#555', marginTop:'2px' }}>{f.cui?`CUI ${f.cui}`:''}</div>
                  </div>
                  <span style={{ fontSize:'11px', fontWeight:600, padding:'3px 10px', borderRadius:'20px', background:statusColor.bg, color:statusColor.c }}>{statusLabel}</span>
                </div>
                <div style={{ height:'2px', background:'#1E1E1E', borderRadius:'1px', marginBottom:'12px' }}>
                  <div style={{ height:'2px', borderRadius:'1px', background:f.culoare, width:`${pct}%` }}/>
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:'12px', color:'#666' }}>{luna ? `${pct}% completat` : `${ll} · neîncepută`}</span>
                  <Link href={`/${f.slug}/${LUNA}`} style={{ fontSize:'12px', fontWeight:600, color:f.culoare, padding:'5px 14px', borderRadius:'7px', border:`1px solid rgba(${r},.3)` }}>
                    Deschide →
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
