import type { Draft, FormKind, Workflow } from './proiect-workflow'

export interface PurchaseContext { denumire: string; nota: string | null; valoare: number | null }
export interface FieldRecommendation { value: string; source: string }

export const PURCHASE_FIELD_HELP: Record<string, string> = {
  numar: 'Numărul din registrul intern pentru acest document, de exemplu 12/2026. Nu reutiliza automat numărul altui document.',
  data: 'Data reală a emiterii documentului, în format ZZ.LL.AAAA; pentru recepție, data efectivă a recepției.',
  achizitie: 'Denumirea din dosarul achiziției și linia de buget, nu denumirea juridică a furnizorului.',
  tip: 'Produse, Servicii sau Lucrări, conform achiziției.',
  furnizor: 'Denumirea juridică exactă din oferta acestui furnizor, nu doar marca sau numele magazinului.',
  adresa_furnizor: 'Sediul furnizorului din ofertă sau datele sale oficiale.',
  identificare_furnizor: 'CUI și numărul ONRC ale furnizorului din oferta verificată.',
  conditii: 'Exemplu de structură: oferta până la [data]; livrare la [adresa] în [termen]; garanție [durată]; montaj [inclus/neinclus]; prețul și TVA evidențiate separat.',
  justificare: 'Identifică ofertele comparate, oferta selectată, valoarea fără TVA și motivul alegerii. Nu declara existența unor oferte pe care nu le ai.',
  referinta: 'Numărul și data contractului / facturii care aparțin acestei achiziții.',
  constatari: 'Ce ai recepționat efectiv, cantitățile, eventualele diferențe și documentele anexate. Nu confirma recepția înainte de livrare.',
  reprezentant_furnizor: 'Persoana prezentă la recepție sau mențiunea aplicabilă comenzii online.',
  comanda_online: 'Alege da / nu după modul real de comandă.',
}

export function purchaseRecommendations(kind: FormKind, state: Workflow, purchase: PurchaseContext | null): Record<string, FieldRecommendation> {
  const result: Record<string, FieldRecommendation> = {}
  const shared = ['achizitie', 'tip', 'furnizor', 'adresa_furnizor', 'identificare_furnizor', 'reprezentant_furnizor', 'referinta']
  for (const key of shared) {
    const candidates = Object.entries(state.forms).filter(([form]) => form !== kind && ['oferta', 'nota', 'receptie'].includes(form)).map(([form, draft]) => ({ value: draft.fields[key]?.trim(), form })).filter(x => x.value)
    if (candidates.length && new Set(candidates.map(x => x.value)).size === 1) result[key] = { value: candidates[0].value!, source: `Formularul ${candidates[0].form === 'oferta' ? 'cerere de ofertă' : candidates[0].form === 'nota' ? 'notă de estimare' : 'recepție'} din acest dosar` }
  }
  if (purchase?.denumire.trim() && !result.achizitie) result.achizitie = { value: purchase.denumire.trim(), source: 'Denumirea salvată a achiziției' }
  const type = purchase?.nota?.match(/(?:^|\s)Tip: (Produse|Servicii|Lucrări)\./)?.[1]
  if (type && !result.tip) result.tip = { value: type, source: 'Nota salvată la crearea achiziției' }
  return result
}

export function purchaseProductExample(purchase: PurchaseContext | null): Pick<Draft['lines'][number], 'product' | 'specs'> | null {
  if (!purchase?.denumire.trim()) return null
  return { product: purchase.denumire.trim(), specs: purchase.nota?.split('Specificații tehnice minime: ')[1]?.trim() || '' }
}

export function prefillPurchaseForms(state: Workflow, purchase: PurchaseContext | null): Workflow {
  const forms = { ...state.forms }
  const product = purchaseProductExample(purchase)
  for (const kind of ['oferta', 'nota', 'receptie'] as const) {
    const current = forms[kind] || { fields: kind === 'receptie' ? { comanda_online: 'nu' } : {}, lines: [{ supplier: '', product: '', specs: '', unit: 'buc', qty: '1', price: '', currency: 'RON', rate: '1', source: '', date: '' }] }
    const fields = { ...current.fields }
    for (const [key, suggestion] of Object.entries(purchaseRecommendations(kind, state, purchase))) {
      if (!fields[key]?.trim()) fields[key] = suggestion.value
    }
    const lines = current.lines.map(line => ({ ...line }))
    if (product) {
      const blank = lines.find(line => !line.product.trim() && !line.specs.trim() && !line.supplier.trim() && !line.price.trim() && !line.source.trim() && !line.date.trim())
      if (blank) Object.assign(blank, product)
    }
    forms[kind] = { fields, lines }
  }
  return { ...state, forms }
}

export function isCompletedPurchaseExample(name: string, kind: FormKind): boolean {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/sablon|template|model necompletat/.test(normalized)) return false
  const patterns = { oferta: /cerere[ _-]*(de[ _-]*)?oferta|anexa[ _-]*2\b/, nota: /nota.*(estim|determin|valor)|anexa[ _-]*1\b/, receptie: /receptie|anexa[ _-]*3\b/ }
  return kind in patterns && patterns[kind as keyof typeof patterns].test(normalized)
}
