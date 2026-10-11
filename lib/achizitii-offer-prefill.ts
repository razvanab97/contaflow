import type { Draft, Line } from './proiect-workflow'
import { purchaseAmounts } from './achizitii-vat'

export interface PrefillOfferSource { id: string; fisier_nume: string; furnizor?: string | null; suma?: number | null; valuta?: string | null }
export interface OfferProposal { id: string; name: string; lines: Line[]; warnings: string[]; savedTotal?: number; savedCurrency?: string }

export function parseOfferProposals(raw: string, docs: PrefillOfferSource[], origin: string): OfferProposal[] {
  const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim())
  if (!Array.isArray(parsed.offers) || parsed.offers.length > 3) throw new Error('Răspuns AI invalid.')
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
      return { supplier: text(doc.furnizor || row.supplier), product: text(row.product), specs: text(row.specs, 4000), unit: text(row.unit, 30), qty: number(row.qty, true), price, priceMode: mode || 'gross', currency, rate: currency === 'RON' ? '1' : '', source: `${doc.fisier_nume}${page} · ${origin}/api/chitante/document?id=${encodeURIComponent(doc.id)}`, date }
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
