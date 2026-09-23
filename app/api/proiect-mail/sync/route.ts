import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { MODULE_DEFS } from '@/lib/firma-config'
import {
  buildProiectMailQuery, refreshAccessToken, listGmailMessages, gmailJson,
  headerValue, collectBodyText, computeDirection, classifyProiectEmail,
  type GmailMessage,
} from '@/lib/proiect-mail'

// Plafonul planului Vercel Hobby - vezi acelasi comentariu in gmail/sync/route.ts. Fara coada de
// job-uri aici (volum mult mai mic decat la facturi - zeci de mailuri, nu sute), deci rulam sincron
// si ne oprim singuri cu marja daca ne apropiem de limita; proiect_mail_processed face reluarea
// urmatorului click idempotenta automat.
export const maxDuration = 60
const TIME_BUDGET_MS = 45_000
const MAX_MESSAGES = 60

function cleanIsoDate(value: unknown) {
  const text = String(value || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const firmaId = String(body.firmaId || '')
  const sinceDate = cleanIsoDate(body.sinceDate)
  const untilDate = cleanIsoDate(body.untilDate)
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: source, error: sourceError } = await sb
    .from('inbox_surse_email')
    .select('id,firma_id,email,access_token,refresh_token,token_expires_at')
    .eq('firma_id', firmaId)
    .eq('provider', 'gmail')
    .limit(1)
    .single()
  if (sourceError || !source) return NextResponse.json({ error: 'Contul Gmail pentru acest proiect nu e conectat' }, { status: 404 })

  let accessToken: string | null
  try {
    accessToken = await refreshAccessToken(source, sb)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reîmprospătarea tokenului a eșuat'
    await sb.from('inbox_surse_email').update({ status: 'eroare', connection_error: message, updated_at: new Date().toISOString() }).eq('id', source.id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
  if (!accessToken) return NextResponse.json({ error: 'Conexiunea Gmail nu are access token. Reconectează contul.' }, { status: 400 })

  const { query } = buildProiectMailQuery(sinceDate, untilDate)
  const allMessages = await listGmailMessages(accessToken, query, MAX_MESSAGES)
  const { data: seenRows } = await sb
    .from('proiect_mail_processed')
    .select('message_id')
    .eq('source_id', source.id)
    .in('message_id', allMessages.map(m => m.id))
  const seen = new Set((seenRows || []).map(r => r.message_id))
  const toProcess = allMessages.filter(m => !seen.has(m.id))

  const obligatiiTipuri = MODULE_DEFS['obligatii-recurente'].tasks.map(t => ({ tipKey: t.key, label: t.label, destinatar: t.destinatar || null }))
  const { data: luni } = await sb.from('luni_contabile').select('id,luna').eq('firma_id', firmaId).order('luna', { ascending: true })
  const { data: achizitiiRows } = await sb.from('proiect_achizitii').select('id,denumire,valoare,status').eq('firma_id', firmaId).order('created_at', { ascending: false }).limit(30)

  const startedAt = Date.now()
  const timeIsUp = () => Date.now() - startedAt > TIME_BUDGET_MS
  let stoppedEarly = false
  let noiSugestiiObligatii = 0
  const processedIds: string[] = []

  for (const ref of toProcess) {
    if (timeIsUp()) { stoppedEarly = true; break }
    let msg: GmailMessage
    try {
      msg = await gmailJson<GmailMessage>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(ref.id)}?format=full`, accessToken)
    } catch {
      continue
    }
    const headers = msg.payload?.headers || []
    const subiect = headerValue(headers, 'Subject') || '(fără subiect)'
    const de_la = headerValue(headers, 'From')
    const catre = headerValue(headers, 'To')
    const dataHeader = headerValue(headers, 'Date')
    const corp = collectBodyText(msg.payload).slice(0, 6000)
    const directie = computeDirection(de_la, catre, source.email)

    let clasificare: Awaited<ReturnType<typeof classifyProiectEmail>> = null
    if (corp.trim() && directie !== 'alta') {
      clasificare = await classifyProiectEmail(
        { directie, subiect, de_la, catre, data: dataHeader, corp },
        { obligatiiTipuri, luni: luni || [], achizitiiDeschise: achizitiiRows || [] }
      )
    }

    await sb.from('proiect_mail_processed').upsert({
      source_id: source.id,
      message_id: ref.id,
      clasificare: clasificare?.relevanta || 'irelevant',
      raspuns_ai: clasificare,
    }, { onConflict: 'source_id,message_id', ignoreDuplicates: true })
    processedIds.push(ref.id)

    const obligatie = clasificare?.obligatie
    if (obligatie?.tipKey && obligatiiTipuri.some(t => t.tipKey === obligatie.tipKey)) {
      const lunaRow = (luni || []).find(l => l.luna === obligatie.perioadaLuna)
        || (luni || []).slice().reverse().find(l => new Date(l.luna) <= new Date(dataHeader || Date.now()))
      if (lunaRow) {
        const tipSugestie = obligatie.tipEveniment === 'scadenta_override' ? 'scadenta_override' : 'trimis'
        const valoareData = tipSugestie === 'scadenta_override' ? obligatie.scadentaPropusa : (obligatie.dataTrimitere || dataHeader?.slice(0, 10) || null)
        const { error: insertError } = await sb.from('obligatii_sugestii').upsert({
          luna_id: lunaRow.id,
          tip_key: obligatie.tipKey,
          tip_sugestie: tipSugestie,
          valoare_data: valoareData,
          incredere: obligatie.incredere,
          sursa_email_id: ref.id,
          sursa_subiect: subiect,
          sursa_data: dataHeader ? new Date(dataHeader).toISOString() : null,
          sursa_rezumat: obligatie.motiv,
        }, { onConflict: 'luna_id,tip_key,tip_sugestie,sursa_email_id', ignoreDuplicates: true })
        if (!insertError) noiSugestiiObligatii += 1
      }
    }
  }

  await sb.from('inbox_surse_email').update({ status: 'activ', connection_error: null, last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', source.id)

  return NextResponse.json({
    messagesChecked: toProcess.length,
    noiSugestiiObligatii,
    stoppedEarly,
  })
}
