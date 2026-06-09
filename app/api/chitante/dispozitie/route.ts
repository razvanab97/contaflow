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
    .select('numar_document,fisier_path,created_at')
    .eq('luna_id', lunaId)
    .eq('modul', 'acte_contabile')
    .like('fisier_path', '%/dispozitii-plata/%')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  const lastReset = [...(data || [])].reverse().find(document => String(document.fisier_path).includes('/resetari/'))
  const relevant = lastReset ? (data || []).filter(document => document.created_at > lastReset.created_at) : (data || [])
  const maximum = relevant.reduce((max, document) => {
    if (String(document.fisier_path).includes('/resetari/')) return max
    const value = Number.parseInt(String(document.numar_document || ''), 10)
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  return String(maximum + 1).padStart(2, '0')
}

export async function GET(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!lunaId) return NextResponse.json({ error: 'Luna contabilă lipsește' }, { status: 400 })
  try {
    const sb = getServiceSupabase()
    const { data: documents, error } = await sb
      .from('documente')
      .select('id,fisier_nume,numar_document,furnizor,created_at')
      .eq('luna_id', lunaId)
      .eq('modul', 'acte_contabile')
      .eq('tip_document', 'dispozitie_plata')
      .like('fisier_path', '%/dispozitii-plata/%')
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    const { data:attachmentDocuments, error:attachmentError } = documents?.length
      ? await sb
          .from('documente')
          .select('id,fisier_nume,numar_document,furnizor')
          .eq('luna_id', lunaId)
          .eq('modul', 'acte_contabile')
          .eq('tip_document', 'factura')
          .like('furnizor', 'Atașament DP %')
      : { data:[], error:null }
    if (attachmentError) throw new Error(attachmentError.message)
    const parsedDocuments = (documents || []).map(document => {
      const attachments = (attachmentDocuments || []).filter(attachment =>
        String(attachment.furnizor).startsWith(`Atașament DP ${document.id} `)
        || (String(attachment.furnizor).startsWith('Atașament DP nr.') && attachment.numar_document === document.numar_document)
      )
      try { return { ...document, attachments, data:String(document.furnizor || '').startsWith('DP_DATA:') ? JSON.parse(String(document.furnizor).slice(8)) : {} } }
      catch { return { ...document, attachments, data:{} } }
    })
    return NextResponse.json({ nextNumber: await getNextNumber(lunaId), documents:parsedDocuments })
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
    const editId = String(body.editId || '')
    const sb = getServiceSupabase()
    const { data:existing } = editId
      ? await sb.from('documente').select('id,numar_document,fisier_path').eq('id', editId).eq('firma_id', firmaId).eq('luna_id', lunaId).eq('tip_document', 'dispozitie_plata').maybeSingle()
      : { data:null }
    const dispositionNumber = existing?.numar_document || await getNextNumber(lunaId)

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
    const wrapped = (value: string, x: number, y: number, maxWidth: number, size = 10, useBold = false, maxLines = 2, lineHeight = 12) => {
      const usedFont = useBold ? bold : font
      const words = safe(value).split(/\s+/).filter(Boolean)
      const rows: string[] = []
      for (const word of words) {
        const candidate = rows.length ? `${rows.at(-1)} ${word}` : word
        if (!rows.length || usedFont.widthOfTextAtSize(candidate, size) <= maxWidth) {
          if (rows.length) rows[rows.length - 1] = candidate
          else rows.push(candidate)
        } else if (rows.length < maxLines) {
          rows.push(word)
        } else {
          const last = rows.length - 1
          let truncated = `${rows[last]}...`
          while (truncated.length > 3 && usedFont.widthOfTextAtSize(truncated, size) > maxWidth)
            truncated = `${truncated.slice(0, -4)}...`
          rows[last] = truncated
          break
        }
      }
      rows.forEach((row, index) => {
        if (usedFont.widthOfTextAtSize(row, size) <= maxWidth) return
        let truncated = `${row}...`
        while (truncated.length > 3 && usedFont.widthOfTextAtSize(truncated, size) > maxWidth)
          truncated = `${truncated.slice(0, -4)}...`
        rows[index] = truncated
      })
      rows.forEach((row, index) => text(row, x, y - index * lineHeight, size, useBold))
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
    text(`Judet: ${safe(body.judet, '__')}    Tara: ${safe(body.tara, '__')}`, 49, 746, 8)

    centered('DISPOZITIE DE PLATA CATRE CASIERIE', 733, 13, true)
    centered('Cont: 5311 - Casa in lei', 716, 10, true)
    text('Numar:', 177, 700, 10, true)
    text(dispositionNumber, 242, 700, 10)
    dotted(217, 694, 275)
    text('din', 286, 700, 10, true)
    text(date || '____.__.____', 323, 700, 10)
    dotted(308, 694, 395)

    text('Numele si prenumele:', 55, 674, 10, true)
    wrapped(safe(body.beneficiary), 166, 674, 374, 11, true)
    dotted(162, 668, 540)
    text('Functia (calitatea):', 55, 654, 10, true)
    wrapped(safe(body.function), 166, 654, 374, 10)
    dotted(162, 648, 540)
    text('Suma de:', 55, 634, 10, true)
    text(money, 201, 634, 10, true)
    text('Ron', 270, 634, 10, true)
    dotted(162, 628, 540)
    text('Adica:', 55, 614, 10, true)
    wrapped(amountInWords(amount), 162, 614, 378, 9, false, 2, 11)
    dotted(162, 597, 540)
    text('Scopul platii:', 55, 580, 10, true)
    wrapped(safe(body.purpose), 162, 580, 378, 10, false, 3, 12)
    dotted(162, 550, 540)

    line(left, 542, right, 542, 1)
    line(left, 510, right, 510, 1)
    line(left, 470, right, 470, 1)
    line(70, 542, 70, 470, 1)
    line(242, 542, 242, 470, 1)
    line(414, 542, 414, 470, 1)
    text('Semnatura', 48, 489, 8)
    text('Conducatorul unitatii:', 112, 526, 9)
    text('Viza de control', 292, 526, 9)
    text('Financiar-preventiv', 279, 513, 9)
    text('Departament', 449, 526, 9)
    text('financiar-contabil', 437, 513, 9)

    text('Date suplimentare privind beneficiarul sumei:', 55, 458, 9)
    text('Actul de identitate:', 55, 442, 10, true)
    text(safe(body.identityType, 'C.I.'), 177, 442, 10)
    text('seria:', 232, 442, 10, true)
    text(safe(body.identitySeries), 280, 442, 10)
    text('numarul:', 345, 442, 10, true)
    text(safe(body.identityNumber), 414, 442, 10)
    text('Am primit suma de:', 55, 422, 10, true)
    text(money, 201, 422, 10, true)
    text('Ron', 277, 422, 10, true)
    text('Data:', 55, 402, 10, true)
    text(date, 198, 402, 10)
    text('Semnatura:', 286, 402, 10, true)
    dotted(352, 397, 490)

    line(left, 390, right, 390, 1)
    text('CASIER:', 49, 374, 11)
    text('Platit suma de:', 282, 354, 10, true)
    text(money, 388, 354, 10, true)
    text('Ron', 468, 354, 10)
    text('Data de:', 282, 334, 10, true)
    text(date, 382, 334, 10)
    text('Semnatura:', 282, 314, 10, true)
    dotted(352, 309, 490)
    line(left, 300, right, 300, 1)

    const bytes = await pdf.save()
    const fileName = `dispozitie_plata_${dispositionNumber}_${date.replace(/[./]/g, '-') || 'fara-data'}.pdf`
    // Timestamp-ul permite reutilizarea numărului după o resetare, păstrând istoricul.
    const path = existing?.fisier_path || `${firmaId}/${lunaId}/dispozitii-plata/dispozitie_plata_${dispositionNumber}_${Date.now()}.pdf`
    const { error: storageError } = await sb.storage.from('documente').upload(path, Buffer.from(bytes), {
      contentType: 'application/pdf',
      upsert:!!existing,
    })
    if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })

    const dispositionData = JSON.stringify({ purpose:body.purpose, beneficiary:body.beneficiary, function:body.function, amount, date, identitySeries:body.identitySeries, identityNumber:body.identityNumber })
    const values = {
      firma_id: firmaId,
      luna_id: lunaId,
      modul: 'acte_contabile',
      tip_document: 'dispozitie_plata',
      furnizor: `DP_DATA:${dispositionData}`,
      numar_document: dispositionNumber,
      fisier_path: path,
      fisier_nume: fileName,
      fisier_tip: 'application/pdf',
      fisier_marime: bytes.length,
      in_zip: true,
    }
    const { data:disposition, error: databaseError } = existing
      ? await sb.from('documente').update(values).eq('id', existing.id).select('id').single()
      : await sb.from('documente').insert(values).select('id').single()
    if (databaseError) {
      if (!existing) await sb.storage.from('documente').remove([path])
      return NextResponse.json({ error: databaseError.message }, { status: 500 })
    }
    const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds.filter(Boolean) : []
    if (attachmentIds.length) {
      await sb.from('documente').update({ furnizor:`Atașament DP ${disposition.id} nr. ${dispositionNumber} | ${safe(body.purpose)}`, numar_document:dispositionNumber, in_zip:true }).in('id', attachmentIds).eq('firma_id', firmaId).eq('luna_id', lunaId)
    }

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'X-Disposition-Number': dispositionNumber,
        'X-Disposition-Id': disposition.id,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { firmaId, lunaId } = await req.json()
    if (!firmaId || !lunaId)
      return NextResponse.json({ error: 'Firma sau luna contabilă lipsește' }, { status: 400 })

    const sb = getServiceSupabase()
    const createdAt = new Date().toISOString()
    const path = `${firmaId}/${lunaId}/dispozitii-plata/resetari/reset_${Date.now()}.json`
    const bytes = Buffer.from(JSON.stringify({ resetAt: createdAt, nextNumber: '01' }))
    const { error: storageError } = await sb.storage.from('documente').upload(path, bytes, {
      contentType: 'application/json',
      upsert: false,
    })
    if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })

    const { error } = await sb.from('documente').insert({
      firma_id: firmaId,
      luna_id: lunaId,
      modul: 'acte_contabile',
      tip_document: 'altul',
      furnizor: 'Resetare numerotare dispoziții de plată',
      fisier_path: path,
      fisier_nume: 'resetare_numerotare_dispozitii.json',
      fisier_tip: 'application/json',
      fisier_marime: bytes.length,
      in_zip: false,
    })
    if (error) {
      await sb.storage.from('documente').remove([path])
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ nextNumber: '01' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Dispoziția de plată lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: document, error } = await sb
    .from('documente')
    .select('id,luna_id,fisier_path,tip_document,numar_document')
    .eq('id', id)
    .eq('modul', 'acte_contabile')
    .eq('tip_document', 'dispozitie_plata')
    .single()
  if (error || !document || !String(document.fisier_path).includes('/dispozitii-plata/'))
    return NextResponse.json({ error: 'Dispoziția de plată nu a fost găsită' }, { status: 404 })

  const { error: storageError } = await sb.storage.from('documente').remove([document.fisier_path])
  if (storageError) return NextResponse.json({ error: `Fișierul nu a putut fi șters: ${storageError.message}` }, { status: 500 })
  const { error: deleteError } = await sb.from('documente').delete().eq('id', id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })
  await sb.from('documente')
    .update({ in_zip:false })
    .eq('luna_id', document.luna_id)
    .eq('tip_document', 'factura')
    .like('furnizor', `Atașament DP ${document.id} %`)

  return NextResponse.json({ ok: true, nextNumber: await getNextNumber(document.luna_id) })
}
