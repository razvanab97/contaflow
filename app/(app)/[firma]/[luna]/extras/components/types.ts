export interface Tx {
  id: string; extras_id: string; data_tranzactie: string
  descriere: string; descriere_curatata: string
  tip: 'debit'|'credit'; suma: number; valuta: string
  referinta: string|null
  categorie: string; document_id: string|null; note: string|null; status_note: string|null
  motiv_ignorare?: string|null; ignorat_auto?: boolean
  documente: DocTx|null
  documenteToate?: DocTx[]
  sugestieFactura?: { id:string; fisier_nume:string; furnizor:string|null; suma:number|null; data_factura:string|null; created_at?:string }|null
  sugestieInbox?: { id:string; fisier_nume:string; furnizor:string|null; suma:number|null; valuta?:string|null; data_document:string|null; suma_ron?:number|null; curs_bnr?:number|null }|null
  sugestieBon?: { id:string; fisier_nume:string; comerciant:string|null; cui_client:string|null; suma:number|null; data_bon:string|null; tip:'combustibil'|'altul'; created_at?:string }|null
  // O singura plata acoperita de mai multe facturi (tipic eMAG: 2-3 facturi pe aceeasi comanda)
  sugestieGrup?: { ids:string[]; suma:number; docs:{ id:string; fisier_nume:string; furnizor:string|null; suma:number|null; data_document:string|null; numar_document?:string|null }[] }|null
}

// Documentele in valuta raman in moneda lor (suma/valuta); suma_ron/curs_bnr = echivalentul la cursul
// BNR din ziua documentului, calculat de server doar pentru afisare.
export interface DocTx { id:string; tip_document:string; furnizor:string; numar_document:string; fisier_nume:string; suma?:number|null; valuta?:string|null; data_document?:string|null; suma_ron?:number|null; curs_bnr?:number|null }

export type SursaInbox = 'local'|'gmail'|'oblio'|'bonuri'|'altele'|'module'|'deasociat'
export interface InboxCandidat {
  id:string; tabel:'documente'|'bonuri'|'facturi_asteptate'; fisier_nume:string; furnizor:string|null; numar_document?:string|null
  suma:number|null; valuta:string; monedaDiferita:boolean; data_document:string|null; diferentaSuma:number|null; suma_ron?:number|null; curs_bnr?:number|null
  sursa:SursaInbox; sectiune?:string; docUrl?:string
  // Documentul e deja legat de o alta tranzactie (data/suma ei, cand se cunosc).
  deja?:{ data:string|null; suma:number|null; valuta:string|null }|null
}

// "18.00 EUR" + "≈ 94.74 lei · curs BNR 5.2636 din 15.09.2026" (a doua parte doar pentru valuta).
export function sumaDocument(d: { suma?:number|null; valuta?:string|null; data_document?:string|null; suma_ron?:number|null; curs_bnr?:number|null }): { principal: string|null; lei: string|null } {
  if (d.suma == null) return { principal: null, lei: null }
  const valuta = (d.valuta || 'RON').toUpperCase()
  const principal = `${Number(d.suma).toFixed(2)} ${valuta}`
  if (valuta === 'RON' || d.suma_ron == null || d.curs_bnr == null) return { principal, lei: null }
  const data = d.data_document ? ` din ${d.data_document.slice(8, 10)}.${d.data_document.slice(5, 7)}.${d.data_document.slice(0, 4)}` : ''
  return { principal, lei: `≈ ${d.suma_ron.toFixed(2)} lei · curs BNR ${d.curs_bnr.toFixed(4)}${data}` }
}

export const SURSA_LABEL: Record<'toate'|SursaInbox, string> = { toate:'Toate', local:'Local', gmail:'Gmail', oblio:'e-Factură (Oblio)', bonuri:'Bonuri', altele:'Altele', module:'Din module', deasociat:'Facturi de asociat' }

export interface Extras { id:string; valuta:string; iban?:string|null; pdf_path?:string|null; pdf_nume?:string|null; nr_tranzactii:number; nr_documentate:number; sold_final?:number }

export interface Firma { id:string; slug:string; nume:string; culoare:string }

export const CAT: Record<string, { bg: string; c: string }> = {
  client:   { bg: 'rgba(74,222,128,.15)',  c: 'var(--accent-green)' },
  furnizor: { bg: 'light-dark(rgba(37,99,235,.35), rgba(96,165,250,.15))',  c: 'var(--accent-blue)' },
  taxa:     { bg: 'light-dark(rgba(220,38,38,.35), rgba(248,113,113,.15))', c: 'var(--accent-red)' },
  angajat:  { bg: 'rgba(167,139,250,.15)', c: '#A78BFA' },
  transfer: { bg: 'rgba(150,150,150,.15)', c: 'var(--c-aaaaaa)' },
  comision: { bg: 'rgba(251,146,60,.15)',  c: '#FB923C' },
  banca:    { bg: 'rgba(100,100,100,.15)', c: 'var(--c-888888)' },
  altele:   { bg: 'rgba(80,80,80,.12)',    c: 'var(--c-777777)' },
}

export function isPreviewable(nume: string): 'pdf' | 'image' | null {
  const lower = nume.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (/\.(jpe?g|png)$/.test(lower)) return 'image'
  return null
}

export function shortReference(value: string | null) {
  const firstPart = String(value || '').split(';')[0]?.trim() || ''
  const numeric = firstPart.match(/\d+/)?.[0]
  return numeric || firstPart
}

