import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { importInboxDocument } from '@/lib/inbox-facturi'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type InboxSource = {
  id: string
  firma_id: string
  provider: string
  eticheta: string
  email: string | null
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
}

type TokenResponse = {
  access_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

type GmailListResponse = {
  messages?: { id: string; threadId?: string }[]
  nextPageToken?: string
  error?: { message?: string }
}

type GmailPart = {
  partId?: string
  mimeType?: string
  filename?: string
  body?: { attachmentId?: string; data?: string; size?: number }
  parts?: GmailPart[]
}

type GmailMessage = {
  id: string
  threadId?: string
  snippet?: string
  internalDate?: string
  payload?: GmailPart
  error?: { message?: string }
}

type GmailAttachment = {
  data?: string
  size?: number
  error?: { message?: string }
}

type SyncJob = {
  id: string
  source_id: string
  firma_id: string
  luna_id: string
  luna: string
  result?: { sinceDate?: string; untilDate?: string } | null
}

type GmailHeader = { name?: string; value?: string }

function decodeBase64Url(data: string) {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/')
  return new Uint8Array(Buffer.from(normalized, 'base64'))
}

function collectPdfParts(part: GmailPart | undefined, out: GmailPart[] = []) {
  if (!part) return out
  const filename = part.filename || ''
  const isPdf = filename.toLowerCase().endsWith('.pdf') || part.mimeType === 'application/pdf'
  if (isPdf && (part.body?.attachmentId || part.body?.data)) out.push(part)
  for (const child of part.parts || []) collectPdfParts(child, out)
  return out
}

function headerValue(headers: GmailHeader[] | undefined, name: string) {
  return (headers || []).find(header => header.name?.toLowerCase() === name.toLowerCase())?.value || ''
}

function previousMonthStartForGmail(workMonth: string) {
  const match = workMonth.match(/^(\d{4})-(\d{2})/)
  const base = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
    : new Date()
  const previous = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - 1, 1))
  const year = previous.getUTCFullYear()
  const month = String(previous.getUTCMonth() + 1).padStart(2, '0')
  return {
    iso: `${year}-${month}-01`,
    gmail: `${year}/${month}/01`,
  }
}

