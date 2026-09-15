import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { potrivesteFacturiAirbnb, potrivesteDupaCodRezervare, extrageCodRezervareAirbnb } from '@/lib/airbnb-reconciliere'

export const maxDuration = 120

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
  const orphanDocs = (docs || []).filter(d => !linkedIds.has(d.id))

  // Codul de rezervare e scris explicit în textul facturii; îl extragem o singură dată
  // per factură (AI) și îl ținem minte, ca reconcilierile următoare să nu-l mai ceară.
  for (const doc of orphanDocs) {
    if (doc.cod_rezervare_airbnb || !doc.fisier_path) continue
    const { data: blob, error: downloadError } = await sb.storage.from('documente').download(doc.fisier_path)
    if (downloadError || !blob) continue
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const cod = await extrageCodRezervareAirbnb(bytes, doc.fisier_tip || 'application/pdf')
    if (cod) {
      doc.cod_rezervare_airbnb = cod
      await sb.from('documente').update({ cod_rezervare_airbnb: cod }).eq('id', doc.id)
    }
  }

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
