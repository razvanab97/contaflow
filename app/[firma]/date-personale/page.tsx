import { notFound } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { dbSelect, getRestanteCount } from '@/lib/db'
import { getFirmaConfig, getFirmaModules, getFirmaTotalTasks } from '@/lib/firma-config'
import DatePersonaleClient from './DatePersonaleClient'

export const dynamic = 'force-dynamic'

const LUNI_FULL = ['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
function lunaLabel(s: string) { const [y,m]=s.split('-'); return `${LUNI_FULL[+m]} ${y}` }

function getCurrentLuna() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
}

export default async function DatePersonalePage({ params }: { params: Promise<{firma:string}> }) {
  const { firma: slug } = await params

  const firmaConfig = getFirmaConfig(slug)
  if (!firmaConfig) notFound()

  const [firmeRaw, toateFirmele, luni] = await Promise.all([
    dbSelect('firme', { eq: { slug } }),
    dbSelect('firme', { eq: { activa: true }, order: 'created_at' }),
    dbSelect('luni_contabile', { select: '*' }),
  ])

  const firma = firmeRaw[0]
  if (!firma) notFound()

  const luna = getCurrentLuna()
  const allTaskStari = await dbSelect('task_stari', { select: 'luna_id,completat' })

  const luniMap: Record<string, any> = {}
  for (const l of luni) luniMap[`${l.firma_id}_${l.luna?.slice(0,7)}`] = l

  const taskCount: Record<string, { done: number }> = {}
  for (const ts of allTaskStari) {
    if (!taskCount[ts.luna_id]) taskCount[ts.luna_id] = { done: 0 }
    if (ts.completat) taskCount[ts.luna_id].done++
  }

  const firmeNav = toateFirmele.map((f: any) => {
    const ld = luniMap[`${f.id}_${luna}`]
    const total = getFirmaTotalTasks(f.slug)
    const done = ld ? (taskCount[ld.id]?.done || 0) : 0
    return { id: f.id, slug: f.slug, nume: f.nume, culoare: f.culoare, pct: total > 0 ? Math.round((done/total)*100) : 0 }
  })

  const modules = getFirmaModules(slug)
  const restanteCount = await getRestanteCount(firma.id)

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#0A0A0A' }}>
      <Sidebar
        firme={firmeNav}
        lunaCurenta={luna}
        lunaLabel={lunaLabel(luna)}
        firmaAtiva={slug}
        modulActiv={undefined}
        moduleFirma={modules}
        restanteCount={restanteCount}
      />

      <main style={{ flex:1, padding:'44px 52px', maxWidth:'820px' }}>
        <div style={{ marginBottom:'32px' }}>
          <Link href={`/${slug}/${luna}`} style={{ display:'inline-flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#888', marginBottom:'16px' }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            {firma.nume.replace(' SRL','')}
          </Link>
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:firma.culoare, flexShrink:0 }}/>
            <h1 style={{ fontSize:'24px', fontWeight:700, color:'#FFF', letterSpacing:'-0.5px' }}>Date personale</h1>
          </div>
          <p style={{ fontSize:'14px', fontWeight:500, color:'#888', marginTop:'6px', marginLeft:'22px' }}>
            CUI, ONRC, adresă, proprietari și documentele firmei · {firma.nume}
          </p>
        </div>

        <DatePersonaleClient firmaId={firma.id}/>
      </main>
    </div>
  )
}
