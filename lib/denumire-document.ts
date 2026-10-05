import { extrageCampuriDocument } from '@/lib/ai/campuri-document'

// Denumirea unica, lizibila, a oricarui document incarcat in ContaFlow - ca sa fie recunoscut din
// prima, inclusiv in ZIP-ul pentru contabilitate sau dupa descarcare:
//   "AB Homes Invest - Factura 2027-4100051921 - JUMBO EC.R SRL - 22.09.2026 - 149,98 RON.pdf"
// Fara diacritice si fara caractere interzise (numele ajunge si in antetul HTTP de descarcare,
// care nu accepta diacritice). Partile lipsa se omit.

type Sb = ReturnType<typeof import('@/lib/supabase/server').getServiceSupabase>

const TIP_LABEL: Record<string, string> = {
  factura: 'Factura', invoice: 'Factura', bon: 'Bon', chitanta: 'Chitanta', aviz_plata: 'Aviz plata',
  borderou: 'Borderou', stat_plata: 'Stat de plata', pontaj: 'Pontaj', foaie_prezenta: 'Foaie prezenta',
  centralizator: 'Centralizator', contract: 'Contract', extras: 'Extras de cont', dispozitie: 'Dispozitie de plata',
  altul: 'Document', document: 'Document',
}
const NU_REDENUMI = /\.(json|csv)$/i  // fisiere tehnice (sabloane, borderouri CSV) - raman cum sunt

function ascii(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ȘșŞş]/g, 's').replace(/[ȚțŢţ]/g, 't')
}
function curat(s: string | null | undefined, max = 60) {
  return ascii(String(s || '')).replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim()
}
function dataRo(iso: string | null | undefined) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ''
}
function suma(v: number | string | null | undefined, valuta?: string | null) {
  const n = Number(v)
  if (v == null || v === '' || !Number.isFinite(n)) return ''
  return `${n.toFixed(2).replace('.', ',')} ${(valuta || 'RON').toUpperCase()}`
}

