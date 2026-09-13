import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

const SECTIUNI = ['raport_lunar']

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const sectiune = req.nextUrl.searchParams.get('sectiune')
  if (!firmaId || !sectiune) return NextResponse.json({ error: 'firmaId/sectiune lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb.from('proiect_documente')
    .select('id,fisier_nume,fisier_tip,fisier_marime,updated_at')
    .eq('firma_id', firmaId).eq('sectiune', sectiune).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ doc: data || null })
}

// Inlocuieste documentul curent al sectiunii - nu se acumuleaza versiuni vechi, spre deosebire
// de model_documente. Fisierul vechi (daca exista) e sters din storage inainte de a-l incarca pe cel nou.
export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get('file') as File
  const firmaId = fd.get('firmaId') as string
  const sectiune = fd.get('sectiune') as string
  if (!file || !firmaId || !sectiune) return NextResponse.json({ error: 'lipsă file/firmaId/sectiune' }, { status: 400 })
  if (!SECTIUNI.includes(sectiune)) return NextResponse.json({ error: 'secțiune invalidă' }, { status: 400 })

  const sb = getServiceSupabase()

  const { data: existing } = await sb.from('proiect_documente')
    .select('fisier_path').eq('firma_id', firmaId).eq('sectiune', sectiune).maybeSingle()

  const path = `${firmaId}/proiect-documente/${sectiune}/${Date.now()}_${file.name}`
  const { error: upErr } = await sb.storage.from('documente').upload(path, file, { contentType: file.type })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data, error } = await sb.from('proiect_documente')
    .upsert({
      firma_id: firmaId, sectiune, fisier_nume: file.name, fisier_path: path,
      fisier_tip: file.type, fisier_marime: file.size, updated_at: new Date().toISOString(),
    }, { onConflict: 'firma_id,sectiune' })
    .select('id,fisier_nume,fisier_tip,fisier_marime,updated_at').single()

  if (error) {
    await sb.storage.from('documente').remove([path])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (existing?.fisier_path) await sb.storage.from('documente').remove([existing.fisier_path])

  return NextResponse.json({ doc: data })
}

export async function DELETE(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const sectiune = req.nextUrl.searchParams.get('sectiune')
  if (!firmaId || !sectiune) return NextResponse.json({ error: 'firmaId/sectiune lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: doc } = await sb.from('proiect_documente')
    .select('fisier_path').eq('firma_id', firmaId).eq('sectiune', sectiune).maybeSingle()
  if (!doc) return NextResponse.json({ ok: true })

  await sb.from('proiect_documente').delete().eq('firma_id', firmaId).eq('sectiune', sectiune)
  await sb.storage.from('documente').remove([doc.fisier_path])

  return NextResponse.json({ ok: true })
}
