import { getServiceSupabase } from '@/lib/supabase/server'
import { getFirmaModules, esteLunaCalendaristica } from '@/lib/firma-config'
import { workMonthLabel } from '@/lib/accounting-period'
import { ignorareDeVerificat } from '@/lib/tranzactii-reguli'
import { getStareFirma } from '@/lib/sistem-lucru'

export interface ItemDeFacut {
  id: string
  firmaId: string
  firmaSlug: string
  firmaNume: string
  culoare: string
  titlu: string
  detaliu?: string
  href: string
  icon: string
  urgenta: 'depasit' | 'curand' | 'normal'
  zile?: number | null   // zile pana la termen (negativ = depasit)
}

const TERMEN_IMPOZITE = 25 // ziua din luna de lucru (declaratii/plati pentru luna contabila anterioara)

function zilePana(luna: string, zi: number, azi: Date) {
  const [y, m] = luna.split('-').map(Number)
  const termen = Date.UTC(y, m - 1, zi)
  const a = Date.UTC(azi.getFullYear(), azi.getMonth(), azi.getDate())
  return Math.round((termen - a) / 86400000)
}

// Lista "De facut" de pe Dashboard, pentru toate firmele, pe luna de lucru curenta: termene (impozite),
// tranzactii nedocumentate, cheltuieli ignorate de verificat, bonuri/facturi in asteptare, restante si
// urmatorul modul nebifat. Doar citiri.
export async function getDeFacut(firme: { id: string; slug: string; nume: string; culoare: string }[], luna: string, restanteMap: Record<string, number>): Promise<ItemDeFacut[]> {
  const sb = getServiceSupabase()
  const azi = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Bucharest' }))
  const items: ItemDeFacut[] = []

  await Promise.all(firme.map(async f => {
    const nume = f.nume.replace(' SRL', '')
    const base = { firmaId: f.id, firmaSlug: f.slug, firmaNume: nume, culoare: f.culoare }
    const { data: luni } = await sb.from('luni_contabile').select('id,luna').eq('firma_id', f.id)
    const l = (luni || []).find(x => String(x.luna).startsWith(luna))
    if (!l) {
      const calendar = esteLunaCalendaristica(f.slug)
      items.push({ ...base, id: `init-${f.id}`, titlu: calendar ? `Luna ${workMonthLabel(luna)} nu e începută` : 'Luna nu e începută', detaliu: calendar ? 'Pornește luna ca să apară rutina și task-urile' : 'Pornește contabilitatea lunii ca să apară task-urile', href: `/${f.slug}/${luna}`, icon: 'calendar', urgenta: 'normal' })
      return
    }
    const modules = getFirmaModules(f.slug)
    const [{ data: stari }, { data: moduleStari }, { data: extrase }, bonRes, faRes] = await Promise.all([
      sb.from('task_stari').select('task_key,completat').eq('luna_id', l.id),
      sb.from('module_stari').select('modul_slug,dezactivat').eq('luna_id', l.id),
      sb.from('extrase').select('id').eq('luna_id', l.id),
      sb.from('bonuri').select('id', { count: 'exact', head: true }).eq('firma_id', f.id).eq('status', 'asteptare'),
      sb.from('facturi_asteptate').select('id', { count: 'exact', head: true }).eq('firma_id', f.id).eq('status', 'asteptare'),
    ])
    const done = new Set((stari || []).filter(s => s.completat).map(s => s.task_key))
    const stare = await getStareFirma(sb, f, luna).catch(() => null)
    const lei = (v: number) => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

    // Sistemul de lucru (vezi /sistem-de-lucru): alertele care previn munca de la final de luna.
    if (stare?.deFacturat?.n) items.push({ ...base, id: `defact-${f.id}`, titlu: `${stare.deFacturat.n} ${stare.deFacturat.n === 1 ? 'rezervare de facturat' : 'rezervări de facturat'} în 5StarDesk`,
      detaliu: `${lei(stare.deFacturat.total)} lei, pe prețul complet (borderou + comision) · check-out trecut`, href: `/${f.slug}/${luna}/5stardesk`, icon: 'star', urgenta: stare.deFacturat.vechi ? 'curand' : 'normal' })
    if (stare?.stardesk?.bookingLipsa) items.push({ ...base, id: `bklipsa-${f.id}`, titlu: `${stare.stardesk.bookingLipsa} rezervări Booking lipsă din borderou`,
      detaliu: 'Au factură 5StarDesk cu check-out în perioadă, dar nu apar în borderoul Booking — verifică borderoul descărcat', href: `/${f.slug}/${luna}/5stardesk`, icon: 'bed', urgenta: 'curand' })
    if (stare?.mailDeschise) items.push({ ...base, id: `mail-${f.id}`, titlu: `${stare.mailDeschise} ${stare.mailDeschise === 1 ? 'situație deschisă' : 'situații deschise'} din mailul contabilului`,
      detaliu: stare.mailVechi ? `${stare.mailVechi} mai vechi de 14 zile — răspunde înainte de închiderea lunii` : 'Rezolvă și trimite răspunsul din Mail contabil', href: `/${f.slug}/${luna}/mail-contabil`, icon: 'mail', urgenta: stare.mailVechi ? 'curand' : 'normal' })
    if (stare?.inboxNeasociateVechi) items.push({ ...base, id: `inboxv-${f.id}`, titlu: `${stare.inboxNeasociateVechi} ${stare.inboxNeasociateVechi === 1 ? 'factură neasociată' : 'facturi neasociate'} de peste 30 de zile`,
      detaliu: 'Plătite cash → Facturi + chitanță · prin bancă → asociază în Extras · neplătite → Facturi restante', href: `/${f.slug}/${luna}/inbox-facturi`, icon: 'inbox', urgenta: 'normal' })
    if (stare && stare.extrase > 0 && !stare.pachetTrimis && azi.getDate() >= 5) items.push({ ...base, id: `pachet-${f.id}`, titlu: 'Trimite pachetul lunii la contabil',
      detaliu: 'ZIP + lista de discrepanțe + răspunsul la mailul contabilului', href: `/${f.slug}/${luna}/mail-contabil`, icon: 'send', urgenta: azi.getDate() >= 10 ? 'curand' : 'normal' })
    const off = new Set((moduleStari || []).filter(m => m.dezactivat).map(m => m.modul_slug))
    const active = modules.filter(m => !off.has(m.slug))

    // Termen impozite
    const imp = active.find(m => m.slug === 'impozite')
    const impRamase = imp ? imp.tasks.filter(t => !done.has(t.key)) : []
    if (impRamase.length) {
      const zile = zilePana(luna, TERMEN_IMPOZITE, azi)
      items.push({ ...base, id: `imp-${f.id}`, titlu: `Plată impozite — ${impRamase.length} ${impRamase.length === 1 ? 'neplătit' : 'neplătite'}`,
        detaliu: `${impRamase.map(t => t.label).slice(0, 3).join(', ')}${impRamase.length > 3 ? '…' : ''} · termen ${TERMEN_IMPOZITE} ale lunii`,
        href: `/${f.slug}/${luna}/impozite`, icon: 'percent', zile, urgenta: zile < 0 ? 'depasit' : zile <= 5 ? 'curand' : 'normal' })
    }

    // Tranzactii: deschise + cheltuieli ignorate de verificat
    const extrasIds = (extrase || []).map(e => e.id)
    if (extrasIds.length) {
      let txRes: any = await sb.from('tranzactii').select('tip,document_id,note,motiv_ignorare').in('extras_id', extrasIds)
      if (txRes.error) txRes = await sb.from('tranzactii').select('tip,document_id,note').in('extras_id', extrasIds)
      const txs: any[] = txRes.data || []
      const deschise = txs.filter(t => !t.document_id && t.note !== 'na').length
      const deVerificat = 'motiv_ignorare' in (txs[0] || {}) ? txs.filter(t => ignorareDeVerificat(t)).length : 0
      const vechi = stare?.txFaraDocumentVechi || 0
      if (deschise) items.push({ ...base, id: `tx-${f.id}`, titlu: `${deschise} ${deschise === 1 ? 'tranzacție fără document' : 'tranzacții fără document'}`, detaliu: vechi ? `Extras de cont · ${vechi} mai vechi de 14 zile` : 'Extras de cont', href: `/${f.slug}/${luna}/extras`, icon: 'bank', urgenta: vechi ? 'curand' : 'normal' })
      if (deVerificat) items.push({ ...base, id: `verif-${f.id}`, titlu: `${deVerificat} ${deVerificat === 1 ? 'cheltuială ignorată' : 'cheltuieli ignorate'} de verificat`, detaliu: 'Fără motiv justificat — probabil lipsește factura sau bonul', href: `/${f.slug}/${luna}/extras`, icon: 'alert', urgenta: 'curand' })
    } else if (active.some(m => m.slug === 'extras')) {
      items.push({ ...base, id: `ext-${f.id}`, titlu: 'Extrasul de cont nu e încărcat', href: `/${f.slug}/${luna}/extras`, icon: 'bank', urgenta: 'normal' })
    }

    if (bonRes.count) items.push({ ...base, id: `bon-${f.id}`, titlu: `${bonRes.count} ${bonRes.count === 1 ? 'bon' : 'bonuri'} în așteptare`, detaliu: 'Neasociate încă cu o tranzacție', href: `/${f.slug}/${luna}/bonuri`, icon: 'fuel', urgenta: 'normal' })
    if (faRes.count) items.push({ ...base, id: `fa-${f.id}`, titlu: `${faRes.count} ${faRes.count === 1 ? 'factură de asociat' : 'facturi de asociat'}`, detaliu: 'Se potrivesc automat la importul extrasului', href: `/${f.slug}/facturi-de-asociat`, icon: 'link', urgenta: 'normal' })
    const rest = restanteMap[f.id] || 0
    if (rest) items.push({ ...base, id: `rest-${f.id}`, titlu: `${rest} ${rest === 1 ? 'factură restantă' : 'facturi restante'}`, href: `/${f.slug}/${luna}/facturi-restante`, icon: 'alert', urgenta: 'curand' })

    // Urmatorul modul nebifat (ordinea de lucru), daca nu e deja acoperit mai sus
    const next = active.find(m => m.slug !== 'impozite' && m.tasks.some(t => !done.has(t.key)))
    if (next) {
      const ram = next.tasks.filter(t => !done.has(t.key))
      items.push({ ...base, id: `next-${f.id}`, titlu: `Continuă: ${next.label}`, detaliu: ram.slice(0, 2).map(t => t.label).join(', ') + (ram.length > 2 ? ` +${ram.length - 2}` : ''), href: `/${f.slug}/${luna}/${next.linkDirect || next.slug}`, icon: 'arrowRight', urgenta: 'normal' })
    }
  }))

  const rang = { depasit: 0, curand: 1, normal: 2 }
  return items.sort((a, b) => rang[a.urgenta] - rang[b.urgenta] || (a.zile ?? 99) - (b.zile ?? 99) || a.firmaNume.localeCompare(b.firmaNume))
}
