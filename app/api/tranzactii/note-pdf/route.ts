import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co/rest/v1'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }

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

export async function POST(req: NextRequest) {
  const { lunaId, firmaNume, lunaLabel } = await req.json()
  if (!lunaId) return NextResponse.json({ error: 'Luna contabilă lipsește' }, { status: 400 })

  const eRes = await fetch(`${SB}/extrase?luna_id=eq.${lunaId}&select=id`, { headers: H })
  if (!eRes.ok) return NextResponse.json({ error: await eRes.text() }, { status: 502 })
  const extrase = await eRes.json()

  let txs: any[] = []
  for (const e of extrase) {
    const r = await fetch(
      `${SB}/tranzactii?extras_id=eq.${e.id}&status_note=not.is.null&select=data_tranzactie,descriere_curatata,descriere,suma,valuta,tip,status_note&order=data_tranzactie`,
      { headers: H }
    )
    if (r.ok) txs = [...txs, ...(await r.json())]
  }
  txs = txs.filter(t => t.status_note)
  txs.sort((a, b) => new Date(a.data_tranzactie).getTime() - new Date(b.data_tranzactie).getTime())

  const pdfDoc = await PDFDocument.create()
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const margin = 42
  const pageWidth = 595.28, pageHeight = 841.89 // A4

  let page = pdfDoc.addPage([pageWidth, pageHeight])
  let y = pageHeight - margin

  function newPage() {
    page = pdfDoc.addPage([pageWidth, pageHeight])
    y = pageHeight - margin
  }
  function ensureSpace(needed: number) {
    if (y - needed < margin) newPage()
  }

  page.drawText(safe(`${firmaNume} - Tranzactii cu note`), { x: margin, y, size: 15, font: fontBold, color: rgb(0.1,0.1,0.1) })
  y -= 20
  page.drawText(safe(lunaLabel), { x: margin, y, size: 11, font: fontRegular, color: rgb(0.4,0.4,0.4) })
  y -= 26

  if (txs.length === 0) {
    page.drawText('Nu exista tranzactii cu note.', { x: margin, y, size: 11, font: fontRegular, color: rgb(0.4,0.4,0.4) })
  }

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

    page.drawText(fmtDataRo(t.data_tranzactie), { x: colDate, y, size: rowFontSize, font: fontRegular, color: rgb(0.3,0.3,0.3) })
    descLines.forEach((line, i) => {
      page.drawText(line, { x: colDesc, y: y - i * 12, size: rowFontSize, font: fontRegular, color: rgb(0.1,0.1,0.1) })
    })
    page.drawText(sumaTxt, { x: colSum, y, size: rowFontSize, font: fontBold, color: t.tip === 'credit' ? rgb(0.1,0.55,0.2) : rgb(0.6,0.15,0.15) })
    noteLines.forEach((line, i) => {
      page.drawText(line, { x: colNote, y: y - i * 12, size: rowFontSize, font: fontRegular, color: rgb(0.45,0.3,0) })
    })

    y -= rowHeight
    page.drawLine({ start: { x: margin, y: y + 4 }, end: { x: pageWidth - margin, y: y + 4 }, thickness: 0.5, color: rgb(0.9,0.9,0.9) })
  }

  const bytes = await pdfDoc.save()
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="note_tranzactii.pdf"`,
    }
  })
}
