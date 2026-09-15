import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { importInboxDocument } from '@/lib/inbox-facturi'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Statusul jobului se citește din GET /api/inbox-facturi/gmail/sync?firmaId=...
// (tabelul inbox_sync_jobs e comun tuturor surselor, nu doar Gmail).

type SyncActivity = {
  time: string
  status: 'info' | 'email' | 'pdf' | 'importat' | 'duplicat' | 'sarit' | 'eroare'
  text: string
  detail?: string | null
}
type SyncResult = {
  imported?: Awaited<ReturnType<typeof importInboxDocument>>[]
  activity?: SyncActivity[]
  messagesChecked?: number
  pdfsFound?: number
}
type SyncJob = {
  id: string
  source_id: string
  firma_id: string
  luna_id: string
  luna: string
  result?: SyncResult | null
}

async function updateJobProgress(sb: ReturnType<typeof getServiceSupabase>, job: SyncJob, patch: Partial<SyncResult>, activity?: Omit<SyncActivity, 'time'>) {
  const previous = job.result || {}
  const nextActivity = [
    ...(previous.activity || []),
    ...(activity ? [{ ...activity, time: new Date().toISOString() }] : []),
  ].slice(-80)
  const next = { ...previous, ...patch, activity: nextActivity }
  job.result = next
  await sb.from('inbox_sync_jobs').update({
    result: next,
    messages_checked: next.messagesChecked || 0,
    pdfs_found: next.pdfsFound || 0,
    updated_at: new Date().toISOString(),
  }).eq('id', job.id)
}

