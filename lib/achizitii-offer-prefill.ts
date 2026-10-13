import type { Draft, Line } from './proiect-workflow'
import { purchaseAmounts } from './achizitii-vat'

export interface PrefillOfferSource { id: string; fisier_nume: string; furnizor?: string | null; suma?: number | null; valuta?: string | null }
export interface OfferProposal { id: string; name: string; lines: Line[]; warnings: string[]; savedTotal?: number; savedCurrency?: string }
export interface NoteOfferFormat { product: string; quantity: '1' }

export function offerWebsite(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000) return ''
  try {
    const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`)
    return ['https:', 'http:'].includes(url.protocol) && url.hostname.includes('.') && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}

export function parseOfferProposals(raw: string, docs: PrefillOfferSource[], origin: string, format?: NoteOfferFormat): OfferProposal[] {
  const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim())
  if (!Array.isArray(parsed.offers) || parsed.offers.length > 3) throw new Error('Răspuns AI invalid.')
  const common = Array.isArray(parsed.commonSpecs) && parsed.commonSpecs.length >= 3 && parsed.commonSpecs.length <= 4 && parsed.commonSpecs.every((value: unknown) => typeof value === 'string' && value.trim() && value.length <= 500) ? parsed.commonSpecs.map((value: string) => `- ${value.trim().replace(/^[-•]\s*/, '')}`).join('\n') : ''
  const seen = new Set<string>()
  let count = 0
  const text = (value: unknown, max = 2000) => typeof value === 'string' ? value.trim().slice(0, max) : ''
  const number = (value: unknown, positive: boolean) => {
    if (value == null || value === '') return ''
    const valueText = typeof value === 'number' ? String(value) : text(value).replace(',', '.')
    const numeric = Number(valueText)
    return /^\d+(?:\.\d+)?$/.test(valueText) && Number.isFinite(numeric) && numeric <= 1e9 && (positive ? numeric > 0 : numeric >= 0) ? valueText : ''
  }
  return parsed.offers.map((offer: { id?: unknown; lines?: unknown; warnings?: unknown }) => {
    const doc = docs.find(doc => doc.id === offer?.id)
    if (!doc || seen.has(doc.id) || !Array.isArray(offer.lines) || offer.lines.length > 20 || (count += offer.lines.length) > 20) throw new Error('Surse sau poziții AI invalide.')
    seen.add(doc.id)
    const warnings = Array.isArray(offer.warnings) ? offer.warnings.filter((value): value is string => typeof value === 'string').slice(0, 5).map(value => value.slice(0, 500)) : []
    const lines: Line[] = offer.lines.filter(row => row && typeof row === 'object' && text(row.product)).map(row => {
      const currency = /^[A-Z]{3}$/.test(row.currency) ? row.currency : ''
      const mode = row.priceMode === 'gross' || row.priceMode === 'net' ? row.priceMode : null
      const price = mode ? number(row.price, false) : ''
      const date = /^\d{2}\.\d{2}\.\d{4}$/.test(row.date) ? row.date : ''
      const page = Number.isInteger(row.page) && row.page > 0 && row.page <= 100 ? ` · pagina ${row.page}` : ''
      if (!price || !currency || !number(row.qty, true) || !date || !text(row.specs)) warnings.push(`${text(row.product)}: verifică și completează datele lipsă; nu au fost presupuse.`)
      const website = offerWebsite(row.website)
      const netPrice = format && price && mode === 'gross' ? purchaseAmounts(price, '1', '1', 'gross')?.netUnit.toFixed(2) || '' : price
      if (format && !website) warnings.push('Site-ul furnizorului nu apare clar în ofertă; completează-l după verificare.')
      if (format && !common) warnings.push('Nu există 3–4 specificații comune confirmate. Revizuiește descrierile înainte de generare.')
      return { supplier: text(doc.furnizor || row.supplier), website, product: text(format?.product || row.product), specs: format && common ? common : text(row.specs, 4000), unit: text(row.unit, 30) || (format ? 'buc' : ''), qty: format?.quantity || number(row.qty, true), price: netPrice, priceMode: format && mode ? 'net' : mode || 'gross', currency, rate: currency === 'RON' ? '1' : '', source: `${doc.fisier_nume}${page}${format ? ` · ${text(row.product)}` : ''} · ${origin}/api/chitante/document?id=${encodeURIComponent(doc.id)}`, date }
    })
    if (!lines.length) warnings.push('Nu au fost identificate produse clare în acest PDF.')
    const savedTotal = typeof doc.suma === 'number' && Number.isFinite(doc.suma) && doc.suma > 0 ? doc.suma : undefined
    if (savedTotal != null && lines.length === 1 && doc.valuta === lines[0].currency) {
      const amount = purchaseAmounts(lines[0].price, lines[0].qty, '1', lines[0].priceMode)
      if (amount && Math.abs(amount.grossTotal - savedTotal) > 0.02) warnings.push('Prețul citit din PDF diferă de totalul salvat al ofertei. Verifică înainte de preluare; nu modificăm prețul salvat.')
    }
    return { id: doc.id, name: doc.fisier_nume, lines, warnings: [...new Set(warnings)].slice(0, 10), ...(savedTotal != null ? { savedTotal, savedCurrency: doc.valuta || undefined } : {}) }
  })
}

export function appendOfferProposal(draft: Draft, proposal: OfferProposal): Draft {
  const lines = draft.lines.filter(line => [line.product, line.specs, line.supplier, line.price, line.source, line.date].some(value => value.trim()) || line.qty !== '1' || line.unit !== 'buc' || line.currency !== 'RON' || line.rate !== '1')
  const pending = proposal.lines.filter(row => !lines.some(line => line.source === row.source && line.product === row.product))
  if (lines.length + pending.length > 20) throw new Error('Maximum 20 de poziții în formular. Verifică pozițiile existente.')
  return { fields: { ...draft.fields }, lines: [...lines, ...pending.map(row => ({ ...row }))] }
}

export function offerSelectionText(proposal: OfferProposal): string {
  const priced = proposal.lines.map(line => ({ line, amount: purchaseAmounts(line.price, line.qty, '1', line.priceMode) }))
  const currencies = new Set(proposal.lines.map(line => line.currency))
  const complete = priced.length === 1 && priced.every(row => !!row.amount && !!row.line.currency) && currencies.size === 1
  const total = complete ? priced.reduce((sum, row) => sum + row.amount!.netTotal, 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ` ${proposal.lines[0].currency} fără TVA` : '[valoarea fără TVA de verificat]'
  return `Oferta selectată: ${proposal.lines[0]?.supplier || '[furnizor de completat]'}, conform ${proposal.name}. Valoarea: ${total}. Motivul alegerii: [completează după compararea specificațiilor, prețului și condițiilor ofertelor]. Nu se presupune că oferta cea mai ieftină este automat comparabilă sau eligibilă.`
}

export function lowestNoteOffer(draft: Draft): { index: number; amount: number; text: string } | null {
  if (draft.lines.length !== 3 || new Set(draft.lines.map(line => line.supplier.trim().toLocaleLowerCase('ro-RO'))).size !== 3 || draft.lines.some(line => !line.supplier.trim() || !line.source.trim() || !line.product.trim() || !line.specs.trim() || line.currency !== 'RON' || Number(line.qty) !== 1)) return null
  if (new Set(draft.lines.map(line => line.product.trim().toLocaleLowerCase('ro-RO'))).size !== 1 || new Set(draft.lines.map(line => line.specs.trim())).size !== 1) return null
  const values = draft.lines.map(line => purchaseAmounts(line.price, line.qty, line.rate, line.priceMode || 'net'))
  if (values.some(value => !value)) return null
  const minimum = Math.min(...values.map(value => value!.netTotal))
  const indexes = values.map((value, index) => value!.netTotal === minimum ? index : -1).filter(index => index >= 0)
  if (indexes.length !== 1) return null
  const index = indexes[0]
  // Formularea exacta din Anexa 1 aprobata (valoarea fara separator de mii, ca in document: "2644,55 lei fara TVA").
  const amount = minimum.toFixed(2).replace('.', ',')
  return { index, amount: minimum, text: `În urma analizei ofertelor consultate, a fost selectată oferta NR ${index + 1}, în valoare de ${amount} lei fara TVA având prețul cel mai scăzut, respectă specificațiile tehnice și este conformă din punct de vedere al termenului de livrare și al condițiilor comerciale.` }
}
