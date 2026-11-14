import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { potrivesteFacturiAirbnb, potrivesteDupaCodRezervare, extrageCodRezervareAirbnb } from '@/lib/airbnb-reconciliere'
import { getFirmaConfig } from '@/lib/firma-config'
import { esteFacturaRh, importaFacturiRh } from '@/lib/facturi-rh-import'
import { extractText, getDocumentProxy } from 'unpdf'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { firmaId, lunaId } = await req.json().catch(() => ({}))
  const cleanFirmaId = String(firmaId || '')
  const cleanLunaId = String(lunaId || '')
  if (!cleanFirmaId || !cleanLunaId) return NextResponse.json({ error: 'firmaId/lunaId lipsesc' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: rows, error: rowsError } = await sb
    .from('airbnb_facturi_asteptate')
    .select('id,cod_confirmare,taxa_servicii')
    .eq('firma_id', cleanFirmaId)
    .eq('luna_id', cleanLunaId)
    .is('factura_document_id', null)
  if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 })

  const { data: linkedRows, error: linkedError } = await sb
    .from('airbnb_facturi_asteptate')
    .select('factura_document_id')
    .eq('firma_id', cleanFirmaId)
    .eq('luna_id', cleanLunaId)
    .not('factura_document_id', 'is', null)
  if (linkedError) return NextResponse.json({ error: linkedError.message }, { status: 500 })
  const linkedIds = new Set((linkedRows || []).map(r => r.factura_document_id as string))

  const { data: docs, error: docsError } = await sb
    .from('documente')
    .select('id,suma,fisier_path,fisier_tip,cod_rezervare_airbnb')
    .eq('firma_id', cleanFirmaId)
    .eq('luna_id', cleanLunaId)
    .like('fisier_path', '%/airbnb-facturi/%')
  if (docsError) return NextResponse.json({ error: docsError.message }, { status: 500 })
  let orphanDocs = (docs || []).filter(d => !linkedIds.has(d.id))

  // Facturile de cazare RH (vanzare, Oblio) incarcate din greseala aici, in locul facturilor de comision
  // Airbnb: se muta ca facturi de vanzare, impartite si legate de rezervari (vezi lib/facturi-rh-import).
  let mutateRh = 0
  const { data: firmaRow } = await sb.from('firme').select('slug,nume').eq('id', cleanFirmaId).maybeSingle()
  if (firmaRow && getFirmaConfig(firmaRow.slug)?.facturiCazareOblio) {
    for (const doc of orphanDocs.filter(d => !d.cod_rezervare_airbnb && d.fisier_path && (d.fisier_tip || 'application/pdf') === 'application/pdf')) {
      const { data: blob } = await sb.storage.from('documente').download(doc.fisier_path)
      if (!blob) continue
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let text = ''
      try { text = String((await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: true })).text || '') } catch { continue }
      if (!esteFacturaRh(text)) continue
      const r = await importaFacturiRh(sb, { id: cleanFirmaId, prefix: firmaRow.nume.replace(/\s+S\.?R\.?L\.?$/i, '') }, cleanLunaId, bytes)
      if (!r.length) continue
      await sb.from('documente').delete().eq('id', doc.id)
      mutateRh += r.length
      orphanDocs = orphanDocs.filter(d => d.id !== doc.id)
    }
  }

  // Codul de rezervare e scris explicit în textul facturii; îl extragem o singură dată
  // per factură (AI) și îl ținem minte, ca reconcilierile următoare să nu-l mai ceară.
  // In paralel (cate 6) si cu buget de timp (limita Vercel 60s): facturile ramase necitite se
  // reiau la urmatorul apel - clientul repeta pana nu mai e nimic de citit (ramanDeCitit = 0).
  const start = Date.now()
  const deCitit = orphanDocs.filter(d => !d.cod_rezervare_airbnb && d.fisier_path)
  let urmator = 0
  await Promise.all(Array.from({ length: Math.min(6, deCitit.length) }, async () => {
    while (urmator < deCitit.length && Date.now() - start < 35_000) {
      const doc = deCitit[urmator++]
      const { data: blob, error: downloadError } = await sb.storage.from('documente').download(doc.fisier_path)
      if (downloadError || !blob) continue
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const cod = await extrageCodRezervareAirbnb(bytes, doc.fisier_tip || 'application/pdf')
      // si cand nu se gaseste cod, marcam documentul ca citit ('-'), ca sa nu fie recitit la nesfarsit
      doc.cod_rezervare_airbnb = cod || '-'
      await sb.from('documente').update({ cod_rezervare_airbnb: cod || '-' }).eq('id', doc.id)
    }
  }))
  const ramanDeCitit = deCitit.length - Math.min(urmator, deCitit.length)

  const potriviriCod = potrivesteDupaCodRezervare(rows || [], orphanDocs)
  const randuriPotriviteCod = new Set(potriviriCod.map(p => p.borderouId))
  const docuriFolositeCod = new Set(potriviriCod.map(p => p.docId))

  const randuriRamase = (rows || []).filter(r => !randuriPotriviteCod.has(r.id))
  const docuriRamase = orphanDocs.filter(d => !docuriFolositeCod.has(d.id))
  const potriviriSuma = potrivesteFacturiAirbnb(randuriRamase, docuriRamase)

  for (const p of potriviriCod) {
    const { error } = await sb.from('airbnb_facturi_asteptate').update({
      factura_document_id: p.docId,
      status: 'atasata',
      asociere_scor: 100,
      asociere_metoda: 'cod_rezervare',
      updated_at: new Date().toISOString(),
    }).eq('id', p.borderouId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  for (const p of potriviriSuma) {
    const { error } = await sb.from('airbnb_facturi_asteptate').update({
      factura_document_id: p.docId,
      status: 'atasata',
      asociere_scor: 90,
      asociere_metoda: 'taxa_servicii_exacta',
      updated_at: new Date().toISOString(),
    }).eq('id', p.borderouId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const totalPotrivite = potriviriCod.length + potriviriSuma.length
  return NextResponse.json({
    matched: totalPotrivite,
    dupaCod: potriviriCod.length,
    dupaSuma: potriviriSuma.length,
    ramanNepotrivite: (rows?.length || 0) - totalPotrivite,
    ramanDeCitit,
    mutateRh,
  })
}

export async function PATCH(req: NextRequest) {
  const { id, docId } = await req.json().catch(() => ({}))
  const cleanId = String(id || '')
  const cleanDocId = String(docId || '')
  if (!cleanId || !cleanDocId) return NextResponse.json({ error: 'id/docId lipsesc' }, { status: 400 })

  const sb = getServiceSupabase()
  const { error } = await sb.from('airbnb_facturi_asteptate').update({
    factura_document_id: cleanDocId,
    status: 'atasata',
    asociere_scor: null,
    asociere_metoda: 'manual',
    updated_at: new Date().toISOString(),
  }).eq('id', cleanId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { error } = await sb.from('airbnb_facturi_asteptate').update({
    factura_document_id: null,
    status: 'de_atasat',
    asociere_scor: null,
    asociere_metoda: null,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
