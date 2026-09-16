import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { importInboxDocumentSplitting } from '@/lib/inbox-facturi'
import { currentWorkMonthKey } from '@/lib/accounting-period'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { id, firmaId } = await req.json().catch(() => ({}))
  const cleanId = String(id || '')
  const cleanFirmaId = String(firmaId || '')
  if (!cleanId || !cleanFirmaId) return NextResponse.json({ error: 'id/firmaId lipsesc' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: file, error: findError } = await sb
    .from('inbox_watch_files')
    .select('id,fisier_path,fisier_nume,fisier_tip,status')
    .eq('id', cleanId)
    .single()
  if (findError || !file) return NextResponse.json({ error: 'Fișierul nu a fost găsit' }, { status: 404 })
  if (!['nedetectat', 'eroare'].includes(file.status)) return NextResponse.json({ error: 'Fișierul a fost deja procesat' }, { status: 400 })

  const luna = currentWorkMonthKey()
  // "luna" e coloana de tip date (mereu prima zi a lunii) - .like() nu functioneaza pe o
  // coloana de tip date in Postgres/PostgREST (eroare de operator), asa ca interogarea
  // esua mereu, indiferent de firma, cu un mesaj fals ca luna nu ar fi inceputa.
  const { data: lunaRow, error: lunaError } = await sb
    .from('luni_contabile')
    .select('id')
    .eq('firma_id', cleanFirmaId)
    .eq('luna', `${luna}-01`)
    .single()
  if (lunaError || !lunaRow) return NextResponse.json({ error: 'Firma aleasă nu are încă începută luna curentă' }, { status: 400 })

  const { data: blob, error: downloadError } = await sb.storage.from('documente').download(file.fisier_path)
  if (downloadError || !blob) return NextResponse.json({ error: downloadError?.message || 'Fișierul nu a putut fi citit' }, { status: 500 })
  const bytes = new Uint8Array(await blob.arrayBuffer())

  let results
  try {
    results = await importInboxDocumentSplitting({
      sb,
      bytes,
      mediaType: file.fisier_tip,
      originalName: file.fisier_nume,
      firmaId: cleanFirmaId,
      lunaId: lunaRow.id,
      luna,
      sourceLabel: 'Folder local (Personal Computer) · atribuit manual',
      requireDetectedFirm: false,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Import eșuat' }, { status: 500 })
  }

  const primul = results[0]
  const toateOk = results.every(r => !r.skipped)
  await sb.from('inbox_watch_files').update({
    status: results.length === 1 ? (primul.duplicate ? 'duplicat' : 'imported') : (toateOk ? 'imported' : 'eroare'),
    firma_id: primul.doc?.firma_id || cleanFirmaId,
    luna_id: primul.doc?.luna_id || lunaRow.id,
    document_id: primul.doc?.id || null,
    error_message: results.length > 1
      ? `Fișier împărțit în ${results.length} documente separate - ${results.filter(r => !r.skipped).length} procesate, ${results.filter(r => r.skipped).length} sărite`
      : null,
    synced_at: new Date().toISOString(),
  }).eq('id', cleanId)
  const toateNeduplicat = results.every(r => !r.duplicate)
  if (toateOk && toateNeduplicat) await sb.storage.from('documente').remove([file.fisier_path])

  return NextResponse.json({ ok: true, results })
}
