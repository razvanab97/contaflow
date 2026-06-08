import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { getServiceSupabase } from '@/lib/supabase/server'

const SMALL = ['zero','unu','doi','trei','patru','cinci','sase','sapte','opt','noua','zece','unsprezece','doisprezece','treisprezece','paisprezece','cincisprezece','saisprezece','saptesprezece','optsprezece','nouasprezece']
const TENS = ['','','douazeci','treizeci','patruzeci','cincizeci','saizeci','saptezeci','optzeci','nouazeci']

function underHundred(value: number) {
  if (value < 20) return SMALL[value]
  const tens = Math.floor(value / 10)
  const units = value % 10
  return TENS[tens] + (units ? ` si ${SMALL[units]}` : '')
}

function underThousand(value: number) {
  if (value < 100) return underHundred(value)
  const hundreds = Math.floor(value / 100)
  const rest = value % 100
  const prefix = hundreds === 1 ? 'o suta' : hundreds === 2 ? 'doua sute' : `${SMALL[hundreds]} sute`
  return prefix + (rest ? ` ${underHundred(rest)}` : '')
}

function amountInWords(amount: number) {
  const lei = Math.floor(amount)
  const bani = Math.round((amount - lei) * 100)
  const thousands = Math.floor(lei / 1000)
  const rest = lei % 1000
  const leiWords = [
    thousands ? `${thousands === 1 ? 'o mie' : `${underThousand(thousands)} mii`}` : '',
    rest ? underThousand(rest) : '',
  ].filter(Boolean).join(' ') || 'zero'
  return `${leiWords} lei si ${underHundred(bani)} bani`
}

function safe(value: unknown, fallback = '') {
  return String(value || fallback).replace(/[^\x20-\x7E]/g, '')
}

