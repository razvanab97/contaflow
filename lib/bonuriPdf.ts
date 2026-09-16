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

function fmtDataRo(s: string | null) {
  if (!s) return '-'
  const [y, m, d] = s.split('-')
  return y && m && d ? `${d}.${m}.${y}` : s
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

// Randeaza tabelul complet de bonuri ale unei firme (comerciant/tip/suma/data/status), in ordine
// cronologica dupa data de pe bon - folosit de butonul "Descarca toate bonurile" din pagina Bonuri.
// Bonurile deja asociate unei tranzactii ajung oricum si in exportul general lunar (devin document
// normal legat de tranzactie) - PDF-ul asta e un rezumat separat, cu toate bonurile firmei la un loc,
// indiferent de luna, util pentru verificare/predare catre contabilitate.
export async function generateBonuriPdfBytes(firmaId: string, firmaNume: string): Promise<Uint8Array | null> {
  const sb = getServiceSupabase()
  const { data: bonuriRaw } = await sb.from('bonuri')
    .select('comerciant,cui_client,tip,suma,data_bon,status,created_at')
    .eq('firma_id', firmaId)
    .order('data_bon', { ascending: true })
    .order('created_at', { ascending: true })

  const bonuri = bonuriRaw || []
  if (!bonuri.length) return null

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

  const asteptare = bonuri.filter(b => b.status === 'asteptare').length
  const total = bonuri.reduce((sum, b) => sum + (Number(b.suma) || 0), 0)

  page.drawText(safe(`${firmaNume} - Bonuri`), { x: margin, y, size: 15, font: fontBold, color: rgb(0.1, 0.1, 0.1) })
  y -= 20
  page.drawText(safe(`${bonuri.length} bonuri total, ${asteptare} in asteptare - suma totala ${total.toFixed(2)} RON`), { x: margin, y, size: 11, font: fontRegular, color: rgb(0.4, 0.4, 0.4) })
  y -= 26

  const colDate = margin, colComerciant = margin + 60, colTip = margin + 230, colCui = margin + 300, colSum = margin + 380, colStatus = margin + 450
  const rowFontSize = 9.5
  const maxComerciantWidth = colTip - colComerciant - 8

  for (const b of bonuri) {
    const comerciant = safe(b.comerciant || '(necunoscut)')
    const lines = wrapText(comerciant, fontRegular, rowFontSize, maxComerciantWidth)
    const rowHeight = Math.max(lines.length, 1) * 12 + 6
    ensureSpace(rowHeight)

    page.drawText(fmtDataRo(b.data_bon), { x: colDate, y, size: rowFontSize, font: fontRegular, color: rgb(0.3, 0.3, 0.3) })
    lines.forEach((line, i) => {
      page.drawText(line, { x: colComerciant, y: y - i * 12, size: rowFontSize, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
    })
    page.drawText(safe(b.tip === 'combustibil' ? 'Combustibil' : 'Altul'), { x: colTip, y, size: rowFontSize, font: fontRegular, color: rgb(0.35, 0.35, 0.35) })
    page.drawText(safe(b.cui_client || '-'), { x: colCui, y, size: rowFontSize, font: fontRegular, color: rgb(0.35, 0.35, 0.35) })
    page.drawText(b.suma != null ? `${Number(b.suma).toFixed(2)}` : '-', { x: colSum, y, size: rowFontSize, font: fontBold, color: rgb(0.1, 0.1, 0.1) })
    page.drawText(safe(b.status === 'asociata' ? 'Asociat' : 'In asteptare'), { x: colStatus, y, size: rowFontSize, font: fontRegular, color: b.status === 'asociata' ? rgb(0.1, 0.55, 0.2) : rgb(0.6, 0.45, 0) })

    y -= rowHeight
    page.drawLine({ start: { x: margin, y: y + 4 }, end: { x: pageWidth - margin, y: y + 4 }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) })
  }

  return pdfDoc.save()
}
