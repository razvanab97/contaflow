import { notFound } from 'next/navigation'
import Link from 'next/link'
import nextDynamic from 'next/dynamic'
import { dbSelect } from '@/lib/db'
import { getFirmaBySlug, getActiveFirme, getLuniContabile } from '@/lib/queries'
import { getFirmaConfig, MODULE_DEFS, ModuleSlug } from '@/lib/firma-config'

// Fiecare modul e incarcat lazy (chunk separat) - pagina afiseaza mereu un singur modul, dar
// fara asta toate cele 13 componente (unele mari, ex. EmagModule ~600 linii) ajungeau in bundle-ul
// oricarei pagini de modul, indiferent care e cea reala afisata.
const EmagModule = nextDynamic(() => import('../modules/EmagModule'))
const TrendyolModule = nextDynamic(() => import('../modules/TrendyolModule'))
const BookingModule = nextDynamic(() => import('../modules/BookingModule'))
const AirbnbModule = nextDynamic(() => import('../modules/AirbnbModule'))
const StarsdeskModule = nextDynamic(() => import('../modules/StarsdeskModule'))
const AngajatiModule = nextDynamic(() => import('../modules/AngajatiModule'))
const ActeModule = nextDynamic(() => import('../modules/ActeModule'))
const DispozitieModule = nextDynamic(() => import('../modules/DispozitieModule'))
const FacturiModule = nextDynamic(() => import('../modules/FacturiModule'))
const InboxFacturiModule = nextDynamic(() => import('../modules/InboxFacturiModule'))
const ExtrasModule = nextDynamic(() => import('../modules/ExtrasModule'))
const RaportLunarModule = nextDynamic(() => import('../modules/RaportLunarModule'))
const ImpoziteModule = nextDynamic(() => import('../modules/ImpoziteModule'))
const RaportLunarProiectModule = nextDynamic(() => import('../modules/RaportLunarProiectModule'))

export const dynamic = 'force-dynamic'

