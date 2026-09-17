export interface Tx {
  id: string; extras_id: string; data_tranzactie: string
  descriere: string; descriere_curatata: string
  tip: 'debit'|'credit'; suma: number; valuta: string
  referinta: string|null
  categorie: string; document_id: string|null; note: string|null; status_note: string|null
  documente: { id:string; tip_document:string; furnizor:string; numar_document:string; fisier_nume:string }|null
  documenteToate?: { id:string; tip_document:string; furnizor:string; numar_document:string; fisier_nume:string }[]
  sugestieFactura?: { id:string; fisier_nume:string; furnizor:string|null; suma:number|null; data_factura:string|null; created_at?:string }|null
  sugestieInbox?: { id:string; fisier_nume:string; furnizor:string|null; suma:number|null; data_document:string|null }|null
  sugestieBon?: { id:string; fisier_nume:string; comerciant:string|null; cui_client:string|null; suma:number|null; data_bon:string|null; tip:'combustibil'|'altul'; created_at?:string }|null
}

export interface InboxCandidat { id:string; fisier_nume:string; furnizor:string|null; suma:number|null; valuta:string; monedaDiferita:boolean; data_document:string|null; diferentaSuma:number|null; sursa:'local'|'gmail'|'oblio'|'bonuri'|'altele' }

export const SURSA_LABEL: Record<'toate'|'local'|'gmail'|'oblio'|'bonuri'|'altele', string> = { toate:'Toate', local:'Local', gmail:'Gmail', oblio:'e-Factură (Oblio)', bonuri:'Bonuri', altele:'Altele' }

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
  tip: 'factura'|'bon'|'inbox'
  id: string
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
function sumaLabel(sumaDoc: number | null, sumaTx: number): { text: string | null; exacta: boolean } {
  if (sumaDoc == null) return { text: null, exacta: false }
  const diff = Math.abs(sumaDoc - sumaTx)
  const exacta = diff < 0.01
  const text = exacta ? `${sumaDoc.toFixed(2)} RON` : `${sumaDoc.toFixed(2)} RON (diferență ${diff.toFixed(2)} RON)`
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
    const suma = sumaLabel(s.suma, tx.suma)
    return {
      tip: 'inbox', id: s.id,
      label: 'Am găsit o factură în Inbox Facturi care se potrivește',
      detaliu: [s.furnizor, suma.text].filter(Boolean).join(' · ') || s.fisier_nume,
      sumaPotrivita: suma.exacta,
      dataPotrivita: false,
    }
  }
  return null
}

export const SUGGESTION_ENDPOINT: Record<ActiveSuggestion['tip'], { url: string; idKey: string }> = {
  factura: { url: '/api/facturi-asteptate/asociaza', idKey: 'facturaId' },
  bon: { url: '/api/bonuri/asociaza', idKey: 'bonId' },
  inbox: { url: '/api/inbox-facturi/asociaza', idKey: 'facturaId' },
}
