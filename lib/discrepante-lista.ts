import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { getServiceSupabase } from '@/lib/supabase/server'

// Lista de discrepante a lunii (5StarDesk): situatiile bifate de utilizator din verificarea
// rezervarilor, fiecare cu captura situatiei de la momentul bifarii si o nota cu ce s-a intamplat.
// Se salveaza in baza si intra ca PDF in exportul contabilitatii (ZIP si PDF complet).

export interface RandDiscrepanta {
  id: string; luna_id: string; firma_id: string; cheie: string; sectiune: string
  titlu: string | null; cod_rezervare: string | null; suma: number | null; detalii: string | null
  nota: string | null; created_at: string
}

function safe(v: unknown) { return String(v ?? '').replace(/[–—·]/g, '-').replace(/[„”“]/g, '"').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ȘșŞş]/g, 's').replace(/[ȚțŢţ]/g, 't').replace(/[^\x20-\x7E]/g, '') }

function wrap(text: string, font: Awaited<ReturnType<PDFDocument['embedFont']>>, size: number, max: number) {
  const out: string[] = []
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const last = out.at(-1)
    if (last && font.widthOfTextAtSize(`${last} ${w}`, size) <= max) out[out.length - 1] = `${last} ${w}`
    else out.push(w)
  }
  return out
}

export async function getListaDiscrepante(lunaId: string): Promise<RandDiscrepanta[]> {
  const { data, error } = await getServiceSupabase().from('discrepante_lista').select('*').eq('luna_id', lunaId).order('created_at')
  return error ? [] : (data as RandDiscrepanta[]) || []
}

export async function generateDiscrepantePdfBytes(lunaId: string, firmaNume: string, lunaLabel: string): Promise<Uint8Array | null> {
  const randuri = await getListaDiscrepante(lunaId)
  if (!randuri.length) return null
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const L = 40, R = 555, TOP = 800, BOTTOM = 50, W = R - L
  let page = pdf.addPage([595, 842])
  let y = TOP
  page.drawText('Lista discrepante 5StarDesk', { x: L, y, size: 15, font: bold }); y -= 18
  page.drawText(safe([firmaNume, lunaLabel].filter(Boolean).join(' - ')), { x: L, y, size: 10, font }); y -= 12
  page.drawText(`${randuri.length} situatii marcate, cu nota despre ce s-a intamplat`, { x: L, y, size: 8.5, font, color: rgb(0.4, 0.4, 0.4) }); y -= 20

  randuri.forEach((r, i) => {
    const cap = wrap(safe(`${i + 1}. [${r.sectiune}] ${r.titlu || ''}${r.cod_rezervare ? ` - ${r.cod_rezervare}` : ''}${r.suma != null ? ` - ${Number(r.suma).toFixed(2)} RON` : ''}`), bold, 9.5, W)
    const det = r.detalii ? wrap(safe(r.detalii), font, 8, W - 10) : []
    const nota = wrap(safe(r.nota ? `Nota: ${r.nota}` : 'Nota: -'), font, 8.5, W - 10)
    const h = cap.length * 12 + det.length * 10 + nota.length * 11 + 14
    if (y - h < BOTTOM) { page = pdf.addPage([595, 842]); y = TOP }
    for (const l of cap) { page.drawText(l, { x: L, y, size: 9.5, font: bold }); y -= 12 }
    for (const l of det) { page.drawText(l, { x: L + 10, y, size: 8, font, color: rgb(0.4, 0.4, 0.4) }); y -= 10 }
    for (const l of nota) { page.drawText(l, { x: L + 10, y, size: 8.5, font, color: r.nota ? rgb(0, 0, 0) : rgb(0.6, 0.2, 0.2) }); y -= 11 }
    y -= 4
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.3, color: rgb(0.8, 0.8, 0.8) })
    y -= 10
  })
  return pdf.save()
}
