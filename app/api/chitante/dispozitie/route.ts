import { NextRequest, NextResponse } from 'next/server'
import { cursuriBnrSigur, inLei } from '@/lib/curs-bnr'
import { getServiceSupabase } from '@/lib/supabase/server'
import JSZip from 'jszip'
import { finalizeazaDocument } from '@/lib/denumire-document'
import { construiestePdfDispozitie, getNextNumber, readStoredHash, safe } from '@/lib/dispozitie-plata'

// Descarcă dispoziția + facturile atașate ei (PDF simplu daca nu are atasamente, altfel zip)
async function downloadDispositionWithAttachments(sb: ReturnType<typeof getServiceSupabase>, id: string) {
  const { data: document, error } = await sb
    .from('documente')
    .select('id,luna_id,fisier_path,fisier_nume,numar_document')
    .eq('id', id)
    .eq('tip_document', 'dispozitie_plata')
    .single()
  if (error || !document) return NextResponse.json({ error: 'Dispoziția de plată nu a fost găsită' }, { status: 404 })

  const { data: attachments } = await sb
    .from('documente')
    .select('fisier_path,fisier_nume,furnizor,numar_document')
    .eq('luna_id', document.luna_id)
    .eq('modul', 'acte_contabile')
    .eq('tip_document', 'factura')
    .like('furnizor', 'Atașament DP %')
  const linkedAttachments = (attachments || []).filter(a =>
    String(a.furnizor).startsWith(`Atașament DP ${document.id} `)
    || (String(a.furnizor).startsWith('Atașament DP nr.') && a.numar_document === document.numar_document)
  )

  const { data: dpFile, error: dpError } = await sb.storage.from('documente').download(document.fisier_path)
  if (dpError || !dpFile) return NextResponse.json({ error: 'Fișierul nu a putut fi descărcat' }, { status: 500 })
  const dpBytes = Buffer.from(await dpFile.arrayBuffer())

  if (!linkedAttachments.length) {
    return new NextResponse(dpBytes, {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${document.fisier_nume}"` },
    })
  }

  const zip = new JSZip()
  zip.file(document.fisier_nume, dpBytes)
  for (const att of linkedAttachments) {
    const { data: attFile } = await sb.storage.from('documente').download(att.fisier_path)
    if (attFile) zip.file(att.fisier_nume, Buffer.from(await attFile.arrayBuffer()))
  }
  const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' })
  const zipName = `dispozitie_plata_${document.numar_document || ''}.zip`
  return new NextResponse(zipBuffer, {
    headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${zipName}"` },
  })
}

