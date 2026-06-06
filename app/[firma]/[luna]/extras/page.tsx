import { getServerSupabase } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import UploadExtras from './UploadExtras'
import TranzactiiSection from './TranzactiiSection'

export default async function ExtrasPage({ params }: { params: Promise<{firma:string;luna:string}> }) {
  const { firma: slug, luna } = await params
  const sb = await getServerSupabase()

  const { data: firma } = await sb.from('firme').select('*').eq('slug', slug).single()
  if (!firma) notFound()

  const { data: lunaData } = await sb.from('luni_contabile').select('*')
    .eq('firma_id', firma.id).gte('luna', luna+'-01').lte('luna', luna+'-28').single()
  if (!lunaData) notFound()

  const { data: extrase } = await sb.from('extrase').select('*').eq('luna_id', lunaData.id).order('valuta')
  const ids = (extrase||[]).map((e: {id:string}) => e.id)

  const { data: rawTx } = ids.length > 0
    ? await sb.from('tranzactii')
        .select('*, documente(id,tip_document,furnizor,numar_document,fisier_nume)')
        .in('extras_id', ids)
        .order('data_tranzactie')
    : { data: [] }

  // Unresolved first, resolved last
  const tranzactii = [...(rawTx||[])].sort((a,b) => {
    const aR = !!a.document_id || a.note==='na'
    const bR = !!b.document_id || b.note==='na'
    if (aR===bR) return new Date(a.data_tranzactie).getTime()-new Date(b.data_tranzactie).getTime()
    return aR ? 1 : -1
  })

  const [y,m] = luna.split('-')
  const luni = ['','Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec']
  const ll = `${luni[+m]} ${y}`

  const rezolvate = tranzactii.filter(t => !!t.document_id || t.note==='na').length
  const pct = tranzactii.length > 0 ? Math.round((rezolvate/tranzactii.length)*100) : 0

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#0A0A0A' }}>
      <aside style={{ width:'220px', flexShrink:0, background:'#0D0D0D', borderRight:'1px solid #1E1E1E', display:'flex', flexDirection:'column', padding:'20px 0', position:'sticky', top:0, height:'100vh' }}>
        <div style={{ padding:'4px 18px 24px', display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ width:'28px', height:'28px', background:'#FFF', borderRadius:'7px', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="14" height="14" fill="none" stroke="#111" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
          </div>
          <span style={{ fontSize:'15px', fontWeight:700, color:'#FFF' }}>ContaFlow</span>
        </div>
        <Link href={`/${slug}/${luna}`} style={{ display:'flex', alignItems:'center', gap:'9px', padding:'8px 18px', fontSize:'13px', fontWeight:500, color:'#888' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          {firma.nume.replace(' SRL','')}
        </Link>
        <div style={{ height:'1px', background:'#1E1E1E', margin:'8px 14px' }}/>
        <div style={{ padding:'8px 18px', display:'flex', alignItems:'center', gap:'8px' }}>
          <svg width="14" height="14" fill="none" stroke={firma.culoare} strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
          <span style={{ fontSize:'13px', fontWeight:600, color:'#DDD' }}>Extras de cont</span>
        </div>
        {(extrase||[]).map((e: {id:string;valuta:string;nr_tranzactii:number;procesat_ai:boolean}) => (
          <div key={e.id} style={{ padding:'3px 18px 3px 38px', display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:'11px', color:'#777' }}>{e.valuta}</span>
            <span style={{ fontSize:'11px', fontWeight:600, color:e.procesat_ai?'#4ADE80':'#555' }}>{e.procesat_ai?`${e.nr_tranzactii} tx`:'—'}</span>
          </div>
        ))}
        {tranzactii.length>0 && (
          <>
            <div style={{ height:'1px', background:'#1E1E1E', margin:'12px 14px' }}/>
            <div style={{ padding:'0 18px' }}>
              <div style={{ fontSize:'10px', fontWeight:700, color:'#555', marginBottom:'8px', textTransform:'uppercase', letterSpacing:'.08em' }}>Progres</div>
              <div style={{ height:'3px', background:'#1E1E1E', borderRadius:'2px', marginBottom:'6px' }}>
                <div style={{ height:'3px', background:firma.culoare, borderRadius:'2px', width:`${pct}%` }}/>
              </div>
              <div style={{ fontSize:'13px', fontWeight:700, color:'#CCC' }}>{rezolvate}/{tranzactii.length}</div>
              <div style={{ fontSize:'11px', color:'#777', marginTop:'2px' }}>{pct}% rezolvate</div>
            </div>
          </>
        )}
        <div style={{ marginTop:'auto', padding:'12px 18px', fontSize:'11px', color:'#555' }}>{ll}</div>
      </aside>

      <main style={{ flex:1, padding:'40px 44px', background:'#0F0F0F' }}>
        <div style={{ marginBottom:'28px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
            <div style={{ width:'9px', height:'9px', borderRadius:'50%', background:firma.culoare }}/>
            <h1 style={{ fontSize:'20px', fontWeight:700, color:'#FFF' }}>Extras de cont</h1>
          </div>
          <p style={{ fontSize:'13px', color:'#888', marginLeft:'17px' }}>{firma.nume} · {ll}</p>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'40px' }}>
          {['RON','EUR'].map(v => {
            const e = (extrase||[]).find((x: {valuta:string}) => x.valuta===v)
            return <UploadExtras key={v} valuta={v} firmaId={firma.id} lunaId={lunaData.id} extras={e||null} culoare={firma.culoare}/>
          })}
        </div>

        {tranzactii.length > 0 && (
          <TranzactiiSection tranzactii={tranzactii} firmaId={firma.id} lunaId={lunaData.id} culoare={firma.culoare}/>
        )}

        {tranzactii.length===0 && ids.length>0 && (
          <div style={{ padding:'24px', background:'#161616', border:'1px solid #242424', borderRadius:'12px' }}>
            <p style={{ fontSize:'13px', color:'#888' }}>Extrasele sunt procesate dar tranzacțiile nu s-au salvat. Reîncarcă PDF-ul.</p>
          </div>
        )}
      </main>
    </div>
  )
}