const LUNI_FULL = ['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
function lunaLabel(s: string) { const [y,m]=s.split('-'); return `${LUNI_FULL[+m]} ${y}` }

export default async function ModulPage({ params }: { params: Promise<{firma:string;luna:string;modul:string}> }) {
  const { firma: slug, luna, modul: modulSlug } = await params

  const firmaConfig = getFirmaConfig(slug)
  if (!firmaConfig || !firmaConfig.module.includes(modulSlug as ModuleSlug)) notFound()

  const modulDef = MODULE_DEFS[modulSlug as ModuleSlug]
  if (!modulDef) notFound()

  const [firma, toateFirmele, luni] = await Promise.all([
    getFirmaBySlug(slug),
    getActiveFirme(),
    getLuniContabile(),
  ])
  if (!firma) notFound()

  const lunaData = luni.find((l: any) => l.firma_id === firma.id && l.luna?.startsWith(luna))
  if (!lunaData) notFound()

  const [taskStariRaw, extrase, checklistItemsRaw, impoziteStari, proprietariRaw] = await Promise.all([
    dbSelect('task_stari', { eq: { luna_id: lunaData.id }, select: 'task_key,completat' }),
    modulSlug === 'extras' ? dbSelect('extrase', { eq: { luna_id: lunaData.id } }) : Promise.resolve([]),
    ['emag', 'trendyol', 'booking-facturi', 'booking-borderou', 'airbnb-facturi', 'airbnb-borderou', '5stardesk'].includes(modulSlug)
      ? dbSelect('checklist_items', { eq: { luna_id: lunaData.id }, select: 'id,completat,checklist_templates(titlu,descriere,modul,ordine)' })
      : Promise.resolve([]),
    modulSlug === 'impozite' ? dbSelect('impozite_stari', { eq: { luna_id: lunaData.id }, select: 'tip_key,suma,scadenta,platit' }) : Promise.resolve([]),
    modulSlug === 'dispozitie-plata' ? dbSelect('proprietari', { eq: { firma_id: firma.id }, order: 'ordine' }) : Promise.resolve([]),
  ])

  const taskMap: Record<string, boolean> = {}
  for (const ts of taskStariRaw) taskMap[ts.task_key] = ts.completat

  const tasks = modulDef.tasks.map(t => ({ ...t, completat: taskMap[t.key] ?? false }))

  const ll = lunaLabel(luna)

  const firmaForModule = {
    id: firma.id, slug: firma.slug, nume: firma.nume, culoare: firma.culoare,
    luna_id: lunaData.id,
  }

  const firmeDisponibile = toateFirmele.map((f: any) => ({
    id: f.id, slug: f.slug, nume: f.nume, culoare: f.culoare,
    cui: f.cui, nrRegCom: f.nr_reg_com, adresa: f.adresa, judet: f.judet, tara: f.tara,
    luna_id: luni.find((l: any) => l.firma_id === f.id && l.luna?.startsWith(luna))?.id || null,
  })).filter((f: any) => f.luna_id)

  const proprietari = proprietariRaw.map((p: any) => ({ nume: p.nume, serieCi: p.serie_ci || '', numarCi: p.numar_ci || '' }))

  // Alias-uri pentru modul-urile vechi din checklist_templates (pot diferi de slug-urile noi)
  const MODUL_ALIASES: Record<string, string[]> = {
    'emag':             ['emag'],
    'trendyol':         ['trendyol'],
    'booking-facturi':  ['booking-facturi', 'booking'],
    'booking-borderou': ['booking-borderou', 'booking'],
    'airbnb-facturi':   ['airbnb-facturi', 'airbnb'],
    'airbnb-borderou':  ['airbnb-borderou', 'airbnb'],
    '5stardesk':        ['5stardesk', '5star', 'stardesk'],
  }
  function oldItems(slug: string) {
    const valid = MODUL_ALIASES[slug] || [slug]
    return checklistItemsRaw.filter((i: any) => valid.includes(i.checklist_templates?.modul || ''))
  }

  function renderModule() {
    switch (modulSlug) {
      case 'extras':
        return <ExtrasModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} extrase={extrase} slug={slug} luna={luna}/>
      case 'emag':
        return <EmagModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} checklistItems={oldItems('emag')}/>
      case 'trendyol':
        return <TrendyolModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} checklistItems={oldItems('trendyol')}/>
      case 'booking-facturi':
        return <BookingModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} section="booking-facturi" checklistItems={oldItems('booking-facturi')}/>
      case 'booking-borderou':
        return <BookingModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} section="booking-borderou" checklistItems={oldItems('booking-borderou')}/>
      case 'airbnb-facturi':
        return <AirbnbModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} section="airbnb-facturi" checklistItems={oldItems('airbnb-facturi')}/>
      case 'airbnb-borderou':
        return <AirbnbModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} section="airbnb-borderou" checklistItems={oldItems('airbnb-borderou')}/>
      case '5stardesk':
        return <StarsdeskModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} checklistItems={oldItems('5stardesk')}/>
      case 'angajati':
        return <AngajatiModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks}/>
      case 'acte-contabile':
        return <ActeModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks}/>
      case 'dispozitie-plata':
        return <DispozitieModule firma={firmaForModule} firmeDisponibile={firmeDisponibile} lunaId={lunaData.id} tasks={tasks} proprietari={proprietari}/>
      case 'facturi-chitanta':
        return <FacturiModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} section="facturi-chitanta"/>
      case 'facturi-restante':
        return <FacturiModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} section="facturi-restante"/>
      case 'inbox-facturi':
        return <InboxFacturiModule firma={firmaForModule} lunaId={lunaData.id} luna={luna} tasks={tasks}/>
      case 'raport-lunar':
        return <RaportLunarModule firma={firmaForModule} lunaId={lunaData.id}/>
      case 'impozite':
        return <ImpoziteModule firma={firmaForModule} lunaId={lunaData.id} tasks={modulDef.tasks} stari={impoziteStari}/>
      case 'raport-lunar-proiect':
        return <RaportLunarProiectModule firma={firmaForModule} lunaId={lunaData.id} tasks={tasks} luna={luna} lunaLabel={ll} modulSlug={modulSlug}/>
      default:
        notFound()
    }
  }

  return (
    <main style={{ flex:1, padding:'44px 52px', maxWidth: modulSlug === 'raport-lunar-proiect' ? '1500px' : '1300px' }}>
      {/* Header - ReportWorkspace isi construieste propriul header (breadcrumb + titlu + schimbator
          de luna), ca sa nu aparem cu doua titluri suprapuse pentru documentul-workspace */}
      {modulSlug !== 'raport-lunar-proiect' && (
      <div style={{ marginBottom:'32px' }}>
        <Link href={`/${slug}/${luna}`} style={{ display:'inline-flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'var(--c-888888)', marginBottom:'16px' }}>
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          {firma.nume.replace(' SRL','')} · {ll}
        </Link>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:firma.culoare, flexShrink:0 }}/>
          <h1 style={{ fontSize:'24px', fontWeight:700, color:'var(--c-ffffff)', letterSpacing:'-0.5px' }}>
            {modulDef.label}
          </h1>
        </div>
        <p style={{ fontSize:'14px', fontWeight:500, color:'var(--c-888888)', marginTop:'6px', marginLeft:'22px' }}>
          {modulDef.description}
        </p>
      </div>
      )}

      {/* Module content */}
      {renderModule()}
    </main>
  )
}
