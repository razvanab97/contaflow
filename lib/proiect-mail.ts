import Anthropic from '@anthropic-ai/sdk'

// Contrapărțile de corespondență pentru PROIECT AB Textile - folosite atât pentru interogarea
// Gmail, cât și pentru calculul direcției mesajului (cine a scris cui).
export const PROIECT_COUNTERPARTS = {
  prosocial: { label: 'Prosocial', addresses: ['prosocial@iov.ro'] },
  orieda: { label: 'Orieda Office', addresses: ['orieda.office@orieda.ro', 'orieda@gmail.com'] },
} as const

type CounterpartKey = keyof typeof PROIECT_COUNTERPARTS

// --- Helpere Gmail (duplicate deliberat din app/api/inbox-facturi/gmail/sync/route.ts - acel
// fișier rămâne neatins, ca să nu riscăm pipeline-ul de facturi; vezi convenția deja folosită în
// cod la analyzeGenericDoc vs analyzeInvoice). ---

export type GmailPart = {
  partId?: string
  mimeType?: string
  filename?: string
  body?: { attachmentId?: string; data?: string; size?: number }
  parts?: GmailPart[]
}
export type GmailHeader = { name?: string; value?: string }
export type GmailMessage = {
  id: string
  threadId?: string
  snippet?: string
  internalDate?: string
  payload?: GmailPart & { headers?: GmailHeader[] }
}
type TokenResponse = { access_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string }
type GmailListResponse = { messages?: { id: string; threadId?: string }[]; nextPageToken?: string }

export function decodeBase64Url(data: string) {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64').toString('utf-8')
}

export function headerValue(headers: GmailHeader[] | undefined, name: string) {
  return (headers || []).find(header => header.name?.toLowerCase() === name.toLowerCase())?.value || ''
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

// Interogare Gmail pentru corespondența cu Prosocial/Orieda - spre deosebire de sincronizarea de
// facturi (has:attachment filename:pdf), aici contează la fel de mult textul din corpul mailului,
// deci nu restrângem la mesaje cu atașament, și acoperim ambele direcții (from/to).
export function buildProiectMailQuery(sinceDate?: string | null, untilDate?: string | null) {
  const addresses = Object.values(PROIECT_COUNTERPARTS).flatMap(c => [...c.addresses])
  const parts = addresses.flatMap(addr => [`from:${addr}`, `to:${addr}`])
  const since = cleanIsoDate(sinceDate)
  const until = cleanIsoDate(untilDate)
  const untilQuery = until ? ` before:${gmailDate(addOneDayIso(until))}` : ''
  const sinceQuery = since ? ` after:${gmailDate(since)}` : ''
  return { query: `(${parts.join(' OR ')})${sinceQuery}${untilQuery}`, since, until }
}

export async function refreshAccessToken(source: { id: string; access_token: string | null; refresh_token: string | null; token_expires_at: string | null }, sb: { from: (t: string) => any }) {
  if (!source.refresh_token) return source.access_token
  const expiresAt = source.token_expires_at ? new Date(source.token_expires_at).getTime() : 0
  if (source.access_token && expiresAt > Date.now() + 60_000) return source.access_token

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET lipsesc din env')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: source.refresh_token, grant_type: 'refresh_token' }),
  })
  const token = await res.json().catch(() => ({})) as TokenResponse
  if (!res.ok || !token.access_token) throw new Error(token.error_description || token.error || 'Tokenul Gmail nu a putut fi reîmprospătat')

  await sb.from('inbox_surse_email').update({
    access_token: token.access_token,
    token_expires_at: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
    scopes: token.scope || null,
    updated_at: new Date().toISOString(),
  }).eq('id', source.id)

  return token.access_token
}

export async function gmailJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30_000) })
  const json = await res.json().catch(() => ({})) as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(json.error?.message || 'Gmail API a întors eroare')
  return json as T
}

