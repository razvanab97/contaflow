import { getServiceSupabase } from '@/lib/supabase/server'
import { citesteAvizComplet, type LinieAviz } from '@/lib/emag-aviz-complet'
import { cursuriBnr } from '@/lib/curs-bnr'
import { collectPaged } from '@/lib/raport-lunar'

// "Concluzia eMAG" pe o luna: de la vanzarile din avizele de plata (borderou) pana la banii
// incasati in extras si la tot ce s-a dus pe drum - retinerile eMAG din aviz (comisioane, vouchere,
// retineri curier/easybox, alte facturi), facturile Dante platite separat si curieratul (Sameday,
// Cargus, Curiera, Woot etc.). Toate sumele in lei; pentru avizele in valuta se foloseste cursul
// efectiv al incasarii din extras (cand se gaseste), altfel cursul BNR din data avizului.

const AVIZ_LABEL: Record<string, string> = {
  'emag.aviz_ro_inceput': 'RO · început de lună', 'emag.aviz_ro_jumatate': 'RO · jumătate de lună',
  'emag.aviz_bg_inceput': 'BG · început de lună', 'emag.aviz_bg_jumatate': 'BG · jumătate de lună',
  'emag.aviz_hu_inceput': 'HU · început de lună', 'emag.aviz_hu_jumatate': 'HU · jumătate de lună',
}
function valutaAviz(taskKey: string, citita: string | null) {
  const k = taskKey.toLowerCase()
  if (k.includes('_bg')) return 'EUR'
  if (k.includes('_hu')) return 'HUF'
  if (k.includes('_ro')) return 'RON'
  return citita || 'RON'
}

function numeCurier(s: string) {
  const t = s.toLowerCase()
  if (/sameday|delivery solutions|easybox/.test(t)) return 'Sameday'
  if (/cargus/.test(t)) return 'Cargus'
  if (/curiera/.test(t)) return 'Curiera'
  if (/woot/.test(t)) return 'Woot'
  if (/fan ?courier/.test(t)) return 'FAN Courier'
  if (/\bdpd\b/.test(t)) return 'DPD'
  if (/\bgls\b/.test(t)) return 'GLS'
  if (/packeta/.test(t)) return 'Packeta'
  if (/dhl/.test(t)) return 'DHL'
  return s.split(/\s+/).slice(0, 2).join(' ')
}

export const RE_CURIER = /sameday|delivery solutions|cargus|curiera|\bwoot\b|fan ?courier|\bdpd\b|\bgls\b|packeta|nemo express|bookurier|memex|\bdhl\b|\bups\b|\btnt\b|easybox/i
const RE_INCASARE_EMAG = /emag|dante international/i
const RE_PLATA_EMAG = /emag|dante international/i

