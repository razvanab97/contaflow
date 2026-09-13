import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { getServiceSupabase } from '@/lib/supabase/server'

const DIACRITICS: Record<string, string> = {
  'ă':'a','â':'a','î':'i','ș':'s','ş':'s','ț':'t','ţ':'t',
  'Ă':'A','Â':'A','Î':'I','Ș':'S','Ş':'S','Ț':'T','Ţ':'T',
}
function safe(value: unknown, fallback = '') {
  const withDiacritics = String(value ?? fallback).replace(/[ăâîșşțţĂÂÎȘŞȚŢ]/g, ch => DIACRITICS[ch] || ch)
  return withDiacritics.replace(/[^\x20-\x7E]/g, '')
}

function fmtDataRo(s: string) {
  const [y, m, d] = String(s || '').split('-')
  return y && m && d ? `${d}.${m}.${y}` : String(s || '')
}

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line)
      line = w
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

// Randeaza tabelul de "tranzactii cu note" (date/descriere/suma/status_note) ca PDF - folosit atat
// de descarcarea individuala din tab-ul Note, cat si de exportul lunar complet (PDF/ZIP), ca sa
// ajunga si aceasta pagina la contabilitate, o data cu restul documentelor.
export async function generateNotePdfBytes(lunaId: string, firmaNume: string, lunaLabel: string): Promise<Uint8Array | null> {
  const sb = getServiceSupabase()
  const { data: extrase } = await sb.from('extrase').select('id').eq('luna_id', lunaId)
  const extrasIds = (extrase || []).map(e => e.id)
  if (!extrasIds.length) return null

  const { data: txsRaw } = await sb.from('tranzactii')
    .select('data_tranzactie,descriere_curatata,descriere,suma,valuta,tip,status_note')
    .in('extras_id', extrasIds)
    .not('status_note', 'is', null)
    .order('data_tranzactie', { ascending: true })

  const txs = (txsRaw || []).filter(t => t.status_note)
  if (!txs.length) return null

  const pdfDoc = await PDFDocument.create()
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const margin = 42
  const pageWidth = 595.28, pageHeight = 841.89

  let page = pdfDoc.addPage([pageWidth, pageHeight])
  let y = pageHeight - margin

  function newPage() {
    page = pdfDoc.addPage([pageWidth, pageHeight])
    y = pageHeight - margin
  }
  function ensureSpace(needed: number) {
    if (y - needed < margin) newPage()
  }

  page.drawText(safe(`${firmaNume} - Tranzactii cu note`), { x: margin, y, size: 15, font: fontBold, color: rgb(0.1, 0.1, 0.1) })
  y -= 20
  page.drawText(safe(lunaLabel), { x: margin, y, size: 11, font: fontRegular, color: rgb(0.4, 0.4, 0.4) })
  y -= 26

  const colDate = margin, colDesc = margin + 60, colSum = margin + 300, colNote = margin + 380
  const rowFontSize = 9.5
  const maxDescWidth = colSum - colDesc - 10
  const maxNoteWidth = pageWidth - margin - colNote

  for (const t of txs) {
    const desc = safe(t.descriere_curatata || t.descriere)
    const note = safe(t.status_note)
    const descLines = wrapText(desc, fontRegular, rowFontSize, maxDescWidth)
    const noteLines = wrapText(note, fontRegular, rowFontSize, maxNoteWidth)
    const rowLines = Math.max(descLines.length, noteLines.length, 1)
    const rowHeight = rowLines * 12 + 6

    ensureSpace(rowHeight)

    const sign = t.tip === 'credit' ? '+' : '-'
    const sumaTxt = `${sign}${Number(t.suma).toFixed(2)} ${safe(t.valuta)}`

    page.drawText(fmtDataRo(t.data_tranzactie), { x: colDate, y, size: rowFontSize, font: fontRegular, color: rgb(0.3, 0.3, 0.3) })
    descLines.forEach((line, i) => {
      page.drawText(line, { x: colDesc, y: y - i * 12, size: rowFontSize, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
    })
    page.drawText(sumaTxt, { x: colSum, y, size: rowFontSize, font: fontBold, color: t.tip === 'credit' ? rgb(0.1, 0.55, 0.2) : rgb(0.6, 0.15, 0.15) })
    noteLines.forEach((line, i) => {
      page.drawText(line, { x: colNote, y: y - i * 12, size: rowFontSize, font: fontRegular, color: rgb(0.45, 0.3, 0) })
    })

    y -= rowHeight
    page.drawLine({ start: { x: margin, y: y + 4 }, end: { x: pageWidth - margin, y: y + 4 }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) })
  }

  return pdfDoc.save()
}