// Statusul unei tranzactii se deriva mereu din document_id/note - niciun camp nou in DB.
export function txStatus(tx: Tx): 'asociata'|'neasociata'|'ignorata' {
  if (tx.document_id) return 'asociata'
  if (tx.note === 'na') return 'ignorata'
  return 'neasociata'
}

// Sugestia activa, cu prioritatea exacta deja folosita in productie: factura > bon > inbox.
export type ActiveSuggestion = {
  tip: 'factura'|'bon'|'inbox'|'grup'
  id: string
  ids?: string[]
  label: string
  detaliu: string
  sumaPotrivita: boolean
  dataPotrivita: boolean
}

function daysBetween(a: string, b: string) {
  const da = new Date(String(a).slice(0,10)+'T00:00:00Z').getTime()
  const db = new Date(String(b).slice(0,10)+'T00:00:00Z').getTime()
  return Math.abs(da-db) / 86400000
}

// Suma sugestiei poate diferi putin de suma tranzactiei (pana la SUMA_TOLERANTA din
// api/tranzactii/list) - afisam diferenta explicit in loc sa marcam mereu "suma identica",
// ca sa nu induca in eroare cand nu e chiar exacta.
// valuta = moneda comuna a documentului si a tranzactiei (suma se compara doar cand sunt in aceeasi
// moneda) - fara ea, o factura in EUR platita in EUR aparea scrisa "961.59 RON" in banner.
function sumaLabel(sumaDoc: number | null, sumaTx: number, valuta = 'RON'): { text: string | null; exacta: boolean } {
  if (sumaDoc == null) return { text: null, exacta: false }
  const diff = Math.abs(sumaDoc - sumaTx)
  const exacta = diff < 0.01
  const text = exacta ? `${sumaDoc.toFixed(2)} ${valuta}` : `${sumaDoc.toFixed(2)} ${valuta} (diferență ${diff.toFixed(2)} ${valuta})`
  return { text, exacta }
}

export function getActiveSuggestion(tx: Tx): ActiveSuggestion | null {
  if (tx.sugestieFactura) {
    const s = tx.sugestieFactura
    const suma = sumaLabel(s.suma, tx.suma)
    return {
      tip: 'factura', id: s.id,
      label: 'Am găsit o factură care se potrivește',
      detaliu: [s.furnizor, suma.text].filter(Boolean).join(' · ') || s.fisier_nume,
      sumaPotrivita: suma.exacta,
      dataPotrivita: !!s.created_at && daysBetween(s.created_at, tx.data_tranzactie) <= 3,
    }
  }
  if (tx.sugestieBon) {
    const s = tx.sugestieBon
    const suma = sumaLabel(s.suma, tx.suma)
    return {
      tip: 'bon', id: s.id,
      label: 'Am găsit un bon care se potrivește',
      detaliu: [s.comerciant, suma.text].filter(Boolean).join(' · ') || s.fisier_nume,
      sumaPotrivita: suma.exacta,
      dataPotrivita: !!s.created_at && daysBetween(s.created_at, tx.data_tranzactie) <= 3,
    }
  }
  if (tx.sugestieInbox) {
    const s = tx.sugestieInbox
    const valuta = (s.valuta || 'RON').toUpperCase()
    const conv = sumaDocument(s)
    const suma = valuta === (tx.valuta || 'RON').toUpperCase() || !conv.principal
      ? sumaLabel(s.suma, tx.suma, valuta)
      : { text: `${conv.principal}${conv.lei ? ` (${conv.lei})` : ''}`, exacta: false }
    return {
      tip: 'inbox', id: s.id,
      label: 'Am găsit o factură în Inbox Facturi care se potrivește',
      detaliu: [s.furnizor, suma.text].filter(Boolean).join(' · ') || s.fisier_nume,
      sumaPotrivita: suma.exacta,
      dataPotrivita: false,
    }
  }
  if (tx.sugestieGrup) {
    const g = tx.sugestieGrup
    const furnizor = (f: string|null) => (f || '').split('|')[0].trim()
    // facturile din grup au mereu aceeasi moneda ca plata (vezi matchGrupuriInbox)
    const valutaGrup = (tx.valuta || 'RON').toUpperCase()
    return {
      tip: 'grup', id: g.ids[0], ids: g.ids,
      label: `Am găsit ${g.ids.length} facturi care împreună dau suma plății`,
      detaliu: g.docs.map(d => [furnizor(d.furnizor), d.numar_document && `nr. ${d.numar_document}`, d.suma != null && `${Number(d.suma).toFixed(2)} ${valutaGrup}`].filter(Boolean).join(' · ')).join('  +  ') + `  =  ${g.suma.toFixed(2)} ${valutaGrup}`,
      sumaPotrivita: Math.abs(g.suma - tx.suma) < 0.01,
      dataPotrivita: false,
    }
  }
  return null
}

export const SUGGESTION_ENDPOINT: Record<ActiveSuggestion['tip'], { url: string; idKey: string }> = {
  factura: { url: '/api/facturi-asteptate/asociaza', idKey: 'facturaId' },
  bon: { url: '/api/bonuri/asociaza', idKey: 'bonId' },
  inbox: { url: '/api/inbox-facturi/asociaza', idKey: 'facturaId' },
  grup: { url: '/api/inbox-facturi/asociaza', idKey: 'facturaId' },
}
