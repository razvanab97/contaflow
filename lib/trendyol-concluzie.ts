import { getServiceSupabase } from '@/lib/supabase/server'
import { collectPaged } from '@/lib/raport-lunar'
import { citesteBorderouTrendyol, type LinieTrendyol } from '@/lib/trendyol-borderou'

// "Concluzia Trendyol" pe o luna, pe modelul Concluziei eMAG: din borderourile Trendyol (PaymentOrderDetail)
// -> vanzari, retururi, reduceri, comision Trendyol, TRANSPORT (facturi TYD retinute din plata, separat),
// alte taxe -> virat conform borderou -> incasat efectiv in extras (EUR convertit de banca in lei) ->
// diferenta de curs / transfer -> rezultat net. Fiecare incasare Trendyol din extras e „capul” randului
// ei: i se ataseaza borderoul cu acelasi numar de ordin de plata.

const r2 = (n: number) => Math.round(n * 100) / 100
const RE_TRENDYOL = /trendyol/i

export interface PlataTrendyol {
  ordin: string | null
  data: string
  suma: number               // suma din extras, in valuta tranzactiei
  valuta: string
  lei: number                // echivalent lei (din descrierea bancii la incasarile in EUR)
  curs: number | null
  borderou: { documentId: string; fisier: string; totalVanzator: number } | null
}
export interface TaxaTrendyol { nr: string; tip: string; suma: number; data: string | null; ordin: string | null; facturaIncarcata: boolean }
export interface ConcluzieTrendyol {
  plati: PlataTrendyol[]
  borderouriFaraIncasare: { documentId: string; ordin: string | null; fisier: string; totalVanzator: number }[]
  vanzari: number
  retururi: number
  reduceri: number
  comision: number
  transport: number
  taxe: number
  virat: number              // total conform borderourilor (= suma liniilor de mai sus)
  incasatLei: number         // incasarile din extras care au borderou
  diferentaCurs: number      // incasat - virat (curs Trendyol RON->EUR + conversia bancii EUR->RON)
  incasariFaraBorderou: number
  rezultat: number
  facturiTransport: TaxaTrendyol[]
  facturiTaxe: TaxaTrendyol[]
  facturiComision: { nr: string; suma: number | null; data: string | null }[]
  avertismente: string[]
}