export async function GET(req: NextRequest) {
  const downloadId = req.nextUrl.searchParams.get('download')
  if (downloadId) {
    const sb = getServiceSupabase()
    return downloadDispositionWithAttachments(sb, downloadId)
  }

  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!lunaId) return NextResponse.json({ error: 'Luna contabilă lipsește' }, { status: 400 })
  try {
    const sb = getServiceSupabase()
    const { data: documents, error } = await sb
      .from('documente')
      .select('id,fisier_nume,numar_document,furnizor,created_at,suma,locatie,utilitate')
      .eq('luna_id', lunaId)
      .eq('modul', 'acte_contabile')
      .eq('tip_document', 'dispozitie_plata')
      .like('fisier_path', '%/dispozitii-plata/%')
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    const { data:attachmentDocuments, error:attachmentError } = documents?.length
      ? await sb
          .from('documente')
          .select('id,fisier_nume,numar_document,furnizor,data_document,created_at,locatie,utilitate,suma,valuta')
          .eq('luna_id', lunaId)
          .eq('modul', 'acte_contabile')
          .eq('tip_document', 'factura')
          .like('furnizor', 'Atașament DP %')
      : { data:[], error:null }
    if (attachmentError) throw new Error(attachmentError.message)
    // Facturile in valuta: echivalentul in lei la cursul BNR din data facturii (doar pentru afisare/total).
    const valutare = (attachmentDocuments || []).filter(a => a.valuta && a.valuta !== 'RON')
    const curs = valutare.length ? await cursuriBnrSigur(valutare.map(a => a.data_document)) : null
    for (const a of attachmentDocuments || []) {
      const c = inLei(curs, a.suma, a.valuta, a.data_document)
      Object.assign(a, { suma_ron: !a.valuta || a.valuta === 'RON' ? a.suma : c?.sumaRon ?? null, curs_bnr: c?.curs ?? null })
    }
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

    const { bytes, fileName, dateStr } = await construiestePdfDispozitie(body, amount, dispositionNumber)
    // Timestamp-ul permite reutilizarea numărului după o resetare, păstrând istoricul.
    const path = existing?.fisier_path || `${firmaId}/${lunaId}/dispozitii-plata/dispozitie_plata_${dispositionNumber}_${Date.now()}.pdf`
    const { error: storageError } = await sb.storage.from('documente').upload(path, Buffer.from(bytes), {
      contentType: 'application/pdf',
      upsert:!!existing,
    })
    if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })

    const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds.filter(Boolean) : []
    let locatieAgregata: string | null = null
    let utilitateAgregata: string | null = null
    if (attachmentIds.length) {
      const { data: attMeta } = await sb.from('documente').select('locatie,utilitate').in('id', attachmentIds).eq('firma_id', firmaId)
      const locatii = [...new Set((attMeta || []).map(a => a.locatie).filter(Boolean))]
      const utilitati = [...new Set((attMeta || []).map(a => a.utilitate).filter(Boolean))]
      locatieAgregata = locatii.length ? locatii.join(', ') : null
      utilitateAgregata = utilitati.length ? utilitati.join(', ') : null
    }
    // Proprietatea aleasă explicit din dropdown (legată de proprietar) are prioritate față de
    // cea dedusă din facturile atașate — e mereu corectă, chiar dacă DP nu are nicio factură.
    const locatieEticheta = String(body.locatieEticheta || '').trim()
    if (locatieEticheta) {
      // eticheta poate fi deja o lista „A, B” (editorul retrimite locatia dispozitiei) - fara dubluri
      const parti = locatieEticheta.split(', ').filter(Boolean)
      const restul = (locatieAgregata || '').split(', ').filter(l => l && !parti.includes(l))
      locatieAgregata = [...parti, ...restul].join(', ')
    }

    const dispositionData = JSON.stringify({ purpose:body.purpose, beneficiary:body.beneficiary, function:body.function, amount, date:body.date, identitySeries:body.identitySeries, identityNumber:body.identityNumber })
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
      suma: amount,
      locatie: locatieAgregata,
      utilitate: utilitateAgregata,
    }
    const { data:disposition, error: databaseError } = existing
      ? await sb.from('documente').update(values).eq('id', existing.id).select('id').single()
      : await sb.from('documente').insert(values).select('id').single()
    if (databaseError) {
      if (!existing) await sb.storage.from('documente').remove([path])
      return NextResponse.json({ error: databaseError.message }, { status: 500 })
    }
    // Numele descriptiv („Firma - dispozitie_plata 01 - 664,28 RON.pdf”) se recalculeaza la fiecare salvare,
    // ca sa urmeze suma noua cand dispozitia e editata (nu se mai reseteaza la numele brut).
    await finalizeazaDocument(sb, disposition.id, { extrage: false })
    if (attachmentIds.length) {
      const { data: attHashes } = await sb.from('documente').select('id,furnizor').in('id', attachmentIds).eq('firma_id', firmaId).eq('luna_id', lunaId)
      for (const att of attHashes || []) {
        const hash = readStoredHash(att.furnizor)
        await sb.from('documente')
          .update({ furnizor:`Atașament DP ${disposition.id} nr. ${dispositionNumber} | ${safe(body.purpose)}${hash ? ` | HASH:${hash}` : ''}`, numar_document:dispositionNumber, in_zip:true })
          .eq('id', att.id)
          .eq('firma_id', firmaId)
          .eq('luna_id', lunaId)
      }
      const { data: attDocs } = await sb.from('documente').select('fisier_path,fisier_nume').in('id', attachmentIds).eq('firma_id', firmaId)
      const zip = new JSZip()
      zip.file(fileName, bytes)
      for (const att of attDocs || []) {
        const { data: attFile } = await sb.storage.from('documente').download(att.fisier_path)
        if (attFile) zip.file(att.fisier_nume, Buffer.from(await attFile.arrayBuffer()))
      }
      const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' })
      const zipName = `dispozitie_plata_${dispositionNumber}_${dateStr.replace(/[./]/g, '-') || 'fara-data'}.zip`
      return new NextResponse(zipBuffer, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${zipName}"`,
          'X-Disposition-Number': dispositionNumber,
          'X-Disposition-Id': disposition.id,
        },
      })
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