export async function listGmailMessages(accessToken: string, query: string, maxMessages: number) {
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

// Textul din corpul mailului - de multe ori aici e informația reală (nu în atașamente): "Semnati
// si retrimiteti. Sa ramana data de 02.04.2026", "am initiat platile salariilor" etc. Cauta intai
// text/plain; daca nu exista, cade pe text/html cu tag-urile eliminate (simplu, ca restul codului).
export function collectBodyText(part: GmailPart | undefined): string {
  if (!part) return ''
  if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64Url(part.body.data)
  for (const child of part.parts || []) {
    const found = collectBodyText(child)
    if (found) return found
  }
  if (part.mimeType === 'text/html' && part.body?.data) {
    return decodeBase64Url(part.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  for (const child of part.parts || []) {
    if (child.mimeType === 'text/html' && child.body?.data) {
      return decodeBase64Url(child.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    }
  }
  return ''
}

export type Directie = 'catre_prosocial' | 'catre_orieda' | 'de_la_prosocial' | 'de_la_orieda' | 'alta'

// Directia se calculeaza determinist in cod (nu ghicita de AI) - comparam From/To cu adresa
// casutei conectate si cu adresele cunoscute ale contrapartilor.
export function computeDirection(from: string, to: string, mailboxEmail: string | null): Directie {
  const fromLower = from.toLowerCase()
  const toLower = to.toLowerCase()
  const mailbox = (mailboxEmail || '').toLowerCase()
  for (const [key, cp] of Object.entries(PROIECT_COUNTERPARTS) as [CounterpartKey, typeof PROIECT_COUNTERPARTS[CounterpartKey]][]) {
    const isFromCp = cp.addresses.some(addr => fromLower.includes(addr))
    const isToCp = cp.addresses.some(addr => toLower.includes(addr))
    if (isFromCp && !isToCp) return key === 'prosocial' ? 'de_la_prosocial' : 'de_la_orieda'
    if (isToCp && mailbox && fromLower.includes(mailbox)) return key === 'prosocial' ? 'catre_prosocial' : 'catre_orieda'
    if (isToCp && !isFromCp) return key === 'prosocial' ? 'catre_prosocial' : 'catre_orieda'
  }
  return 'alta'
}

function extractJson<T>(value: string): T | null {
  const match = value.match(/\{[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[0]) as T } catch { return null }
}

export interface ObligatieTipInfo { tipKey: string; label: string; destinatar: string | null }
export interface LunaInfo { id: string; luna: string }
export interface AchizitieDeschisaInfo { id: string; denumire: string; valoare: number | null; status: string }

export interface ClasificareEmail {
  relevanta: 'obligatie' | 'achizitie' | 'ambele' | 'irelevant'
  obligatie: {
    tipKey: string | null
    tipEveniment: 'trimis' | 'scadenta_override' | 'ambele'
    dataTrimitere: string | null
    scadentaPropusa: string | null
    perioadaLuna: string | null
    incredere: 'sigur' | 'posibil'
    motiv: string | null
  } | null
  achizitie: {
    actiune: 'creare' | 'actualizare_status' | 'neclar'
    achizitieIdPotrivit: string | null
    denumire: string | null
    valoare: number | null
    sursa: 'cofinantare' | 'grant' | 'altul' | null
    statusPropus: 'oferta' | 'nota_semnata' | 'plata_initiata' | 'dovada_trimisa' | 'finalizat' | null
    incredere: 'sigur' | 'posibil'
    motiv: string | null
  } | null
}

export async function classifyProiectEmail(email: {
  directie: Directie; subiect: string; de_la: string; catre: string; data: string; corp: string
}, context: {
  obligatiiTipuri: ObligatieTipInfo[]
  luni: LunaInfo[]
  achizitiiDeschise: AchizitieDeschisaInfo[]
}): Promise<ClasificareEmail | null> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const prompt = `Analizezi corespondența pe email a unui proiect european derulat de o firmă românească, cu administratorul de grant "Prosocial" și un birou de contabilitate "Orieda Office". Trebuie să decizi dacă acest mail e relevant pentru două lucruri urmărite în aplicație: obligații lunare recurente și achiziții de echipamente/materiale.

Direcția mailului (calculată determinist, ai încredere în ea): ${email.directie}
- "de_la_prosocial"/"de_la_orieda" = ei ne scriu nouă (de obicei o CERERE sau un memento, NU dovadă că noi am trimis ceva)
- "catre_prosocial"/"catre_orieda" = noi le scriem lor (poate fi dovadă că am trimis ceva, dacă textul confirmă explicit o acțiune)

Subiect: ${email.subiect}
De la: ${email.de_la}
Către: ${email.catre}
Data: ${email.data}
Corp mail (poate fi trunchiat):
"""
${email.corp}
"""

Obligațiile lunare cunoscute (tipKey - label - destinatar): ${JSON.stringify(context.obligatiiTipuri)}
Lunile contabile cunoscute ale proiectului (id - luna calendaristică): ${JSON.stringify(context.luni)}
Achizițiile deja deschise în sistem (id - denumire - valoare - status curent): ${JSON.stringify(context.achizitiiDeschise)}

Reguli obligatorii:
1. Un mail "de_la_prosocial"/"de_la_orieda" care doar CERE ceva ("trimiteți", "semnați și retrimiteți", memento) NU e niciodată dovadă de "trimis" din partea noastră - cel mult propune "scadenta_override" dacă menționează explicit o dată nouă de termen.
2. Un mail "catre_prosocial"/"catre_orieda" care CONFIRMĂ o acțiune deja făcută ("am inițiat plățile", "atașez dovada", "am transmis") E dovadă de "trimis".
3. "incredere":"sigur" doar când acțiunea/data e explicită și fără ambiguitate; altfel "posibil".
4. Nu inventa niciodată un "tipKey" sau "achizitieIdPotrivit" care nu apare exact în listele de mai sus - dacă nu se potrivește nimic, pune null.
5. Un mail fără nicio legătură concretă cu obligațiile de mai sus sau cu o achiziție (anunțuri generale, notificări administrative fără acțiune cerută/confirmată) trebuie să primească "relevanta":"irelevant" - nu forța o potrivire.
6. Pentru achiziții: "actiune":"creare" doar dacă poți identifica o denumire clară a ce se cumpără; dacă mailul doar aluzează vag, folosește "neclar" în loc să ghicești.

Răspunde DOAR cu acest JSON (fără alt text):
{"relevanta":"obligatie|achizitie|ambele|irelevant","obligatie":null sau {"tipKey":string|null,"tipEveniment":"trimis|scadenta_override|ambele","dataTrimitere":"AAAA-LL-ZZ"|null,"scadentaPropusa":"AAAA-LL-ZZ"|null,"perioadaLuna":string|null,"incredere":"sigur|posibil","motiv":"1-2 propoziții scurte, citând fraza relevantă"},"achizitie":null sau {"actiune":"creare|actualizare_status|neclar","achizitieIdPotrivit":string|null,"denumire":string|null,"valoare":number|null,"sursa":"cofinantare|grant|altul"|null,"statusPropus":"oferta|nota_semnata|plata_initiata|dovada_trimisa|finalizat"|null,"incredere":"sigur|posibil","motiv":"..."}}`

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const parsed = extractJson<ClasificareEmail>(raw)
    if (!parsed || !['obligatie', 'achizitie', 'ambele', 'irelevant'].includes(parsed.relevanta)) return null
    return parsed
  } catch {
    return null
  }
}