function ordinDinDescriere(d: string) {
  return d.match(/\b\d{5,8}\s*-\s*(\d{7,9})\s*-\s*TRENDYOL/i)?.[1] || d.match(/(\d{7,9})\s*-\s*TRENDYOL/i)?.[1] || null
}
function leiDinDescriere(d: string) {
  const m = d.match(/ECHIVALENT\s+LEI\s+([\d.,]+)/i)?.[1]
  if (!m) return null
  const n = Number(m.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
function cursDinDescriere(d: string) {
  const n = Number(d.match(/CURS\s+([\d.]+)/i)?.[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function getConcluzieTrendyol(lunaId: string): Promise<ConcluzieTrendyol> {
  const sb = getServiceSupabase()
  const avertismente: string[] = []

  // 1. Incasarile Trendyol din extrasele lunii
  const { data: extrase } = await sb.from('extrase').select('id').eq('luna_id', lunaId)
  const extrasIds = (extrase || []).map(e => e.id)
  const txs: any[] = extrasIds.length
    ? await collectPaged<any>((x, y) => sb.from('tranzactii').select('id,data_tranzactie,tip,suma,valuta,descriere,descriere_curatata').in('extras_id', extrasIds).order('id').range(x, y) as any)
    : []
  const descr = (t: any) => `${t.descriere || ''} ${t.descriere_curatata || ''}`
  const credite = txs.filter(t => t.tip === 'credit' && RE_TRENDYOL.test(descr(t)))
    .sort((a, b) => String(a.data_tranzactie).localeCompare(String(b.data_tranzactie)))

  // 2. Borderourile incarcate (cate unul pe ordin de plata)
  const { data: docs } = await sb.from('documente').select('id,numar_document,fisier_nume,fisier_path')
    .eq('luna_id', lunaId).eq('modul', 'trendyol').eq('tip_document', 'borderou')
  const borderouri: { documentId: string; ordin: string | null; fisier: string; linii: LinieTrendyol[]; totalVanzator: number }[] = []
  await Promise.all((docs || []).map(async d => {
    const { data: file } = await sb.storage.from('documente').download(d.fisier_path)
    if (!file) { avertismente.push(`Borderoul ${d.numar_document || d.fisier_nume} nu a putut fi descărcat.`); return }
    try {
      const b = await citesteBorderouTrendyol(new Uint8Array(await file.arrayBuffer()), d.fisier_nume)
      borderouri.push({ documentId: d.id, ordin: d.numar_document || b.ordinPlata, fisier: d.fisier_nume, linii: b.linii, totalVanzator: b.totalVanzator })
    } catch (e) { avertismente.push(`Borderoul ${d.numar_document || d.fisier_nume} nu a putut fi citit: ${e instanceof Error ? e.message : e}`) }
  }))

  const folosite = new Set<string>()
  const plati: PlataTrendyol[] = credite.map(t => {
    const d = descr(t)
    const ordin = ordinDinDescriere(d)
    const valuta = String(t.valuta || 'RON').toUpperCase()
    const lei = valuta === 'RON' ? Number(t.suma) : (leiDinDescriere(d) ?? 0)
    if (valuta !== 'RON' && !leiDinDescriere(d)) avertismente.push(`Încasarea Trendyol din ${t.data_tranzactie} (${t.suma} ${valuta}) nu are echivalentul în lei în extras.`)
    const b = ordin ? borderouri.find(x => x.ordin === ordin && !folosite.has(x.documentId)) : undefined
    if (b) folosite.add(b.documentId)
    return {
      ordin, data: t.data_tranzactie, suma: Number(t.suma), valuta, lei: r2(lei), curs: cursDinDescriere(d),
      borderou: b ? { documentId: b.documentId, fisier: b.fisier, totalVanzator: b.totalVanzator } : null,
    }
  })
  const borderouriFaraIncasare = borderouri.filter(b => !folosite.has(b.documentId))
    .map(b => ({ documentId: b.documentId, ordin: b.ordin, fisier: b.fisier, totalVanzator: b.totalVanzator }))
  if (borderouriFaraIncasare.length) avertismente.push(`${borderouriFaraIncasare.length} ${borderouriFaraIncasare.length === 1 ? 'borderou nu are' : 'borderouri nu au'} încasarea în extrasul acestei luni: ${borderouriFaraIncasare.map(b => b.ordin || b.fisier).join(', ')}.`)
  const lipsa = plati.filter(p => !p.borderou)
  if (lipsa.length) avertismente.push(`Lipsesc borderourile pentru ${lipsa.length} ${lipsa.length === 1 ? 'încasare' : 'încasări'}: ${lipsa.map(p => `${p.data.split('-').reverse().join('.')}${p.ordin ? ` (ordin ${p.ordin})` : ''}`).join(', ')} — concluzia e incompletă până le încarci.`)

  // 3. Cascada, doar din borderourile legate de o incasare a lunii
  const legate = borderouri.filter(b => folosite.has(b.documentId))
  const linii = legate.flatMap(b => b.linii.map(l => ({ ...l, ordin: b.ordin })))
  const sum = (f: (l: LinieTrendyol) => number, cond: (l: LinieTrendyol) => boolean) => r2(linii.filter(cond).reduce((s, l) => s + f(l), 0))
  const eProdus = (l: LinieTrendyol) => l.tip === 'vanzare' || l.tip === 'retur' || l.tip === 'reducere' || l.tip === 'ajustare'
  const vanzari = sum(l => l.total, l => l.tip === 'vanzare')
  const retururi = sum(l => l.total, l => l.tip === 'retur')
  const reduceri = sum(l => l.total, l => l.tip === 'reducere')
  // comisionul = diferenta dintre pretul catre client si ce primeste vanzatorul, pe liniile de produs
  const comision = sum(l => l.vanzator - l.total, eProdus)
  const transport = sum(l => l.vanzator, l => l.tip === 'transport')
  const taxe = sum(l => l.vanzator, l => l.tip === 'taxa')
  const virat = r2(legate.reduce((s, b) => s + b.totalVanzator, 0))
  const incasatLei = r2(plati.filter(p => p.borderou).reduce((s, p) => s + p.lei, 0))
  const diferentaCurs = legate.length ? r2(incasatLei - virat) : 0
  const incasariFaraBorderou = r2(lipsa.reduce((s, p) => s + p.lei, 0))

  // 4. Facturile Trendyol incarcate (TYD = transport / taxe, TYC = comision) fata de liniile din borderou
  const { data: facturiDocs } = await sb.from('documente').select('numar_document,suma,data_document')
    .eq('luna_id', lunaId).eq('tip_document', 'factura').like('fisier_path', '%/trendyol/%')
  const nrIncarcate = new Set((facturiDocs || []).map(f => String(f.numar_document || '').toUpperCase()))
  const taxa = (l: LinieTrendyol & { ordin: string | null }): TaxaTrendyol => ({
    nr: l.nr, tip: l.tipOriginal, suma: r2(l.vanzator), data: l.dataPlata, ordin: l.ordin, facturaIncarcata: nrIncarcate.has(l.nr.toUpperCase()),
  })
  const facturiTransport = linii.filter(l => l.tip === 'transport').map(taxa)
  const facturiTaxe = linii.filter(l => l.tip === 'taxa').map(taxa)
  const facturiComision = (facturiDocs || []).filter(f => /^TYC/i.test(String(f.numar_document || '')))
    .map(f => ({ nr: f.numar_document, suma: f.suma == null ? null : Number(f.suma), data: f.data_document }))
  const faraFactura = [...facturiTransport, ...facturiTaxe].filter(f => !f.facturaIncarcata)
  if (faraFactura.length) avertismente.push(`${faraFactura.length} ${faraFactura.length === 1 ? 'factură Trendyol reținută din plată nu e încărcată' : 'facturi Trendyol reținute din plăți nu sunt încărcate'}: ${faraFactura.map(f => f.nr).join(', ')}.`)

  return {
    plati, borderouriFaraIncasare,
    vanzari, retururi, reduceri, comision, transport, taxe, virat, incasatLei, diferentaCurs, incasariFaraBorderou,
    rezultat: legate.length ? incasatLei : 0,
    facturiTransport, facturiTaxe, facturiComision, avertismente,
  }
}