async function getNextNumber(lunaId: string) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('documente')
    .select('numar_document')
    .eq('luna_id', lunaId)
    .eq('modul', 'dispozitie_plata')
  if (error) throw new Error(error.message)
  const maximum = (data || []).reduce((max, document) => {
    const value = Number.parseInt(String(document.numar_document || ''), 10)
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  return String(maximum + 1).padStart(2, '0')
}

export async function GET(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!lunaId) return NextResponse.json({ error: 'Luna contabilă lipsește' }, { status: 400 })
  try {
    return NextResponse.json({ nextNumber: await getNextNumber(lunaId) })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const lunaId = String(body.lunaId || '')
    const firmaId = String(body.firmaId || '')
    if (!lunaId || !firmaId)
      return NextResponse.json({ error: 'Firma sau luna contabilă lipsește' }, { status: 400 })
    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0)
      return NextResponse.json({ error: 'Suma trebuie să fie mai mare decât zero' }, { status: 400 })
    const dispositionNumber = await getNextNumber(lunaId)

    const pdf = await PDFDocument.create()
    const page = pdf.addPage([595, 842])
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const black = rgb(0, 0, 0)
    const left = 36
    const right = 559
    const top = 810
    const width = right - left
    const money = amount.toFixed(2).replace('.', ',')
    const date = safe(body.date)

    const text = (value: string, x: number, y: number, size = 10, useBold = false) =>
      page.drawText(safe(value), { x, y, size, font: useBold ? bold : font, color: black })
    const line = (x1: number, y1: number, x2: number, y2: number, thickness = 1) =>
      page.drawLine({ start:{ x:x1, y:y1 }, end:{ x:x2, y:y2 }, thickness, color:black })
    const dotted = (x1: number, y: number, x2: number) => {
      for (let x = x1; x < x2; x += 4) line(x, y, Math.min(x + 1.5, x2), y, .5)
    }
    const centered = (value: string, y: number, size = 10, useBold = false) => {
      const usedFont = useBold ? bold : font
      text(value, left + (width - usedFont.widthOfTextAtSize(safe(value), size)) / 2, y, size, useBold)
    }

    line(left, top, right, top, 1)
    line(left, top, left, 300, 1)
    line(right, top, right, 300, 1)

    text(safe(body.firmaNume, 'S.C. FIRMA S.R.L.'), 49, 792, 12, true)
    text('CIF:', 49, 774, 10, true)
    text(safe(body.cif, '________________'), 75, 774, 10)
    text('Nr. la Reg Com', 190, 774, 10, true)
    text(safe(body.nrRegCom, '________________'), 274, 774, 10)
    text(safe(body.adresa, 'Adresa: ________________________________________________'), 49, 758, 9)

    centered('DISPOZITIE DE PLATA CATRE CASIERIE', 733, 13, true)
    centered('Cont: 5311 - Casa in lei', 716, 10, true)
    text('Numar:', 177, 700, 10, true)
    text(dispositionNumber, 242, 700, 10)
    dotted(217, 694, 275)
    text('din', 286, 700, 10, true)
    text(date || '____.__.____', 323, 700, 10)
    dotted(308, 694, 395)

    text('Numele si prenumele:', 55, 674, 10, true)
    text(safe(body.beneficiary), 166, 674, 11, true)
    dotted(162, 668, 540)
    text('Functia (calitatea):', 55, 654, 10, true)
    text(safe(body.function), 166, 654, 10)
    dotted(162, 648, 540)
    text('Suma de:', 55, 634, 10, true)
    text(money, 201, 634, 10, true)
    text('Ron', 270, 634, 10, true)
    dotted(162, 628, 540)
    text('Adica:', 55, 614, 10, true)
    text(amountInWords(amount), 162, 614, 9)
    dotted(162, 608, 540)
    text('Scopul platii:', 55, 594, 10, true)
    text(safe(body.purpose), 162, 594, 10)
    dotted(162, 588, 540)

    line(left, 580, right, 580, 1)
    line(left, 528, right, 528, 1)
    line(left, 478, right, 478, 1)
    line(70, 580, 70, 478, 1)
    line(242, 580, 242, 478, 1)
    line(414, 580, 414, 478, 1)
    text('Semnatura', 48, 507, 8)
    text('Conducatorul unitatii:', 112, 558, 9)
    text('Viza de control', 292, 558, 9)
    text('Financiar-preventiv', 279, 545, 9)
    text('Departament', 449, 558, 9)
    text('financiar-contabil', 437, 545, 9)

    text('Date suplimentare privind beneficiarul sumei:', 55, 466, 9)
    text('Actul de identitate:', 55, 450, 10, true)
    text(safe(body.identityType, 'C.I.'), 177, 450, 10)
    text('seria:', 232, 450, 10, true)
    text(safe(body.identitySeries), 280, 450, 10)
    text('numarul:', 345, 450, 10, true)
    text(safe(body.identityNumber), 414, 450, 10)
    text('Am primit suma de:', 55, 430, 10, true)
    text(money, 201, 430, 10, true)
    text('Ron', 277, 430, 10, true)
    text('Data:', 55, 410, 10, true)
    text(date, 198, 410, 10)
    text('Semnatura:', 286, 410, 10, true)
    dotted(352, 405, 490)

    line(left, 398, right, 398, 1)
    text('CASIER:', 49, 382, 11)
    text('Platit suma de:', 282, 362, 10, true)
    text(money, 388, 362, 10, true)
    text('Ron', 468, 362, 10)
    text('Data de:', 282, 342, 10, true)
    text(date, 382, 342, 10)
    text('Semnatura:', 282, 322, 10, true)
    dotted(352, 317, 490)
    line(left, 300, right, 300, 1)

    const bytes = await pdf.save()
    const fileName = `dispozitie_plata_${dispositionNumber}_${date.replace(/\./g, '-') || 'fara-data'}.pdf`
    // A fixed path per monthly number also prevents two concurrent requests from receiving the same number.
    const path = `${firmaId}/${lunaId}/dispozitii-plata/dispozitie_plata_${dispositionNumber}.pdf`
    const sb = getServiceSupabase()
    const { error: storageError } = await sb.storage.from('documente').upload(path, Buffer.from(bytes), {
      contentType: 'application/pdf',
      upsert: false,
    })
    if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })

    const { error: databaseError } = await sb.from('documente').insert({
      firma_id: firmaId,
      luna_id: lunaId,
      modul: 'dispozitie_plata',
      tip_document: 'dispozitie_plata',
      furnizor: safe(body.purpose),
      numar_document: dispositionNumber,
      fisier_path: path,
      fisier_nume: fileName,
      fisier_tip: 'application/pdf',
      fisier_marime: bytes.length,
      in_zip: true,
    })
    if (databaseError) {
      await sb.storage.from('documente').remove([path])
      return NextResponse.json({ error: databaseError.message }, { status: 500 })
    }

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'X-Disposition-Number': dispositionNumber,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
