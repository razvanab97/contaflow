import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { getServiceSupabase } from '@/lib/supabase/server'
import { computeVerification } from '@/lib/stardeskVerify'

function money(v: number|null) { return v == null ? '-' : v.toFixed(2) }
function safe(v: unknown) { return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '') }

// Lista descarcabila cu toate discrepantele de pret (factura gasita, dar suma nu corespunde cu
// borderoul) - ca sa poata fi lucrate metodic, in afara aplicatiei (trimise la 5StarDesk, folosite
// ca checklist pentru facturi corectate etc.), nu doar vazute pe ecran.
export async function GET(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  const firmaNume = req.nextUrl.searchParams.get('firmaNume') || ''
  const lunaLabel = req.nextUrl.searchParams.get('lunaLabel') || ''
  if (!lunaId) return NextResponse.json({ error: 'lunaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const result = await computeVerification(sb, lunaId)
  const randuri = [
    ...result.discrepanteClient.map(d => ({ ...d, tip: 'Factura client' })),
    ...result.discrepanteComisionAirbnb.map(d => ({ ...d, tip: 'Comision Airbnb' })),
  ]
  if (!randuri.length) return NextResponse.json({ error: 'Nu există discrepanțe de listat' }, { status: 404 })

  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const black = rgb(0, 0, 0)
  const L = 40, R = 555, TOP = 800, BOTTOM = 50
  const COLS = [L, 110, 260, 330, 400, 465, 530, R]

  let page = pdf.addPage([595, 842])
  let y = TOP

  function header() {
    page.drawText('Discrepante de pret 5StarDesk', { x: L, y, size: 15, font: bold, color: black }); y -= 18
    const sub = [safe(firmaNume), safe(lunaLabel)].filter(Boolean).join(' - ')
    if (sub) { page.drawText(sub, { x: L, y, size: 10, font, color: black }); y -= 16 }
    y -= 6
    const heads = ['Platforma', 'Oaspete', 'Cod rezervare', 'Tip', 'Sold borderou', 'Nr. factura', 'Sold factura']
    heads.forEach((h, i) => page.drawText(h, { x: COLS[i] + 2, y, size: 8, font: bold, color: black }))
    y -= 4
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.5, color: black })
    y -= 14
  }

  header()
  let totalDiferenta = 0
  for (const r of randuri) {
    if (y < BOTTOM) { page = pdf.addPage([595, 842]); y = TOP; header() }
    const diferenta = (r.sumaFactura ?? 0) - (r.suma ?? 0)
    totalDiferenta += diferenta
    const cells = [
      r.platforma === 'airbnb' ? 'Airbnb' : 'Booking',
      safe(r.numeOaspete).slice(0, 22),
      safe(r.codRezervare),
      r.tip,
      money(r.suma),
      safe(r.numarFactura),
      money(r.sumaFactura),
    ]
    cells.forEach((c, i) => page.drawText(String(c), { x: COLS[i] + 2, y, size: 8, font, color: black }))
    y -= 14
  }

  y -= 6
  if (y < BOTTOM) { page = pdf.addPage([595, 842]); y = TOP }
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.5, color: black }); y -= 14
  page.drawText(`Total randuri: ${randuri.length}`, { x: L, y, size: 9, font: bold, color: black })
  page.drawText(`Diferenta totala (factura - borderou): ${totalDiferenta.toFixed(2)} RON`, { x: 220, y, size: 9, font: bold, color: black })

  const bytes = await pdf.save()
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="discrepante_5stardesk_${lunaId}.pdf"`,
    },
  })
}
