import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const ALLOWED_CATEGORIES = new Set(['utilitati', 'chirie', 'altul'])
const ALLOWED_DOCUMENT_TYPES = new Set(['factura', 'chitanta'])

function safeFilePart(value: string, fallback: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 70) || fallback
}

export async function GET(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!lunaId) return NextResponse.json({ docs: [] })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('documente')
    .select('id,fisier_nume,tip_document,furnizor,modul,created_at')
    .eq('luna_id', lunaId)
    .like('modul', 'facturi_chitanta_%')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ docs: data || [] })
}

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get('file') as File | null
  const firmaId = String(fd.get('firmaId') || '')
  const lunaId = String(fd.get('lunaId') || '')
  const category = String(fd.get('category') || '')
  const documentType = String(fd.get('documentType') || '')
  const supplier = String(fd.get('supplier') || '').trim()

  if (!file || !firmaId || !lunaId || !ALLOWED_CATEGORIES.has(category) || !ALLOWED_DOCUMENT_TYPES.has(documentType))
    return NextResponse.json({ error: 'Date lipsă sau invalide' }, { status: 400 })
  if (!ALLOWED_TYPES.has(file.type))
    return NextResponse.json({ error: 'Sunt acceptate doar fișiere PDF, JPG și PNG' }, { status: 400 })

  const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
  const fileName = `${category}_${documentType}_${safeFilePart(supplier, 'fara_furnizor')}_${Date.now()}.${extension}`
  const path = `${firmaId}/${lunaId}/facturi-chitanta/${fileName}`
  const sb = getServiceSupabase()

  const { error: storageError } = await sb.storage.from('documente').upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })

  const { data: doc, error } = await sb
    .from('documente')
    .insert({
      firma_id: firmaId,
      luna_id: lunaId,
      modul: `facturi_chitanta_${category}`,
      tip_document: documentType,
      furnizor: supplier,
      fisier_path: path,
      fisier_nume: fileName,
      fisier_tip: file.type,
      fisier_marime: file.size,
      in_zip: true,
    })
    .select('id,fisier_nume,tip_document,furnizor,modul,created_at')
    .single()

  if (error) {
    await sb.storage.from('documente').remove([path])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ doc })
}
