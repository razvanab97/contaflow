import { NextRequest, NextResponse } from 'next/server'
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
  payload?: GmailPart
  error?: { message?: string }
}

type GmailAttachment = {
  data?: string
  size?: number
  error?: { message?: string }
}

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

export async function POST(req: NextRequest) {
  const { sourceId, firmaId, lunaId, luna, max = 10 } = await req.json().catch(() => ({}))
  const cleanSourceId = String(sourceId || '')
  const cleanFirmaId = String(firmaId || '')
  const cleanLunaId = String(lunaId || '')
  const cleanLuna = String(luna || '')
  const maxMessages = Math.min(Math.max(Number(max) || 10, 1), 25)
  if (!cleanSourceId || !cleanFirmaId || !cleanLunaId || !cleanLuna) {
    return NextResponse.json({ error: 'sourceId/firmaId/lunaId/luna lipsesc' }, { status: 400 })
  }

  const sb = getServiceSupabase()
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

    const since = previousMonthStartForGmail(cleanLuna)
    const query = encodeURIComponent(`has:attachment filename:pdf after:${since.gmail}`)
    const list = await gmailJson<GmailListResponse>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=${maxMessages}`,
      accessToken
    )

    const imported = []
    let pdfsFound = 0
    for (const messageRef of list.messages || []) {
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
          firmaId: cleanFirmaId,
          lunaId: cleanLunaId,
          luna: cleanLuna,
          sourceLabel: `${source.eticheta}${source.email ? ` (${source.email})` : ''}`,
        }))
      }
    }

    await sb.from('inbox_surse_email').update({
      status: 'activ',
      connection_error: null,
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', cleanSourceId)

    return NextResponse.json({
      messagesChecked: list.messages?.length || 0,
      pdfsFound,
      since: since.iso,
      imported,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sincronizarea Gmail a eșuat'
    await sb.from('inbox_surse_email').update({
      status: 'eroare',
      connection_error: message,
      updated_at: new Date().toISOString(),
    }).eq('id', cleanSourceId)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
