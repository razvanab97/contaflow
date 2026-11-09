import type { getServiceSupabase } from '@/lib/supabase/server'

// Comenzi marketplace (eMAG, Trendyol, Altex...): o singura plata in extras, dar mai multi vanzatori - deci
// mai multe facturi. Comanda se imparte pe sub-comenzi (o linie = un vanzator = o factura asteptata); facturile
// atasate platii se potrivesc pe linii dupa vanzator si suma, iar ce lipseste ramane vizibil pana vine factura.

type Sb = ReturnType<typeof getServiceSupabase>
export type StareLinie = 'asteptata' | 'primita' | 'anulata'
export interface LinieComanda { id: string; comanda_id: string; ordine: number; vanzator: string; emitent: string | null; subtotal: number; stare: StareLinie; document_id: string | null; nota: string | null }
export interface Comanda { id: string; firma_id: string; tranzactie_id: string; platforma: string; numar_comanda: string | null; data_comanda: string | null; total: number; valuta: string; created_at?: string }
export interface DocTx { id: string; furnizor: string | null; numar_document: string | null; suma: number | null; fisier_nume: string | null; tip_document: string | null }

export const lipsaTabel = (e: { code?: string } | null) => !!e && ['42P01', 'PGRST205'].includes(e.code || '')
const r2 = (n: number) => Math.round(n * 100) / 100
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Cine emite factura pentru produsele vandute de marketplace insusi
const EMITENT_PLATFORMA: Record<string, string> = { emag: 'Dante International', altex: 'Altex Romania', trendyol: 'DSM Grup', flanco: 'Flanco Retail', 'cel.ro': 'Cel.ro' }
export const emitentImplicit = (vanzator: string) => EMITENT_PLATFORMA[norm(vanzator).trim()] || null

const cuvinte = (s: unknown) => new Set(norm(s).replace(/\b(s\.?\s?c\.?|s\.?\s?r\.?\s?l\.?|s\.?a\.?|srl|sa|romania|ro|sp\.? z o\.?o\.?|gmbh|ltd|fbe|shop)\b/g, ' ').split(/[^a-z0-9]+/).filter(w => w.length >= 3))
function asemanare(a: unknown, b: unknown) {
  const x = cuvinte(a), y = cuvinte(b)
  if (!x.size || !y.size) return 0
  let c = 0; x.forEach(w => { if ([...y].some(v => v === w || (w.length >= 5 && (v.startsWith(w) || w.startsWith(v))))) c++ })
  return c / Math.min(x.size, y.size)
}

// Potrivirea documentelor atasate platii cu liniile comenzii: suma egala (±0,05) + vanzatorul / emitentul
// in furnizorul facturii. Fara vanzator recunoscut, doar daca suma e unica in comanda. Intoarce linieId -> docId.
export function potrivesteFacturi(linii: LinieComanda[], docs: DocTx[]): Map<string, string> {
  const out = new Map<string, string>()
  const folosite = new Set(linii.map(l => l.document_id).filter(Boolean) as string[])
  const libere = linii.filter(l => l.stare === 'asteptata' && !l.document_id)
  const scor = (l: LinieComanda, d: DocTx) => {
    const sumaOk = d.suma != null && Math.abs(Math.abs(Number(d.suma)) - l.subtotal) <= 0.05
    const nume = Math.max(asemanare(l.vanzator, d.furnizor), asemanare(l.emitent, d.furnizor))
    if (sumaOk && nume >= 0.5) return 3
    if (sumaOk && libere.filter(x => Math.abs(x.subtotal - l.subtotal) <= 0.05).length === 1) return 2
    if (nume >= 0.8 && d.suma == null) return 1
    return 0
  }
  const perechi = libere.flatMap(l => docs.filter(d => !folosite.has(d.id)).map(d => ({ l, d, s: scor(l, d) }))).filter(p => p.s > 0).sort((a, b) => b.s - a.s)
  for (const p of perechi) {
    if (out.has(p.l.id) || [...out.values()].includes(p.d.id)) continue
    out.set(p.l.id, p.d.id)
  }
  return out
}

export function rezumat(c: Comanda, linii: LinieComanda[]) {
  const active = linii.filter(l => l.stare !== 'anulata')
  const primite = active.filter(l => l.stare === 'primita')
  const lipsa = active.filter(l => l.stare === 'asteptata')
  const anulate = linii.filter(l => l.stare === 'anulata')
  const sumaLinii = r2(linii.reduce((s, l) => s + l.subtotal, 0))
  return {
    total: active.length, primite: primite.length, lipsa: lipsa.length, anulate: anulate.length,
    sumaPrimita: r2(primite.reduce((s, l) => s + l.subtotal, 0)), sumaLipsa: r2(lipsa.reduce((s, l) => s + l.subtotal, 0)),
    sumaAnulata: r2(anulate.reduce((s, l) => s + l.subtotal, 0)), diferenta: r2(Number(c.total) - sumaLinii), completa: lipsa.length === 0,
  }
}

