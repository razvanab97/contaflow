'use client'
import Link from 'next/link'
import TaskSection, { TaskItem } from './TaskSection'
import { legibil, tint } from '@/lib/colors'

interface Extras { id:string; valuta:string; nr_tranzactii:number; nr_documentate:number }
interface Firma { id:string; slug:string; nume:string; culoare:string }
interface Props { firma: Firma; lunaId: string; tasks: TaskItem[]; extrase: Extras[]; slug: string; luna: string }

function rgb(h: string) { return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}` }

export default function ExtrasModule({ firma, lunaId, tasks, extrase, slug, luna }: Props) {
  const r = rgb(firma.culoare)
  const totalTx = extrase.reduce((s, e) => s + e.nr_tranzactii, 0)
  const docTx = extrase.reduce((s, e) => s + e.nr_documentate, 0)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
      <TaskSection tasks={tasks} lunaId={lunaId} culoare={firma.culoare}/>

      {/* Stats */}
      {extrase.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' }}>
          {([
            ['Extrase', extrase.length.toString(), firma.culoare],
            ['Tranzacții', totalTx.toString(), 'var(--c-aaaaaa)'],
            ['Documentate', `${docTx}/${totalTx}`, docTx===totalTx?'var(--accent-green)':firma.culoare],
          ] as [string,string,string][]).map(([label,value,color]) => (
            <div key={label} style={{ padding:'14px', background:'var(--c-111111)', border:'1px solid var(--c-1e1e1e)', borderRadius:'10px' }}>
              <div style={{ fontSize:'11px', fontWeight:500, color:'var(--c-777777)', marginBottom:'6px' }}>{label}</div>
              <div style={{ fontSize:'18px', fontWeight:700, color, letterSpacing:'-0.4px' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Extras list */}
      {extrase.length > 0 && (
        <div style={{ background:'var(--c-111111)', border:'1px solid var(--c-1e1e1e)', borderRadius:'12px', overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--c-1a1a1a)' }}>
            <div style={{ fontSize:'13px', fontWeight:600, color:'var(--c-e0e0e0)' }}>Extrase procesate</div>
          </div>
          <div style={{ padding:'12px 20px', display:'flex', flexDirection:'column', gap:'8px' }}>
            {extrase.map(e => (
              <div key={e.id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'10px 14px', background:'var(--c-161616)', borderRadius:'8px' }}>
                <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:firma.culoare, flexShrink:0 }}/>
                <span style={{ flex:1, fontSize:'13px', fontWeight:600, color:'var(--c-dddddd)' }}>{e.valuta}</span>
                <span style={{ fontSize:'12px', color:'var(--c-666666)' }}>{e.nr_tranzactii} tranzacții</span>
                <span style={{ fontSize:'12px', fontWeight:600, color:e.nr_documentate===e.nr_tranzactii?'var(--accent-green)':firma.culoare }}>
                  {e.nr_documentate}/{e.nr_tranzactii} documentate
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Link to extras page */}
      <Link href={`/${slug}/${luna}/extras`} style={{
        display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
        padding:'14px', borderRadius:'12px',
        border:`1px solid ${tint(r,.3)}`,
        background:`${tint(r,.05)}`,
        fontSize:'13px', fontWeight:600, color:legibil(firma.culoare),
      }}>
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Gestionează extrasele de cont →
      </Link>

      {extrase.length === 0 && (
        <div style={{ padding:'32px', textAlign:'center', color:'var(--c-888888)', fontSize:'13px' }}>
          Niciun extras încărcat pentru luna aceasta.
        </div>
      )}
    </div>
  )
}
