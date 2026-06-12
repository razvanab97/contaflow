import { notFound } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { dbSelect } from '@/lib/db'
import { getFirmaConfig, getFirmaModules, getFirmaTotalTasks, MODULE_DEFS, ModuleSlug } from '@/lib/firma-config'
import EmagModule from '../modules/EmagModule'
import TrendyolModule from '../modules/TrendyolModule'
import BookingModule from '../modules/BookingModule'
import AirbnbModule from '../modules/AirbnbModule'
import StarsdeskModule from '../modules/StarsdeskModule'
import AngajatiModule from '../modules/AngajatiModule'
import ActeModule from '../modules/ActeModule'
import DispozitieModule from '../modules/DispozitieModule'
import FacturiModule from '../modules/FacturiModule'
import ExtrasModule from '../modules/ExtrasModule'
import RaportLunarModule from '../modules/RaportLunarModule'

const LUNI_FULL = ['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
function lunaLabel(s: string) { const [y,m]=s.split('-'); return `${LUNI_FULL[+m]} ${y}` }

export default async function ModulPage({ params }: { params: Promise<{firma:string;luna:string;modul:string}> }) {
  const { firma: slug, luna, modul: modulSlug } = await params

  const firmaConfig = getFirmaConfig(slug)
  if (!firmaConfig || !firmaConfig.module.includes(modulSlug as ModuleSlug)) notFound()

  const modulDef = MODULE_DEFS[modulSlug as ModuleSlug]
  if (!modulDef) notFound()

  const [firmeRaw, toateFirmele, luni] = await Promise.all([
    dbSelect('firme', { eq: { slug } }),
    dbSelect('firme', { eq: { activa: true }, order: 'created_at' }),
    dbSelect('luni_contabile', { select: '*' }),
  ])

  const firma = firmeRaw[0]
  if (!firma) notFound()

  const lunaData = luni.find((l: any) => l.firma_id === firma.id && l.luna?.startsWith(luna))
  if (!lunaData) notFound()

  const [taskStariRaw, extrase, allTaskStari, checklistItemsRaw] = await Promise.all([
    dbSelect('task_stari', { eq: { luna_id: lunaData.id }, select: 'task_key,completat' }),
    modulSlug === 'extras' ? dbSelect('extrase', { eq: { luna_id: lunaData.id } }) : Promise.resolve([]),
    dbSelect('task_stari', { select: 'luna_id,completat' }),
    // Recuperează checklist_items din sistemul vechi (pentru documente eMAG/Trendyol deja încărcate)
    ['emag', 'trendyol'].includes(modulSlug)
      ? dbSelect('checklist_items', { eq: { luna_id: lunaData.id }, select: 'id,completat,checklist_templates(titlu,descriere,modul,ordine)' })
      : Promise.resolve([]),
  ])

  const taskMap: Record<string, boolean> = {}
  for (const ts of taskStariRaw) taskMap[ts.task_key] = ts.completat

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
  const tasks = modulDef.tasks.map(t => ({ ...t, completat: taskMap[t.key] ?? false }))

  const ll = lunaLabel(luna)

  const firmaForModule = {
    id: firma.id, slug: firma.slug, nume: firma.nume, culoare: firma.culoare,
    luna_id: lunaData.id,
  }

  const firmeDisponibile = toateFirmele.map((f: any) => ({
    id: f.id, slug: f.slug, nume: f.nume, culoare: f.culoare,
    luna_id: luni.find((l: any) => l.firma_id === f.id && l.luna?.startsWith(luna))?.id || null,
  })).filter((f: any) => f.luna_id)

  function renderModule() {
    switch (modulSlug) {
      case 'extras':
        return <ExtrasModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} extrase={extrase} slug={slug} luna={luna}/>
      case 'emag':
        return <EmagModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} checklistItems={checklistItemsRaw.filter((i: any) => i.checklist_templates?.modul === 'emag')}/>
      case 'trendyol':
        return <TrendyolModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} checklistItems={checklistItemsRaw.filter((i: any) => i.checklist_templates?.modul === 'trendyol')}/>
      case 'booking-facturi':
        return <BookingModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} section="booking-facturi"/>
      case 'booking-borderou':
        return <BookingModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} section="booking-borderou"/>
      case 'airbnb-facturi':
        return <AirbnbModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} section="airbnb-facturi"/>
      case 'airbnb-borderou':
        return <AirbnbModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} section="airbnb-borderou"/>
      case '5stardesk':
        return <StarsdeskModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks}/>
      case 'angajati':
        return <AngajatiModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks}/>
      case 'acte-contabile':
        return <ActeModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks}/>
      case 'dispozitie-plata':
        return <DispozitieModule firma={firmaForModule} firmeDisponibile={firmeDisponibile} lunaId={lunaData.id} tasks={tasks}/>
      case 'facturi-chitanta':
        return <FacturiModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} section="facturi-chitanta"/>
      case 'facturi-restante':
        return <FacturiModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} section="facturi-restante"/>
      case 'raport-lunar':
        return <RaportLunarModule firma={firmaForModule} lunaId={lunaData.id}/>
      default:
        notFound()
    }
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#0A0A0A' }}>
      <Sidebar
        firme={firmeNav}
        lunaCurenta={luna}
        lunaLabel={ll}
        firmaAtiva={slug}
        modulActiv={modulSlug}
        moduleFirma={modules}
      />

      <main style={{ flex:1, padding:'44px 52px', maxWidth:'900px' }}>
        {/* Header */}
        <div style={{ marginBottom:'32px' }}>
          <Link href={`/${slug}/${luna}`} style={{ display:'inline-flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#888', marginBottom:'16px' }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            {firma.nume.replace(' SRL','')} · {ll}
          </Link>
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:firma.culoare, flexShrink:0 }}/>
            <h1 style={{ fontSize:'24px', fontWeight:700, color:'#FFF', letterSpacing:'-0.5px' }}>
              {modulDef.label}
            </h1>
          </div>
          <p style={{ fontSize:'14px', fontWeight:500, color:'#888', marginTop:'6px', marginLeft:'22px' }}>
            {modulDef.description}
          </p>
        </div>

        {/* Module content */}
        {renderModule()}
      </main>
    </div>
  )
}
