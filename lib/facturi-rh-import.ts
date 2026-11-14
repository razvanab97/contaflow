import crypto from 'node:crypto'
import { extractText, getDocumentProxy } from 'unpdf'
import { extractPageRange } from '@/lib/pdfBatch'
import type { getServiceSupabase } from '@/lib/supabase/server'

// Facturile de cazare RH (Oblio, emise de AB Textile oaspetilor Airbnb) salvate ca facturi de VANZARE, cate o
// factura pe document, legata de rezervare prin codul Airbnb scris pe ea („rezervare Airbnb HMZ5AJJDJW”).
// Un PDF poate contine mai multe facturi (exportul din Oblio) - se imparte pe pagini, fara AI: textul
// facturilor Oblio e extractibil. Sunt distincte de facturile de comision Airbnb (/airbnb-facturi/).

type Sb = ReturnType<typeof getServiceSupabase>
export const MODUL_FACTURI_RH = 'facturi_rh'

export interface FacturaRhPdf { pageStart: number; pageEnd: number; numar: string; data: string | null; client: string | null; total: number | null; cod: string | null }

// „Factura RH 0029” - antetul facturilor Oblio din seria RH
const RE_NUMAR = /Factura\s+RH\s*0*(\d{1,6})/i
export function esteFacturaRh(text: string) { return RE_NUMAR.test(text) && /AB\s*TEXTILE/i.test(text) }

function campuri(text: string): Omit<FacturaRhPdf, 'pageStart' | 'pageEnd'> | null {
  const t = text.replace(/\s+/g, ' ')
  const n = t.match(RE_NUMAR)
  if (!n) return null
  const data = t.match(/Data emiterii:\s*(\d{2})\.(\d{2})\.(\d{4})/)
  const total = t.match(/Total plata\s*([\d.,]+)\s*RON/i)
  const cod = t.match(/rezervare Airbnb:?\s*(HM[A-Z0-9]{8})/i)
  // Clientul: numele scris dupa „Client:” (in textul extras apare inaintea „CIF:”-ului clientului)
  const client = t.match(/Client:\s*(?:AB TEXTILE S\.R\.L\.\s*)?(.+?)\s+(?:Reg\. com\.|CIF:)/i)
  return {
    numar: `RH ${n[1].padStart(4, '0')}`,
    data: data ? `${data[3]}-${data[2]}-${data[1]}` : null,
    total: total ? Number(total[1].replace(/,(?=\d{3}\b)/g, '').replace(',', '.')) : null,
    cod: cod ? cod[1].toUpperCase() : null,
    client: client ? client[1].replace(/\.$/, '').trim() : null,
  }
}

// O factura noua incepe pe pagina cu antetul „Factura RH …”; paginile fara antet continua factura anterioara.
export async function imparteFacturiRh(bytes: Uint8Array): Promise<FacturaRhPdf[]> {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: false })
  const pagini = (Array.isArray(text) ? text : [text]).map(String)
  const out: FacturaRhPdf[] = []
  pagini.forEach((pag, i) => {
    const c = RE_NUMAR.test(pag) ? campuri(pag) : null
    if (c) out.push({ ...c, pageStart: i + 1, pageEnd: i + 1 })
    else if (out.length) {
      const ultima = out[out.length - 1]
      ultima.pageEnd = i + 1
      const extra = campuri(`Factura ${ultima.numar} ${pag}`)
      if (extra) { ultima.total ??= extra.total; ultima.cod ??= extra.cod }
    }
  })
  return out
}

const lei = (n: number) => n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const safe = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.\-_ ]+/g, '').trim().slice(0, 60)

export interface RezultatImportRh { numar: string; cod: string | null; client: string | null; total: number | null; documentId: string; nou: boolean }

// Imparte PDF-ul si salveaza fiecare factura RH (o singura data per numar - reincarcarea o inlocuieste).
export async function importaFacturiRh(sb: Sb, firma: { id: string; prefix: string }, lunaId: string, bytes: Uint8Array): Promise<RezultatImportRh[]> {
  const facturi = await imparteFacturiRh(bytes)
  const rezultate: RezultatImportRh[] = []
  for (const f of facturi) {
    const buc = new Uint8Array(await extractPageRange(Buffer.from(bytes), f.pageStart, f.pageEnd))
    const hash = crypto.createHash('sha256').update(buc).digest('hex')
    const dataRo = f.data ? `${f.data.slice(8, 10)}.${f.data.slice(5, 7)}.${f.data.slice(0, 4)}` : ''
    const nume = [`${firma.prefix} - Factura ${f.numar}`, f.client, dataRo, f.total != null ? `${lei(f.total)} RON` : null].filter(Boolean).join(' - ') + '.pdf'
    const path = `${firma.id}/${lunaId}/facturi-rh/${f.numar.replace(' ', '_')}_${safe(f.client || 'client').replace(/ /g, '_')}.pdf`
    const { error: upErr } = await sb.storage.from('documente').upload(path, buc, { contentType: 'application/pdf', upsert: true })
    if (upErr) throw new Error(`${f.numar}: ${upErr.message}`)
    const rand = {
      firma_id: firma.id, luna_id: lunaId, modul: MODUL_FACTURI_RH, tip_document: 'factura_emisa',
      numar_document: f.numar, suma: f.total, valuta: 'RON', data_document: f.data,
      furnizor: `Client: ${f.client || '—'}${f.cod ? ` · rezervare Airbnb ${f.cod}` : ''}`,
      cod_rezervare_airbnb: f.cod, fisier_path: path, fisier_nume: nume, fisier_tip: 'application/pdf',
      fisier_marime: buc.length, document_hash: hash, in_zip: true,
    }
    const { data: existent } = await sb.from('documente').select('id').eq('firma_id', firma.id).eq('modul', MODUL_FACTURI_RH).eq('numar_document', f.numar).limit(1)
    if (existent?.[0]) {
      const { error } = await sb.from('documente').update(rand).eq('id', existent[0].id)
      if (error) throw new Error(`${f.numar}: ${error.message}`)
      rezultate.push({ numar: f.numar, cod: f.cod, client: f.client, total: f.total, documentId: existent[0].id, nou: false })
    } else {
      const { data, error } = await sb.from('documente').insert(rand).select('id').single()
      if (error || !data) throw new Error(`${f.numar}: ${error?.message || 'nesalvată'}`)
      rezultate.push({ numar: f.numar, cod: f.cod, client: f.client, total: f.total, documentId: data.id, nou: true })
    }
  }
  return rezultate
}