async function runLocalSyncJob(job: SyncJob) {
  const sb = getServiceSupabase()
  await sb.from('inbox_sync_jobs').update({
    status: 'running',
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', job.id)
  await updateJobProgress(sb, job, { messagesChecked: 0, pdfsFound: 0 }, {
    status: 'info',
    text: 'Job pornit pe server',
    detail: 'Pregătesc fișierele încărcate local',
  })

  try {
    const { data: pendingRows, error: pendingError } = await sb
      .from('inbox_local_files')
      .select('id,fisier_path,fisier_nume,fisier_tip')
      .eq('source_id', job.source_id)
      .eq('firma_id', job.firma_id)
      .eq('luna_id', job.luna_id)
      .in('status', ['pending', 'eroare'])
      .order('created_at', { ascending: true })
    if (pendingError) throw new Error(pendingError.message)
    const files = pendingRows || []
    await updateJobProgress(sb, job, { messagesChecked: files.length, pdfsFound: files.length }, {
      status: 'info',
      text: `Am găsit ${files.length} fișiere de sincronizat`,
      detail: files.length ? files.map(f => f.fisier_nume).join(', ').slice(0, 200) : 'niciun fișier nou',
    })

    const imported = []
    for (const file of files) {
      await updateJobProgress(sb, job, {}, { status: 'pdf', text: `Analizez: ${file.fisier_nume}`, detail: null })
      const { data: blob, error: downloadError } = await sb.storage.from('documente').download(file.fisier_path)
      if (downloadError || !blob) {
        await sb.from('inbox_local_files').update({ status: 'eroare', error_message: downloadError?.message || 'Fișierul nu a putut fi citit' }).eq('id', file.id)
        await updateJobProgress(sb, job, {}, { status: 'eroare', text: `Eroare la citire: ${file.fisier_nume}`, detail: downloadError?.message || null })
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
          firmaId: job.firma_id,
          lunaId: job.luna_id,
          luna: job.luna,
          sourceLabel: 'Fișiere locale',
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Import eșuat'
        await sb.from('inbox_local_files').update({ status: 'eroare', error_message: message }).eq('id', file.id)
        await updateJobProgress(sb, job, {}, { status: 'eroare', text: `Eroare: ${file.fisier_nume}`, detail: message })
        continue
      }

      imported.push(result)
      const nextStatus = result.skipped ? 'sarit' : result.duplicate ? 'duplicat' : 'imported'
      await sb.from('inbox_local_files').update({
        status: nextStatus,
        error_message: result.skipped ? result.skipReason || null : null,
        document_id: result.doc?.id || null,
        synced_at: new Date().toISOString(),
      }).eq('id', file.id)
      // Copia din coadă nu mai e necesară: succesul a scris deja fișierul la calea lui finală.
      await sb.storage.from('documente').remove([file.fisier_path])
      await updateJobProgress(sb, job, { imported }, {
        status: result.skipped ? 'sarit' : result.duplicate ? 'duplicat' : 'importat',
        text: `${result.skipped ? 'Sărit' : result.duplicate ? 'Duplicat' : 'Importat'}: ${file.fisier_nume}`,
        detail: [result.targetFirma, result.extracted?.furnizor, result.skipReason].filter(Boolean).join(' · '),
      })
    }

    await sb.from('inbox_surse_email').update({
      status: 'activ',
      connection_error: null,
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', job.source_id)

    const skipped = imported.filter(item => item.skipped).length
    const duplicates = imported.filter(item => item.duplicate).length
    const saved = imported.filter(item => !item.duplicate && !item.skipped).length
    await sb.from('inbox_sync_jobs').update({
      status: 'done',
      messages_checked: files.length,
      pdfs_found: files.length,
      imported_count: saved,
      duplicate_count: duplicates,
      skipped_count: skipped,
      result: { ...job.result, imported, activity: job.result?.activity || [] },
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', job.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sincronizarea locală a eșuat'
    await updateJobProgress(sb, job, {}, { status: 'eroare', text: 'Sincronizarea s-a oprit', detail: message })
    await sb.from('inbox_surse_email').update({
      status: 'eroare',
      connection_error: message,
      updated_at: new Date().toISOString(),
    }).eq('id', job.source_id)
    await sb.from('inbox_sync_jobs').update({
      status: 'error',
      error_message: message,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', job.id)
  }
}

export async function POST(req: NextRequest) {
  const { sourceId, firmaId, lunaId, luna } = await req.json().catch(() => ({}))
  const cleanSourceId = String(sourceId || '')
  const cleanFirmaId = String(firmaId || '')
  const cleanLunaId = String(lunaId || '')
  const cleanLuna = String(luna || '')
  if (!cleanSourceId || !cleanFirmaId || !cleanLunaId || !cleanLuna) {
    return NextResponse.json({ error: 'sourceId/firmaId/lunaId/luna lipsesc' }, { status: 400 })
  }

  const sb = getServiceSupabase()

  const staleCutoff = new Date(Date.now() - 3 * 60_000).toISOString()
  const { data: running } = await sb
    .from('inbox_sync_jobs')
    .select('id,status,created_at,updated_at,result')
    .eq('source_id', cleanSourceId)
    .eq('firma_id', cleanFirmaId)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
  const runningJob = running?.[0] as (SyncJob & { status?: string; updated_at?: string | null }) | undefined
  if (runningJob && (!runningJob.updated_at || runningJob.updated_at >= staleCutoff)) {
    return NextResponse.json({ job: runningJob, alreadyRunning: true })
  }

  const initialResult: SyncResult = {
    messagesChecked: 0,
    pdfsFound: 0,
    imported: [],
    activity: [{
      time: new Date().toISOString(),
      status: 'info',
      text: 'Sincronizare trimisă la server',
      detail: 'Fișiere locale',
    }],
  }

  const { data: job, error } = await sb.from('inbox_sync_jobs').insert({
    source_id: cleanSourceId,
    firma_id: cleanFirmaId,
    luna_id: cleanLunaId,
    luna: cleanLuna,
    status: 'queued',
    result: initialResult,
    updated_at: new Date().toISOString(),
  }).select('id,source_id,firma_id,luna_id,luna,status,result,created_at,updated_at').single()
  if (error || !job) return NextResponse.json({ error: error?.message || 'Jobul nu a putut fi creat' }, { status: 500 })

  after(async () => {
    await runLocalSyncJob(job as SyncJob)
  })

  return NextResponse.json({ job })
}
