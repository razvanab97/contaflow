import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { ensureLocalUploadSource } from '@/lib/inbox-facturi'

export const maxDuration = 60

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])

function safeFileName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9.\-_]+/g, '_')
    .slice(0, 120) || 'document'
}

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const firmaId = String(fd.get('firmaId') || '')
  const lunaId = String(fd.get('lunaId') || '')
  const luna = String(fd.get('luna') || '')
  const files = fd.getAll('file').filter((item): item is File => item instanceof File && item.size > 0)
  if (!firmaId || !lunaId || !luna || !files.length) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  if (files.some(file => !ALLOWED_TYPES.has(file.type))) return NextResponse.json({ error: 'Sunt acceptate doar PDF, JPG și PNG' }, { status: 400 })

  const sb = getServiceSupabase()
  let sourceId: string
  try {
    sourceId = await ensureLocalUploadSource(sb, firmaId)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sursa locală nu a putut fi creată' }, { status: 500 })
  }

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    // Subfolder separat de importurile finale (inbox-facturi/<hash>_...), ca fișierele
    // puse doar în coadă să nu fie confundate cu duplicate deja importate.
    const path = `${firmaId}/${lunaId}/inbox-facturi/local-staging/${hash.slice(0, 12)}_${safeFileName(file.name)}`
    const { error: storageError } = await sb.storage.from('documente').upload(path, bytes, { contentType: file.type, upsert: true })
    if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })
    const { error: insertError } = await sb.from('inbox_local_files').insert({
      source_id: sourceId,
      firma_id: firmaId,
      luna_id: lunaId,
      luna,
      fisier_path: path,
      fisier_nume: file.name,
      fisier_tip: file.type,
      fisier_marime: bytes.length,
      document_hash: hash,
      status: 'pending',
    })
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const { data, error } = await sb
    .from('inbox_local_files')
    .select('id,fisier_nume,fisier_tip,fisier_marime,status,error_message,created_at')
    .eq('firma_id', firmaId)
    .eq('luna_id', lunaId)
    .in('status', ['pending', 'eroare'])
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ files: data || [], sourceId })
}
