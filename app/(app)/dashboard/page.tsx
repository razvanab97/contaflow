import DocumenteGenerale from '@/components/DocumenteGenerale'
import ActePersonale from '@/components/ActePersonale'
import FacturiLocaleGlobal from '@/components/FacturiLocaleGlobal'
import DateLipsaDocumente from '@/components/DateLipsaDocumente'
import PulsLuna, { type Semnal } from '@/components/dashboard/PulsLuna'
import FirmeTabel, { type RandFirma, type ModulRand } from '@/components/dashboard/FirmeTabel'
import { getDeFacut } from '@/lib/de-facut'
import { dbSelect } from '@/lib/db'
import { getRestanteCount } from '@/lib/queries'
import { getStardeskDiscrepanteCount } from '@/lib/stardeskVerify'
import { getFirmaModules, getFirmaTotalTasks } from '@/lib/firma-config'
import { getServiceSupabase } from '@/lib/supabase/server'
import { platiFaraOp } from '@/lib/ordine-plata-server'
import { accountingFullLabel, accountingPeriodLabel, currentWorkMonthKey } from '@/lib/accounting-period'

export const dynamic = 'force-dynamic'

// Dashboard: bara lunii (progres + semnale), buletinul (datele cerute la toate firmele), firmele ca tabel
// (un rand pe firma, detaliile la click), apoi documentele.

function ini(n: string) { return n.split(' ').filter((w: string) => /^[A-ZĂÎȘȚ]/.test(w)).slice(0, 2).map((w: string) => w[0]).join('') }
const ibanAfisat = (v: string | null) => v ? v.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim() : ''

// Cate documente (facturi/bonuri/avize) nu au suma - aceeasi regula ca /api/documente/completeaza
async function documenteFaraSuma(): Promise<number> {
  try {
    const { count } = await getServiceSupabase().from('documente').select('id', { count: 'exact', head: true })
      .is('suma', null).in('tip_document', ['factura', 'bon', 'chitanta', 'aviz_plata', 'invoice']).is('extractie_incercata_at', null)
      .or('fisier_tip.eq.application/pdf,fisier_tip.like.image/*,fisier_nume.ilike.*.pdf,fisier_nume.ilike.*.jpg,fisier_nume.ilike.*.jpeg,fisier_nume.ilike.*.png')
    return count || 0
  } catch { return 0 }
}

