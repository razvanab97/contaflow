import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { importInboxDocument } from '@/lib/inbox-facturi'
import { currentWorkMonthKey } from '@/lib/accounting-period'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST() {
  const sb = getServiceSupabase()
  const luna = currentWorkMonthKey()

  const { data: anyFirma } = await sb.from('firme').select('id').eq('activa', true).limit(1).single()
  if (!anyFirma) return NextResponse.json({ error: 'Nu există nicio firmă activă' }, { status: 400 })

  const { data: pendingRows, error: pendingError } = await sb
    .from('inbox_watch_files')
    .select('id,fisier_path,fisier_nume,fisier_tip')
    .in('status', ['pending', 'eroare'])
    .order('created_at', { ascending: true })
  if (pendingError) return NextResponse.json({ error: pendingError.message }, { status: 500 })

  const rezultate: { fisier: string; status: string; firma: string | null }[] = []
  for (const file of pendingRows || []) {
    const { data: blob, error: downloadError } = await sb.storage.from('documente').download(file.fisier_path)
    if (downloadError || !blob) {
      await sb.from('inbox_watch_files').update({ status: 'eroare', error_message: downloadError?.message || 'Fișierul nu a putut fi citit' }).eq('id', file.id)
      rezultate.push({ fisier: file.fisier_nume, status: 'eroare', firma: null })
      continue
    }
    const bytes = new Uint8Array(await blob.arrayBuffer())

    let result
    try {
      result = await importInboxDocument({
        sb,
        bytes,
        mediaType: file.fisier_tip,
        originalName: file.fisier_nume,
        firmaId: anyFirma.id,
        lunaId: '',
        luna,
        sourceLabel: 'Folder local (Personal Computer)',
        requireDetectedFirm: true,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import eșuat'
      await sb.from('inbox_watch_files').update({ status: 'eroare', error_message: message }).eq('id', file.id)
      rezultate.push({ fisier: file.fisier_nume, status: 'eroare', firma: null })
      continue
    }

    const nextStatus = result.skipped ? 'nedetectat' : result.duplicate ? 'duplicat' : 'imported'
    await sb.from('inbox_watch_files').update({
      status: nextStatus,
      error_message: result.skipped ? result.skipReason || null : null,
      firma_id: result.doc?.firma_id || null,
      luna_id: result.doc?.luna_id || null,
      document_id: result.doc?.id || null,
      synced_at: new Date().toISOString(),
    }).eq('id', file.id)
    if (nextStatus === 'imported' || nextStatus === 'duplicat') {
      await sb.storage.from('documente').remove([file.fisier_path])
    }
    rezultate.push({ fisier: file.fisier_nume, status: nextStatus, firma: result.targetFirma })
  }

  return NextResponse.json({
    total: rezultate.length,
    imported: rezultate.filter(r => r.status === 'imported').length,
    duplicate: rezultate.filter(r => r.status === 'duplicat').length,
    nedetectat: rezultate.filter(r => r.status === 'nedetectat').length,
    eroare: rezultate.filter(r => r.status === 'eroare').length,
    rezultate,
  })
}