// Furnizorul "curat": campul furnizor contine uneori metadata interna dupa "|" (Inbox Facturi) sau
// blocuri tehnice (Dispozitii) - doar primul segment, daca arata a nume.
export function furnizorAfisat(raw: string | null | undefined) {
  const prim = String(raw || '').split('|')[0].trim()
  if (!prim || /^(DP_DATA:|Ata(ș|s)ament |Categorie:|Sursa:|\{)/i.test(prim)) return ''
  const aviz = prim.match(/^emag\.aviz_(ro|bg|hu|heyblu)_(inceput|jumatate)/i)
  if (aviz) return `${aviz[1].toLowerCase() === 'heyblu' ? 'eMAG Heyblu' : `eMAG ${aviz[1].toUpperCase()}`} ${aviz[2] === 'inceput' ? 'inceput de luna' : 'jumatate de luna'}`
  if (/^emag\.(facturi|aviz)/i.test(prim)) return 'eMAG'
  return prim
}

// Numele vechi, fara timestamp-uri tehnice si sublinieri - pastrat cand datele documentului sunt
// prea sarace pentru un nume descriptiv (ca sa nu pierdem informatia din el).
function numeVechiCurat(nume: string | null | undefined) {
  return curat(String(nume || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ').replace(/\b\d{10,}\b/g, '').replace(/\bsigur\b|\bverifica firma\b/gi, ''), 110)
}

export function numeDescriptiv(p: {
  firma?: string | null; tip?: string | null; numar?: string | null; furnizor?: string | null
  data?: string | null; suma?: number | string | null; valuta?: string | null; extensie: string
  numeVechi?: string | null
}) {
  const firma = curat(String(p.firma || '').replace(/\s+S\.?R\.?L\.?$/i, ''), 40)
  if (!curat(p.numar) && !curat(p.furnizor) && p.numeVechi) {
    // Deja redenumit (incepe cu firma) -> ramane exact cum e (idempotent).
    if (firma && ascii(p.numeVechi).toLowerCase().startsWith(`${firma.toLowerCase()} - `)) return p.numeVechi
    const vechi = numeVechiCurat(p.numeVechi)
    if (vechi && !vechi.toLowerCase().startsWith(firma.toLowerCase())) {
      return `${[firma, vechi].filter(Boolean).join(' - ').slice(0, 170)}.${(p.extensie || 'pdf').replace(/^\./, '').toLowerCase()}`
    }
    if (vechi) return `${vechi}.${(p.extensie || 'pdf').replace(/^\./, '').toLowerCase()}`
  }
  const tip = TIP_LABEL[String(p.tip || '').toLowerCase()] || (p.tip ? curat(p.tip, 25) : 'Document')
  const numar = curat(p.numar, 40)
  const furnizor = curat(p.furnizor, 50)
  const parti = [firma, numar ? `${tip} ${numar}` : tip, furnizor, dataRo(p.data), suma(p.suma, p.valuta)].filter(Boolean)
  const ext = (p.extensie || 'pdf').replace(/^\./, '').toLowerCase()
  return `${parti.join(' - ').slice(0, 170)}.${ext}`
}

function extensieDin(nume: string | null | undefined, path: string | null | undefined, tip?: string | null) {
  const m = String(nume || '').match(/\.([a-z0-9]{2,5})$/i) || String(path || '').match(/\.([a-z0-9]{2,5})$/i)
  if (m) return m[1].toLowerCase()
  if (tip === 'application/pdf') return 'pdf'
  if (String(tip || '').startsWith('image/png')) return 'png'
  if (String(tip || '').startsWith('image/')) return 'jpg'
  return 'pdf'
}

const TIP_DOCUMENT_CU_SUMA = new Set(['factura', 'invoice', 'bon', 'chitanta', 'aviz_plata'])

// Dupa salvarea unui document: completeaza (cu AI) numarul/suma/data/furnizorul daca lipsesc si il
// redenumeste descriptiv. Nu suprascrie niciodata campuri deja completate. Erorile nu blocheaza
// incarcarea - documentul ramane salvat, doar cu numele vechi.
export async function finalizeazaDocument(sb: Sb, documentId: string, opts: { extrage?: boolean } = {}) {
  try {
    const { data: d } = await sb.from('documente')
      .select('id,firma_id,tip_document,numar_document,furnizor,data_document,suma,valuta,fisier_nume,fisier_path,fisier_tip')
      .eq('id', documentId).single()
    if (!d || NU_REDENUMI.test(d.fisier_nume || '') || NU_REDENUMI.test(d.fisier_path || '')) return null

    const patch: Record<string, unknown> = {}
    const lipsa = d.suma == null || !String(d.numar_document || '').trim() || !d.data_document || !furnizorAfisat(d.furnizor)
    const tip = String(d.tip_document || 'factura').toLowerCase()
    if (opts.extrage !== false && lipsa && TIP_DOCUMENT_CU_SUMA.has(tip) && /pdf|image/.test(String(d.fisier_tip || 'application/pdf'))) {
      const { data: file } = await sb.storage.from('documente').download(d.fisier_path)
      const c = file ? await extrageCampuriDocument(new Uint8Array(await file.arrayBuffer()), d.fisier_tip?.startsWith('image/') ? d.fisier_tip : 'application/pdf') : null
      if (c) {
        if (d.suma == null && c.suma != null) { patch.suma = c.suma; if (c.moneda && (!d.valuta || d.valuta === 'RON')) patch.valuta = c.moneda }
        if (!String(d.numar_document || '').trim() && c.numarDocument) patch.numar_document = c.numarDocument
        if (!d.data_document && c.dataDocument) patch.data_document = c.dataDocument
        // furnizorul se completeaza doar daca e gol de tot (campul poate contine metadata utila dupa "|")
        if (!String(d.furnizor || '').trim() && c.furnizor) patch.furnizor = c.furnizor
      }
    }
    const { data: firma } = await sb.from('firme').select('nume').eq('id', d.firma_id).single()
    const nume = numeDescriptiv({
      firma: firma?.nume,
      tip,
      numar: (patch.numar_document as string) ?? d.numar_document,
      furnizor: furnizorAfisat((patch.furnizor as string) ?? d.furnizor),
      data: (patch.data_document as string) ?? d.data_document,
      suma: (patch.suma as number) ?? d.suma,
      valuta: (patch.valuta as string) ?? d.valuta,
      extensie: extensieDin(d.fisier_nume, d.fisier_path, d.fisier_tip),
      numeVechi: d.fisier_nume,
    })
    if (nume !== d.fisier_nume) patch.fisier_nume = nume
    if (Object.keys(patch).length) await sb.from('documente').update(patch).eq('id', d.id)
    return nume
  } catch {
    return null
  }
}