export default async function Dashboard() {
  const LUNA = currentWorkMonthKey()
  const [firme, luni] = await Promise.all([
    dbSelect('firme', { eq: { activa: true }, order: 'created_at' }),
    dbSelect('luni_contabile', { select: '*' }),
  ])

  const luniMap: Record<string, any> = {}
  for (const l of luni) luniMap[`${l.firma_id}_${l.luna?.slice(0, 7)}`] = l

  // Doar luna curenta pe firmele active - task_stari creste nemarginit in timp.
  const lunaIds = firme.map((f: any) => luniMap[`${f.id}_${LUNA}`]?.id).filter(Boolean)
  const sb = getServiceSupabase()
  const [taskStariRaw, proprietariRaw, acteRaw, faraOp, faraSuma] = await Promise.all([
    lunaIds.length ? dbSelect('task_stari', { select: 'luna_id,task_key,completat', in: { luna_id: lunaIds } }) : Promise.resolve([]),
    dbSelect('proprietari', { select: 'id,firma_id,nume,serie_ci,numar_ci', order: 'ordine' }),
    sb.from('documente').select('id,firma_id,fisier_nume,furnizor').eq('modul', 'acte_firma').order('created_at').then(r => r.data || [], () => []),
    platiFaraOp(sb).then(x => x.length, () => 0),
    documenteFaraSuma(),
  ])

  const bifate = new Map<string, Set<string>>()
  for (const ts of taskStariRaw) if (ts.completat) { if (!bifate.has(ts.luna_id)) bifate.set(ts.luna_id, new Set()); bifate.get(ts.luna_id)!.add(ts.task_key) }

  const restanteCounts = await Promise.all(firme.map((f: any) => getRestanteCount(f.id)))
  const restanteMap: Record<string, number> = {}
  firme.forEach((f: any, i: number) => { restanteMap[f.id] = restanteCounts[i] })

  // Discrepante de pret 5StarDesk (factura gasita, dar suma nu corespunde cu borderoul)
  const discrepanteCounts = await Promise.all(firme.map((f: any) => {
    const lunaData = luniMap[`${f.id}_${LUNA}`]
    const are5stardesk = getFirmaModules(f.slug).some((m: any) => m.slug === '5stardesk')
    return are5stardesk && lunaData ? getStardeskDiscrepanteCount(lunaData.id) : Promise.resolve(0)
  }))

  const deFacut = await getDeFacut(firme.map((f: any) => ({ id: f.id, slug: f.slug, nume: f.nume, culoare: f.culoare })), LUNA, restanteMap)

  const randuri: RandFirma[] = firme.map((f: any, i: number) => {
    const lunaData = luniMap[`${f.id}_${LUNA}`]
    const facute = (lunaData && bifate.get(lunaData.id)) || new Set<string>()
    const modules = getFirmaModules(f.slug)
    let urmatorGasit = false
    const module: ModulRand[] = modules.map(m => {
      const href = `/${f.slug}/${LUNA}/${m.slug}`
      if (!m.tasks.length) return { slug: m.slug, label: m.label, href, stare: 'none' }
      if (m.tasks.every(t => facute.has(t.key))) return { slug: m.slug, label: m.label, href, stare: 'ok' }
      if (!urmatorGasit) { urmatorGasit = true; return { slug: m.slug, label: m.label, href, stare: 'next' } }
      return { slug: m.slug, label: m.label, href, stare: 'todo' }
    })
    const urm = modules.find(m => module.find(x => x.slug === m.slug)?.stare === 'next')
    const ramase = urm ? urm.tasks.filter(t => !facute.has(t.key)) : []
    const total = getFirmaTotalTasks(f.slug)
    const proprietari = proprietariRaw.filter((p: any) => p.firma_id === f.id)
    return {
      id: f.id, slug: f.slug, nume: f.nume, culoare: f.culoare, initiale: ini(f.nume) || f.nume.slice(0, 2).toUpperCase(),
      done: lunaData ? Math.min(modules.flatMap(m => m.tasks).filter(t => facute.has(t.key)).length, total) : 0, total, lunaInceputa: !!lunaData,
      restante: restanteCounts[i], discrepante: discrepanteCounts[i],
      linkLuna: `/${f.slug}/${LUNA}`, luna: LUNA,
      urmator: urm ? { label: urm.label, detaliu: ramase.length === 1 ? ramase[0].label : `${ramase.length} sarcini rămase`, href: `/${f.slug}/${LUNA}/${urm.slug}` } : null,
      module,
      deFacut: deFacut.filter(it => it.firmaId === f.id),
      date: f.cui ? [
        { label: 'CUI', value: f.cui || '', mono: true },
        { label: 'ONRC', value: f.nr_reg_com || '', mono: true },
        { label: 'Adresă', value: [f.adresa, f.judet, f.tara].filter(Boolean).join(', ') },
        ...(f.iban_ron ? [{ label: 'IBAN RON', value: ibanAfisat(f.iban_ron), mono: true }] : []),
        ...(f.iban_eur ? [{ label: 'IBAN EUR', value: ibanAfisat(f.iban_eur), mono: true }] : []),
        ...proprietari.map((p: any) => ({ label: p.nume, value: `${p.serie_ci ?? ''} ${p.numar_ci ?? ''}`.trim(), mono: true })),
      ] : [],
      acte: (acteRaw as any[]).filter(a => a.firma_id === f.id).map(a => ({ id: a.id, nume: a.fisier_nume, tip: a.furnizor || 'Act' })),
    }
  })

  // Semnalele din bara lunii: doar ce cere atentie, fiecare duce unde se rezolva
  const totalRestante = restanteCounts.reduce((s, n) => s + n, 0)
  const totalDiscrepante = discrepanteCounts.reduce((s, n) => s + n, 0)
  const primaCu = (arr: number[]) => firme[arr.findIndex(n => n > 0)]?.slug
  const semnale: Semnal[] = [
    ...(totalRestante ? [{ n: totalRestante, text: totalRestante === 1 ? 'factură restantă' : 'facturi restante', href: `#firma-${primaCu(restanteCounts)}`, ton: 'bad' as const }] : []),
    ...(totalDiscrepante ? [{ n: totalDiscrepante, text: `${totalDiscrepante === 1 ? 'discrepanță' : 'discrepanțe'} preț 5StarDesk`, href: `#firma-${primaCu(discrepanteCounts)}`, ton: 'warn' as const }] : []),
    ...(faraOp ? [{ n: faraOp, text: faraOp === 1 ? 'plată fără OP' : 'plăți fără OP', href: '/op-uri', ton: 'warn' as const }] : []),
    ...(faraSuma ? [{ n: faraSuma, text: faraSuma === 1 ? 'document fără sumă' : 'documente fără sumă', href: '#documente', ton: 'info' as const }] : []),
  ]
  const deschisaImplicit = randuri.find(r => r.deFacut.some(it => it.urgenta === 'depasit'))?.slug || null
  const ramaseTotal = randuri.reduce((s, r) => s + Math.max(0, r.total - r.done), 0)

  return (
    <main className="page animate-in">
      <div className="page-header">
        <div className="page-header-main">
          <div className="eyebrow" style={{ marginBottom: '8px' }}>Contabilitate {accountingPeriodLabel(LUNA)}</div>
          <h1 className="hero-title">Bună, Razvan</h1>
          <p className="page-subtitle">{accountingFullLabel(LUNA)} · {firme.length} firme active{ramaseTotal ? ` · mai ai ${ramaseTotal} task-uri până închizi luna` : ' · luna e închisă la toate firmele'}</p>
        </div>
      </div>

      <PulsLuna firme={randuri.map(r => ({ slug: r.slug, nume: r.nume, culoare: r.culoare, done: r.done, total: r.total }))} semnale={semnale} />
      <ActePersonale />
      <FirmeTabel firme={randuri} implicit={deschisaImplicit} />

      <div className="section-title" id="documente" style={{ scrollMarginTop: '80px' }}><h2>Documente</h2></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))', gap: '12px', alignItems: 'start' }}>
        <FacturiLocaleGlobal firme={firme.map((f: any) => ({ id: f.id, nume: f.nume }))} />
        <DateLipsaDocumente />
        <DocumenteGenerale />
      </div>
    </main>
  )
}