const lei = (n: number, v = 'RON') => `${n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${v}`
// Nota pentru contabil ("Note pe tranzacții"): din ce facturi e formata plata si ce lipseste.
export function notaComanda(c: Comanda, linii: LinieComanda[], docs: DocTx[]) {
  const r = rezumat(c, linii)
  const cap = `${c.platforma} comanda ${c.numar_comanda || '—'}: plata de ${lei(Number(c.total), c.valuta)} acoperă ${linii.length} ${linii.length === 1 ? 'sub-comandă' : 'sub-comenzi'} de la vânzători diferiți, fiecare cu factura ei.`
  const det = linii.map(l => {
    const d = docs.find(x => x.id === l.document_id)
    return `${l.vanzator} ${lei(l.subtotal, c.valuta)} — ${l.stare === 'primita' ? `factura ${d?.numar_document || d?.fisier_nume || 'atașată'}` : l.stare === 'anulata' ? `anulat / returnat${l.nota ? ` (${l.nota})` : ''}` : 'factură în așteptare'}`
  }).join('; ')
  const fin = r.completa ? 'Toate facturile sunt atașate.' : `${r.lipsa === 1 ? 'Lipsește 1 factură' : `Lipsesc ${r.lipsa} facturi`} (${lei(r.sumaLipsa, c.valuta)}).`
  return `${cap} ${det}. ${fin}${Math.abs(r.diferenta) > 0.01 ? ` Diferență față de plată: ${lei(r.diferenta, c.valuta)} (transport / reduceri).` : ''}`
}

// Citeste comanda platii, potriveste facturile noi atasate si actualizeaza nota tranzactiei. Folosit de API
// la fiecare deschidere si dupa orice atasare de document (syncComandaNote).
export async function incarcaComanda(sb: Sb, txId: string) {
  const { data: c, error } = await sb.from('comenzi_marketplace').select('*').eq('tranzactie_id', txId).maybeSingle()
  if (error) return { comanda: null, linii: [], docs: [], lipsaMigrare: lipsaTabel(error) }
  if (!c) return { comanda: null, linii: [], docs: [], lipsaMigrare: false }
  const [{ data: linii }, { data: docs }] = await Promise.all([
    sb.from('comenzi_marketplace_linii').select('*').eq('comanda_id', c.id).order('ordine'),
    sb.from('documente').select('id,furnizor,numar_document,suma,fisier_nume,tip_document').eq('tranzactie_id', txId).order('created_at'),
  ])
  let ls = ((linii || []) as LinieComanda[]).map(l => ({ ...l, subtotal: Number(l.subtotal) }))
  const ds = (docs || []) as DocTx[]
  // documente desprinse de plata intre timp: linia redevine "in asteptare"
  const dezlegate = ls.filter(l => l.document_id && !ds.some(d => d.id === l.document_id))
  for (const l of dezlegate) await sb.from('comenzi_marketplace_linii').update({ document_id: null, stare: 'asteptata' }).eq('id', l.id)
  ls = ls.map(l => dezlegate.includes(l) ? { ...l, document_id: null, stare: 'asteptata' as const } : l)
  const noi = potrivesteFacturi(ls, ds)
  for (const [linieId, docId] of noi) await sb.from('comenzi_marketplace_linii').update({ document_id: docId, stare: 'primita' }).eq('id', linieId)
  ls = ls.map(l => noi.has(l.id) ? { ...l, document_id: noi.get(l.id)!, stare: 'primita' as const } : l)
  const comanda = { ...c, total: Number(c.total) } as Comanda
  await sb.from('tranzactii').update({ status_note: notaComanda(comanda, ls, ds) }).eq('id', txId)
  return { comanda, linii: ls, docs: ds, lipsaMigrare: false }
}

export const PROMPT_COMANDA = `Materialul atașat e o comandă de pe un marketplace (eMAG, Trendyol, Altex, Flanco, Amazon etc.): o captură din contul de client, PDF-ul comenzii sau mailul de confirmare. O singură comandă poate avea mai mulți vânzători — fiecare emite factura lui.

Extrage comanda și fiecare sub-comandă (vânzător). Răspunde DOAR cu JSON:
{"platforma":"eMAG","numar_comanda":"580457899","data_comanda":"2026-11-06","total":1488.31,"valuta":"RON","linii":[{"vanzator":"eMAG","emitent":"Dante International","subtotal":451.96,"stare":"asteptata","produse":"espressor, cuptor","nota":null}]}

Reguli:
- "Produse vândute și livrate de X" → vanzator X. "Produse vândute de X și livrate de eMAG" → vanzator X (factura e de la X, nu de la eMAG).
- emitent = firma care emite factura, dacă se știe (pentru produsele vândute de eMAG: "Dante International"); altfel null.
- subtotal = suma sub-comenzii, număr (451,96 / 451⁹⁶ → 451.96). Taxa de transport separată apare ca linie proprie, cu vanzatorul care o facturează.
- stare: "anulata" doar dacă sub-comanda apare anulată / returnată / rambursată; altfel "asteptata".
- data_comanda AAAA-LL-ZZ; câmp ilizibil = null. Nu inventa vânzători.`
