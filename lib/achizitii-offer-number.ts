export interface OfferDocument { fisier_nume: string; furnizor?: string | null }
export function supplierKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}
export function offerGroup(doc: OfferDocument): string | null {
  const marker = doc.fisier_nume.match(/\[furnizor=([a-z0-9_]+)\]/i)?.[1]
  if (marker) return marker.toLowerCase()
  if (/^Oferta [1-3]\.pdf$/i.test(doc.fisier_nume) && doc.furnizor) return supplierKey(doc.furnizor)
  return null
}
export function nextOfferNumber(docs: OfferDocument[], supplier: string): number {
  const key = supplierKey(supplier)
  if (!key) throw new Error('Completează furnizorul ofertei.')
  const offers = docs.filter(doc => /ofert/i.test(doc.fisier_nume) && !/cerere|anexa\s*2/i.test(doc.fisier_nume))
  if (offers.some(doc => offerGroup(doc) === key)) throw new Error('Există deja o ofertă salvată pentru acest furnizor. Nu o suprascriem.')
  const used = new Set<number>()
  for (const doc of offers) {
    const slot = doc.fisier_nume.match(/^Oferta ([1-3])\.pdf$/i)?.[1]
    if (slot) used.add(Number(slot))
  }
  const groups = new Set<string>()
  for (const [index, doc] of offers.entries()) {
    if (/^Oferta [1-3]\.pdf$/i.test(doc.fisier_nume)) continue
    const group = offerGroup(doc) || `legacy-${index}`
    if (groups.has(group)) continue
    groups.add(group)
    const free = [1, 2, 3].find(number => !used.has(number))
    if (!free) throw new Error('Dosarul are deja trei oferte. Verifică documentele existente.')
    used.add(free)
  }
  const number = [1, 2, 3].find(number => !used.has(number))
  if (!number) throw new Error('Dosarul are deja trei oferte. Verifică documentele existente.')
  return number
}