const r2 = (n: number) => Math.round(n * 100) / 100
const norm = (s: string | null | undefined) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
function zile(a: string, b: string) { return Math.abs(Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86400000 }
function lunaAnterioara(lunaLucru: string) { const [y, m] = lunaLucru.split('-').map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return d.toISOString().slice(0, 7) }

export interface AvizRezumat {
  documentId: string; taskKey: string; label: string; numar: string; valuta: string; data: string | null
  total: number; curs: number; sursaCurs: 'extras' | 'bnr' | 'ron'; totalLei: number
  peTip: Record<LinieAviz['tip'], number>   // in lei
  incasare: { data: string; suma: number; descriere: string } | null
}
export interface ConcluzieEmag {
  avize: AvizRezumat[]
  vanzari: number
  retineri: { comision: number; voucher: number; transport: number; retur: number; alte: number; total: number }
  netAviz: number
  incasat: number
  neincasat: AvizRezumat[]
  incasariFaraAviz: { data: string; suma: number; descriere: string }[]
  dante: { separat: { numar: string; categorie: string; suma: number; data: string | null; efect: string; platit: boolean }[]; inAviz: number; totalSeparat: number }
  platiEmagFaraFactura: { data: string; suma: number; descriere: string }[]
  curierat: {
    peCurier: { curier: string; facturat: number; platit: number; cost: number; baza: 'plati' | 'facturi'; facturi: { suma: number; data: string | null }[]; plati: { data: string; suma: number }[] }[]
    total: number
  }
  rezultat: number
  avertismente: string[]
  avizeCitite: boolean
}

function metadataDante(furnizor: string | null, path: string | null, numar: string | null) {
  const src = String(furnizor || '')
  const v = (l: string) => src.match(new RegExp(`${l}: ([^|]+)`))?.[1]?.trim() || ''
  return {
    suma: Number(v('Suma')) || 0,
    efect: v('Efect') === 'reducere' ? 'reducere' : 'cheltuiala',
    categorie: String(path || '').split('/emag-calcul/')[1]?.split('/')[0] || 'altele',
    data: v('Data') || null,
    numar: numar || '',
  }
}

export async function getConcluzieEmag(lunaId: string): Promise<ConcluzieEmag> {
  const sb = getServiceSupabase()
  const avertismente: string[] = []
  const { data: luna } = await sb.from('luni_contabile').select('id,firma_id,luna').eq('id', lunaId).single()
  if (!luna) throw new Error('Luna nu există')
  const lunaLucru = String(luna.luna).slice(0, 7)
  const lunaContabila = lunaAnterioara(lunaLucru)

  // 1. Avizele lunii + continutul complet (din cache sau citit acum cu AI)
  const { data: avizeDocs } = await sb.from('documente').select('id,furnizor,numar_document,fisier_path')
    .eq('luna_id', lunaId).eq('modul', 'emag').eq('tip_document', 'aviz_plata')
  const ids = (avizeDocs || []).map(a => a.id)
  let cache: any[] = []
  let areCache = true
  if (ids.length) {
    const c = await sb.from('emag_aviz_rezumat').select('*').in('document_id', ids)
    if (c.error) areCache = false
    else cache = c.data || []
  }
  const dinCache = new Map(cache.map(c => [c.document_id, c]))
  let avizeCitite = true
  const continut = new Map<string, { linii: LinieAviz[]; total: number | null; data: string | null; valuta: string | null }>()
  await Promise.all((avizeDocs || []).map(async a => {
    const c = dinCache.get(a.id)
    if (c) { continut.set(a.id, { linii: c.linii || [], total: c.total_plata != null ? Number(c.total_plata) : null, data: c.data_aviz, valuta: c.valuta }); return }
    const { data: file } = await sb.storage.from('documente').download(a.fisier_path)
    const citit = file ? await citesteAvizComplet(new Uint8Array(await file.arrayBuffer())) : null
    if (!citit) { avizeCitite = false; avertismente.push(`Avizul ${a.numar_document || a.furnizor} nu a putut fi citit.`); return }
    continut.set(a.id, { linii: citit.linii, total: citit.totalPlata, data: citit.dataAviz, valuta: citit.valuta })
    if (areCache) await sb.from('emag_aviz_rezumat').upsert({ document_id: a.id, valuta: citit.valuta, linii: citit.linii, total_plata: citit.totalPlata, data_aviz: citit.dataAviz })
  }))

  // 2. Tranzactiile lunii (extrasele atasate lunii)
  const { data: extrase } = await sb.from('extrase').select('id').eq('luna_id', lunaId)
  const extrasIds = (extrase || []).map(e => e.id)
  const txs: any[] = extrasIds.length
    ? await collectPaged<any>((x, y) => sb.from('tranzactii').select('id,data_tranzactie,tip,suma,valuta,descriere,descriere_curatata').in('extras_id', extrasIds).order('id').range(x, y) as any)
    : []
  const descr = (t: any) => `${t.descriere_curatata || ''} ${t.descriere || ''}`
  const crediteEmag = txs.filter(t => t.tip === 'credit' && RE_INCASARE_EMAG.test(descr(t)))
  const curs = await cursuriBnr([...[...continut.values()].map(c => c.data || `${lunaContabila}-15`), `${lunaContabila}-15`]).catch(() => null)

  // 3. Fiecare aviz: valuta, curs (efectiv din extras sau BNR), incasarea potrivita
  const folosite = new Set<string>()
  const avize: AvizRezumat[] = []
  for (const a of avizeDocs || []) {
    const c = continut.get(a.id)
    if (!c) continue
    const taskKey = a.furnizor || ''
    const valuta = valutaAviz(taskKey, c.valuta)
    const total = c.total ?? r2(c.linii.reduce((s, l) => s + l.valoare, 0))
    const dataRef = c.data || `${lunaContabila}-15`
    let incasare: AvizRezumat['incasare'] = null
    let rata = 1
    let sursa: AvizRezumat['sursaCurs'] = 'ron'
    if (valuta === 'RON') {
      const t = crediteEmag.find(t => !folosite.has(t.id) && (t.valuta || 'RON') === 'RON' && Math.abs(Number(t.suma) - total) < 0.05)
      if (t) { folosite.add(t.id); incasare = { data: t.data_tranzactie, suma: Number(t.suma), descriere: descr(t).trim() } }
    } else {
      const bnr = curs?.(dataRef, valuta) ?? null
      const asteptat = bnr ? total * bnr : null
      const cand = crediteEmag
        .filter(t => !folosite.has(t.id) && zile(t.data_tranzactie, dataRef) <= 12)
        .map(t => {
          const v = (t.valuta || 'RON').toUpperCase()
          if (v === valuta) return { t, ok: Math.abs(Number(t.suma) - total) < 0.05, diff: Math.abs(Number(t.suma) - total) }
          if (v === 'RON' && asteptat) { const d = Math.abs(Number(t.suma) - asteptat) / asteptat; return { t, ok: d < 0.04, diff: d } }
          return { t, ok: false, diff: 1 }
        })
        .filter(x => x.ok).sort((x, y) => x.diff - y.diff)
      const best = cand[0]?.t
      if (best) {
        folosite.add(best.id)
        incasare = { data: best.data_tranzactie, suma: Number(best.suma), descriere: descr(best).trim() }
        rata = (best.valuta || 'RON').toUpperCase() === 'RON' && total ? Number(best.suma) / total : (bnr || 1)
        sursa = (best.valuta || 'RON').toUpperCase() === 'RON' ? 'extras' : 'bnr'
      } else if (bnr) { rata = bnr; sursa = 'bnr' }
      else avertismente.push(`Nu am curs pentru ${valuta} la avizul ${a.numar_document || ''}.`)
    }
    const peTip = { vanzare: 0, comision: 0, voucher: 0, transport: 0, retur: 0, alte: 0 } as Record<LinieAviz['tip'], number>
    for (const l of c.linii) peTip[l.tip] = (peTip[l.tip] || 0) + l.valoare * rata
    for (const k of Object.keys(peTip) as LinieAviz['tip'][]) peTip[k] = r2(peTip[k])
    avize.push({ documentId: a.id, taskKey, label: AVIZ_LABEL[taskKey] || taskKey, numar: a.numar_document || '', valuta, data: c.data, total, curs: Math.round(rata * 10000) / 10000, sursaCurs: sursa, totalLei: r2(total * rata), peTip, incasare })
  }
  avize.sort((x, y) => x.label.localeCompare(y.label))

  const sum = (f: (a: AvizRezumat) => number) => r2(avize.reduce((s, a) => s + f(a), 0))
  const vanzari = sum(a => a.peTip.vanzare)
  const ret = { comision: sum(a => a.peTip.comision), voucher: sum(a => a.peTip.voucher), transport: sum(a => a.peTip.transport), retur: sum(a => a.peTip.retur), alte: sum(a => a.peTip.alte), total: 0 }
  ret.total = r2(ret.comision + ret.voucher + ret.transport + ret.retur + ret.alte)
  const netAviz = sum(a => a.totalLei)
  const incasat = r2(avize.reduce((s, a) => s + (a.incasare ? (a.valuta === 'RON' || a.sursaCurs === 'extras' ? a.incasare.suma : a.totalLei) : 0), 0))

  // 4. Facturi Dante incarcate separat: cele deja retinute in aviz (acelasi numar/serie) nu se mai adauga.
  const seriiAviz = new Set<string>()
  for (const c of continut.values()) for (const l of c.linii) if (l.serie) seriiAviz.add(norm(l.serie))
  if (ids.length) {
    const { data: linii } = await sb.from('emag_avize_facturi').select('id_document,serie_document').in('document_id', ids)
    for (const l of linii || []) { if (l.serie_document) seriiAviz.add(norm(l.serie_document)); if (l.id_document) seriiAviz.add(norm(l.id_document)) }
  }
  const { data: danteDocs } = await sb.from('documente').select('furnizor,fisier_path,numar_document').eq('luna_id', lunaId).like('fisier_path', '%/emag-calcul/%')
  const danteSeparat: ConcluzieEmag['dante']['separat'] = []
  let inAviz = 0
  for (const d of danteDocs || []) {
    const m = metadataDante(d.furnizor, d.fisier_path, d.numar_document)
    if (m.numar && seriiAviz.has(norm(m.numar))) { inAviz++; continue }
    danteSeparat.push({ numar: m.numar, categorie: m.categorie, suma: m.efect === 'reducere' ? -m.suma : m.suma, data: m.data, efect: m.efect, platit: false })
  }
  // Plati directe catre eMAG/Dante din extras (ex. PayU eMAG): legate de o factura Dante separata
  // dupa suma; cele fara factura intra separat in cost.
  const platiEmag = txs.filter(t => t.tip === 'debit' && RE_PLATA_EMAG.test(descr(t)) && !RE_CURIER.test(descr(t)))
  const platiEmagFaraFactura: ConcluzieEmag['platiEmagFaraFactura'] = []
  for (const p of platiEmag) {
    const f = danteSeparat.find(f => !f.platit && Math.abs(Math.abs(f.suma) - Number(p.suma)) < 0.05)
    if (f) f.platit = true
    else platiEmagFaraFactura.push({ data: p.data_tranzactie, suma: Number(p.suma), descriere: descr(p).trim() })
  }
  const totalDante = r2(danteSeparat.reduce((s, f) => s + f.suma, 0))

  // 5. Curierat: facturile curierilor din luna contabila + platile catre curieri fara factura potrivita.
  const { data: docsFirma } = await sb.from('documente').select('id,furnizor,suma,valuta,data_document,luna_id,modul')
    .eq('firma_id', luna.firma_id).neq('modul', 'emag')
    .or(`data_document.gte.${lunaContabila}-01,luna_id.eq.${lunaId}`)
  const facturiCurier = (docsFirma || []).filter(d => {
    const nume = String(d.furnizor || '').split('|')[0]
    if (!RE_CURIER.test(nume) || d.suma == null) return false
    if (d.data_document) return String(d.data_document).slice(0, 7) === lunaContabila
    return d.luna_id === lunaId
  })
  // Pe fiecare curier, costul = platile reale din extras (banii care chiar au iesit); facturile sunt
  // documentele justificative. Doar daca nu exista nicio plata in extras, costul = facturile (platite
  // altfel, ex. din alt cont). Asa o factura si plata ei (cu sume care nu se potrivesc 1:1, ex. o plata
  // pentru mai multe facturi) nu se aduna de doua ori.
  const grup = new Map<string, ConcluzieEmag['curierat']['peCurier'][number]>()
  const g = (nume: string) => {
    const k = numeCurier(nume)
    if (!grup.has(k)) grup.set(k, { curier: k, facturat: 0, platit: 0, cost: 0, baza: 'facturi', facturi: [], plati: [] })
    return grup.get(k)!
  }
  const vazute = new Set<string>()
  for (const d of facturiCurier) {
    const furnizor = String(d.furnizor || '').split('|')[0].trim()
    const cheie = `${norm(furnizor)}|${d.suma}|${d.data_document}`
    if (vazute.has(cheie)) continue
    vazute.add(cheie)
    const v = (d.valuta || 'RON').toUpperCase()
    const k = v === 'RON' ? 1 : curs?.(d.data_document || `${lunaContabila}-15`, v) ?? null
    if (k == null) { avertismente.push(`Factura ${furnizor} în ${v} nu are curs BNR.`); continue }
    const x = g(furnizor); const suma = r2(Number(d.suma) * k)
    x.facturi.push({ suma, data: d.data_document }); x.facturat = r2(x.facturat + suma)
  }
  for (const p of txs.filter(t => t.tip === 'debit' && RE_CURIER.test(descr(t)))) {
    const x = g(descr(p)); x.plati.push({ data: p.data_tranzactie, suma: Number(p.suma) }); x.platit = r2(x.platit + Number(p.suma))
  }
  for (const x of grup.values()) { x.baza = x.plati.length ? 'plati' : 'facturi'; x.cost = x.plati.length ? x.platit : x.facturat }
  const peCurier = [...grup.values()].sort((a, b) => b.cost - a.cost)
  const totalCurier = r2(peCurier.reduce((s, x) => s + x.cost, 0))

  const neincasat = avize.filter(a => !a.incasare)
  const incasariFaraAviz = crediteEmag.filter(t => !folosite.has(t.id)).map(t => ({ data: t.data_tranzactie, suma: Number(t.suma), descriere: descr(t).trim() }))
  if (!avize.length) avertismente.push('Nu există avize de plată încărcate pentru această lună.')
  const totalPlatiFara = r2(platiEmagFaraFactura.reduce((s, p) => s + p.suma, 0))

  return {
    avize, vanzari, retineri: ret, netAviz, incasat, neincasat, incasariFaraAviz,
    dante: { separat: danteSeparat, inAviz, totalSeparat: totalDante },
    platiEmagFaraFactura,
    curierat: { peCurier, total: totalCurier },
    rezultat: r2(netAviz - totalDante - totalPlatiFara - totalCurier),
    avertismente, avizeCitite,
  }
}