function cleanIsoDate(value: unknown) {
  const text = String(value || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function gmailDate(value: string) {
  return value.replace(/-/g, '/')
}

function addOneDayIso(value: string) {
  const date = new Date(value + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function gmailQuery(workMonth: string, sinceDate?: string | null, untilDate?: string | null) {
  const defaultSince = previousMonthStartForGmail(workMonth)
  const since = cleanIsoDate(sinceDate) || defaultSince.iso
  const until = cleanIsoDate(untilDate)
  const untilQuery = until ? ` before:${gmailDate(addOneDayIso(until))}` : ''
  return {
    query: `has:attachment filename:pdf after:${gmailDate(since)}${untilQuery}`,
    since,
    until,
  }
}

async function refreshAccessToken(source: InboxSource) {
  if (!source.refresh_token) return source.access_token
  const expiresAt = source.token_expires_at ? new Date(source.token_expires_at).getTime() : 0
  if (source.access_token && expiresAt > Date.now() + 60_000) return source.access_token

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET lipsesc din env')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: source.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const token = await res.json().catch(() => ({})) as TokenResponse
  if (!res.ok || !token.access_token) {
    throw new Error(token.error_description || token.error || 'Tokenul Gmail nu a putut fi reîmprospătat')
  }

  const sb = getServiceSupabase()
  await sb.from('inbox_surse_email').update({
    access_token: token.access_token,
    token_expires_at: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
    scopes: token.scope || null,
    updated_at: new Date().toISOString(),
  }).eq('id', source.id)

  return token.access_token
}

async function gmailJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  const json = await res.json().catch(() => ({})) as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(json.error?.message || 'Gmail API a întors eroare')
  return json as T
}

async function listGmailMessages(accessToken: string, query: string, maxMessages: number) {
  const messages: { id: string; threadId?: string }[] = []
  let pageToken = ''
  while (messages.length < maxMessages) {
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
    url.searchParams.set('q', query)
    url.searchParams.set('maxResults', String(Math.min(50, maxMessages - messages.length)))
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const page = await gmailJson<GmailListResponse>(url.toString(), accessToken)
    messages.push(...(page.messages || []))
    if (!page.nextPageToken) break
    pageToken = page.nextPageToken
  }
  return messages
}

async function runGmailSyncJob(job: SyncJob, maxMessages: number) {
  const sb = getServiceSupabase()
  await sb.from('inbox_sync_jobs').update({
    status: 'running',
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', job.id)

  try {
    const { data: source, error: sourceError } = await sb
      .from('inbox_surse_email')
      .select('id,firma_id,provider,eticheta,email,access_token,refresh_token,token_expires_at')
      .eq('id', job.source_id)
      .eq('firma_id', job.firma_id)
      .eq('provider', 'gmail')
      .single()
    if (sourceError || !source) throw new Error(sourceError?.message || 'Sursa Gmail nu există')

    const accessToken = await refreshAccessToken(source as InboxSource)
    if (!accessToken) throw new Error('Conexiunea Gmail nu are access token. Reconectează contul Google.')

    const { query, since: sinceDate, until: untilDate } = gmailQuery(job.luna, job.result?.sinceDate, job.result?.untilDate)
    const messages = await listGmailMessages(accessToken, query, maxMessages)

    const imported = []
    let pdfsFound = 0
    for (const messageRef of messages) {
      const msg = await gmailJson<GmailMessage>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageRef.id)}?format=full`,
        accessToken
      )
      const pdfParts = collectPdfParts(msg.payload)
      for (const part of pdfParts) {
        pdfsFound += 1
        const fallbackName = `gmail_${messageRef.id}_${part.partId || pdfsFound}.pdf`
        const fileName = part.filename || fallbackName
        const bytes = part.body?.data
          ? decodeBase64Url(part.body.data)
          : part.body?.attachmentId
            ? decodeBase64Url((await gmailJson<GmailAttachment>(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageRef.id)}/attachments/${encodeURIComponent(part.body.attachmentId)}`,
                accessToken
              )).data || '')
            : null
        if (!bytes?.length) continue
        imported.push(await importInboxDocument({
          sb,
          bytes,
          mediaType: 'application/pdf',
          originalName: fileName,
          firmaId: job.firma_id,
          lunaId: job.luna_id,
          luna: job.luna,
          sourceLabel: `${source.eticheta}${source.email ? ` (${source.email})` : ''}`,
          requireDetectedFirm: true,
        }))
      }
    }

    await sb.from('inbox_surse_email').update({
      status: 'activ',
      connection_error: null,
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', job.source_id)

    const result = {
      messagesChecked: messages.length,
      pdfsFound,
      since: sinceDate,
      until: untilDate,
      imported,
    }
    const skipped = imported.filter(item => item.skipped).length
    const duplicates = imported.filter(item => item.duplicate).length
    const saved = imported.filter(item => !item.duplicate && !item.skipped).length
    await sb.from('inbox_sync_jobs').update({
      status: 'done',
      messages_checked: result.messagesChecked,
      pdfs_found: pdfsFound,
      imported_count: saved,
      duplicate_count: duplicates,
      skipped_count: skipped,
      since_date: sinceDate,
      result,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', job.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sincronizarea Gmail a eșuat'
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

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const sourceId = req.nextUrl.searchParams.get('sourceId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  let query = sb
    .from('inbox_sync_jobs')
    .select('id,source_id,firma_id,luna_id,luna,status,messages_checked,pdfs_found,imported_count,duplicate_count,skipped_count,since_date,error_message,result,started_at,completed_at,created_at,updated_at')
    .eq('firma_id', firmaId)
    .order('created_at', { ascending: false })
    .limit(12)
  if (sourceId) query = query.eq('source_id', sourceId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobs: data || [] })
}

export async function POST(req: NextRequest) {
  const { sourceId, firmaId, lunaId, luna, max = 100, sinceDate, untilDate, preview = false } = await req.json().catch(() => ({}))
  const cleanSourceId = String(sourceId || '')
  const cleanFirmaId = String(firmaId || '')
  const cleanLunaId = String(lunaId || '')
  const cleanLuna = String(luna || '')
  const maxMessages = Math.min(Math.max(Number(max) || 100, 1), 100)
  const cleanSinceDate = cleanIsoDate(sinceDate)
  const cleanUntilDate = cleanIsoDate(untilDate)
  if (!cleanSourceId || !cleanFirmaId || !cleanLunaId || !cleanLuna) {
    return NextResponse.json({ error: 'sourceId/firmaId/lunaId/luna lipsesc' }, { status: 400 })
  }
  if ((sinceDate && !cleanSinceDate) || (untilDate && !cleanUntilDate)) {
    return NextResponse.json({ error: 'Intervalul trebuie să fie în format AAAA-LL-ZZ' }, { status: 400 })
  }
  if (cleanSinceDate && cleanUntilDate && cleanSinceDate > cleanUntilDate) {
    return NextResponse.json({ error: 'Data de început nu poate fi după data de final' }, { status: 400 })
  }

  const sb = getServiceSupabase()
  if (preview) {
    const { data: source, error: sourceError } = await sb
      .from('inbox_surse_email')
      .select('id,firma_id,provider,eticheta,email,access_token,refresh_token,token_expires_at')
      .eq('id', cleanSourceId)
      .eq('firma_id', cleanFirmaId)
      .eq('provider', 'gmail')
      .single()
    if (sourceError || !source) return NextResponse.json({ error: sourceError?.message || 'Sursa Gmail nu există' }, { status: 404 })
    try {
      const accessToken = await refreshAccessToken(source as InboxSource)
      if (!accessToken) throw new Error('Conexiunea Gmail nu are access token. Reconectează contul Google.')
      const range = gmailQuery(cleanLuna, cleanSinceDate, cleanUntilDate)
      const messages = await listGmailMessages(accessToken, range.query, maxMessages)
      const previewRows = []
      let pdfsFound = 0
      for (const messageRef of messages) {
        const msg = await gmailJson<GmailMessage & { payload?: GmailPart & { headers?: GmailHeader[] } }>(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageRef.id)}?format=full`,
          accessToken
        )
        const pdfs = collectPdfParts(msg.payload).map(part => ({
          filename: part.filename || `gmail_${messageRef.id}_${part.partId || ''}.pdf`,
          size: part.body?.size || null,
        }))
        pdfsFound += pdfs.length
        if (pdfs.length) {
          const headers = msg.payload?.headers || []
          previewRows.push({
            id: msg.id,
            threadId: msg.threadId || messageRef.threadId || null,
            subject: headerValue(headers, 'Subject') || '(fără subiect)',
            from: headerValue(headers, 'From'),
            date: headerValue(headers, 'Date'),
            snippet: msg.snippet || '',
            pdfs,
          })
        }
      }
      return NextResponse.json({
        preview: true,
        source: { id: source.id, eticheta: source.eticheta, email: source.email },
        sinceDate: range.since,
        untilDate: range.until,
        query: range.query,
        messagesChecked: messages.length,
        pdfsFound,
        messages: previewRows,
      })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Preview-ul Gmail a eșuat' }, { status: 500 })
    }
  }

  const { data: running } = await sb
    .from('inbox_sync_jobs')
    .select('id,status,created_at')
    .eq('source_id', cleanSourceId)
    .eq('firma_id', cleanFirmaId)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
  if (running?.[0]) return NextResponse.json({ job: running[0], alreadyRunning: true })

  const { data: job, error } = await sb.from('inbox_sync_jobs').insert({
    source_id: cleanSourceId,
    firma_id: cleanFirmaId,
    luna_id: cleanLunaId,
    luna: cleanLuna,
    status: 'queued',
    result: { sinceDate: cleanSinceDate, untilDate: cleanUntilDate },
    updated_at: new Date().toISOString(),
  }).select('id,source_id,firma_id,luna_id,luna,status,result,created_at,updated_at').single()
  if (error || !job) return NextResponse.json({ error: error?.message || 'Jobul nu a putut fi creat' }, { status: 500 })

  after(async () => {
    await runGmailSyncJob(job as SyncJob, maxMessages)
  })

  return NextResponse.json({ job })
}
