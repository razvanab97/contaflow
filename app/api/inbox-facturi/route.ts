import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { importInboxDocumentSplitting } from '@/lib/inbox-facturi'

export const maxDuration = 120

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!firmaId || !lunaId) return NextResponse.json({ error: 'firmaId/lunaId lipsesc' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('documente')
    .select('id,fisier_nume,fisier_tip,furnizor,numar_document,suma,data_document,created_at,platit,data_platii,tranzactie_id')
    .eq('firma_id', firmaId)
    .eq('luna_id', lunaId)
    .like('fisier_path', '%/inbox-facturi/%')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ docs: data || [] })
}

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const firmaId = String(fd.get('firmaId') || '')
  const lunaId = String(fd.get('lunaId') || '')
  const luna = String(fd.get('luna') || '')
  const files = fd.getAll('file').filter((item): item is File => item instanceof File && item.size > 0)
  if (!firmaId || !lunaId || !files.length) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  if (files.some(file => !ALLOWED_TYPES.has(file.type))) return NextResponse.json({ error: 'Sunt acceptate doar PDF, JPG și PNG' }, { status: 400 })

  const imported = []
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    try {
      imported.push(...await importInboxDocumentSplitting({
        sb: getServiceSupabase(),
        bytes,
        mediaType: file.type,
        originalName: file.name,
        firmaId,
        lunaId,
        luna,
      }))
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Documentul nu a putut fi salvat' }, { status: 500 })
    }
  }

  return NextResponse.json({ imported })
}
