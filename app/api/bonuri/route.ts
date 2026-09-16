import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceSupabase } from '@/lib/supabase/server'
import { pdfPageCount, extractPageRange } from '@/lib/pdfBatch'
import { CUI_ALTERNATIVE } from '@/lib/inbox-facturi'

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])

function safeFilePart(value: string, fallback: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 70) || fallback
}

function norm(value: string | null | undefined) {
  return String(value || '').replace(/^RO/i, '').replace(/\D/g, '')
}

type FirmaCandidat = { id: string; nume: string; cuiToate: string[] }

// Firma pe care se incarca bonul e doar un punct de plecare - daca CUI-ul clientului citit pe bon
// se potriveste cu O ALTA firma din sistem, bonul e atribuit automat acolo (la fel ca la Inbox
// Facturi), ca sa nu ramana din greseala pe firma gresita doar pentru ca a fost incarcat de acolo.
function gasesteFirmaDupaCui(candidati: FirmaCandidat[], cuiClient: string | null, firmaIncarcare: string) {
  if (!cuiClient) return { firmaId: firmaIncarcare, schimbata: false }
  const target = norm(cuiClient)
  const match = candidati.find(f => f.cuiToate.includes(target))
  if (!match) return { firmaId: firmaIncarcare, schimbata: false }
  return { firmaId: match.id, firmaNume: match.nume, schimbata: match.id !== firmaIncarcare }
}

type ExtractieBon = {
  comerciant: string | null
  cuiClient: string | null
  suma: number | null
  dataBon: string | null
  tip: 'combustibil' | 'altul'
}

async function analyzeBon(bytes: Uint8Array, mediaType: string): Promise<ExtractieBon | null> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const source = mediaType === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: Buffer.from(bytes).toString('base64') } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg' | 'image/png', data: Buffer.from(bytes).toString('base64') } }
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: [
        source,
        { type: 'text', text: `Extrage datele acestui bon fiscal (de regula de la o benzinarie sau un magazin). Raspunde DOAR cu JSON: {"comerciant":"numele punctului de lucru/benzinariei emitente (locatia specifica, ex. \\"Petrom Gara Nicolina\\"), nu doar denumirea legala generica a societatii","cuiClient":"DOAR cifrele CUI/CIF-ul clientului, din campul etichetat \\"Client C.U.I./C.I.F.\\" sau \\"C.U.I. client\\" - un numar, eventual precedat de RO","suma":123.45,"dataBon":"AAAA-LL-ZZ","tip":"combustibil sau altul"}.

Reguli:
- "cuiClient" e DOAR sirul de cifre (codul fiscal), niciodata numele firmei. Bonul poate avea si un camp separat "Nume Client" cu numele firmei (ex. "ABXHOMES S.R.L.") - acela NU se pune in "cuiClient", il ignori complet. Daca bonul are explicit o rubrica de CUI/CIF pentru client, cu cifre, pune acele cifre; daca nu gasesti cifre clare pentru CUI-ul clientului, raspunde null. Foarte multe bonuri nu au deloc aceasta rubrica.
- Nu confunda "cuiClient" cu CUI-ul/CIF-ul emitentului (comerciantului/benzinariei), care apare de obicei in antet si NU trebuie pus in "cuiClient".
- "comerciant": daca bonul are atat denumirea legala completa (ex. "S.C. OMV PETROM MARKETING S.R.L.") cat si un nume de punct de lucru/locatie (ex. "PETROM GARA NICOLINA"), foloseste punctul de lucru/locatia - e mai util pentru identificare, chiar daca denumirea legala e mai proeminenta vizual.
- "suma" e suma totala platita (campul "Total"/"Total de plata").
- "tip" e "combustibil" daca bonul contine produse petroliere (motorina, benzina, GPL, EURO diesel, Premium, Efix, Jet A1 sau similare) sau statia e o benzinarie; altfel "altul".
- Lasa null campurile pe care nu le gasesti cu certitudine. Nu inventa date.` },
      ] }],
    })
    const raw = response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    const cuiClient = typeof parsed.cuiClient === 'string' ? parsed.cuiClient.trim() : null
    return {
      comerciant: typeof parsed.comerciant === 'string' ? parsed.comerciant : null,
      // cuiClient trebuie sa fie doar cifre (eventual precedate de RO) - modelul confunda uneori
      // campul CUI cu cel de "Nume Client" aflat imediat langa el si pune numele firmei aici.
      cuiClient: cuiClient && /^(RO)?\d{2,10}$/i.test(cuiClient) ? cuiClient : null,
      suma: typeof parsed.suma === 'number' ? parsed.suma : null,
      dataBon: typeof parsed.dataBon === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dataBon) ? parsed.dataBon : null,
      tip: parsed.tip === 'combustibil' ? 'combustibil' : 'altul',
    }
  } catch {
    return null
  }
}

const SELECT_COLS = 'id,fisier_nume,fisier_tip,tip,comerciant,cui_client,suma,data_bon,status,tranzactie_id,created_at'

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('bonuri')
    .select(SELECT_COLS)
    .eq('firma_id', firmaId)
    // Cronologic dupa data de pe bon (nu dupa cand a fost incarcat) - bonurile fara data citita
    // (data_bon null) cad la final cu order-ul implicit Postgres (NULLS LAST pe ascending).
    .order('data_bon', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bonuri: data || [] })
}

async function saveBon(sb: ReturnType<typeof getServiceSupabase>, firmaIncarcare: string, candidati: FirmaCandidat[], bytes: Uint8Array, mediaType: string, originalExtension: string, pageSuffix: string) {
  const extracted = await analyzeBon(bytes, mediaType)
  const { firmaId, firmaNume, schimbata } = gasesteFirmaDupaCui(candidati, extracted?.cuiClient || null, firmaIncarcare)

  const details = [extracted?.comerciant, extracted?.suma != null ? `${extracted.suma}RON` : null].filter(Boolean).join('_')
  const fileName = `${safeFilePart(details, 'bon')}${pageSuffix}_${Date.now()}.${originalExtension}`
  const path = `${firmaId}/bonuri/${fileName}`

  const { error: storageError } = await sb.storage.from('documente').upload(path, bytes, { contentType: mediaType })
  if (storageError) throw new Error(storageError.message)

  const { data, error } = await sb.from('bonuri').insert({
    firma_id: firmaId,
    fisier_path: path,
    fisier_nume: fileName,
    fisier_tip: mediaType,
    tip: extracted?.tip || 'combustibil',
    comerciant: extracted?.comerciant || null,
    cui_client: extracted?.cuiClient || null,
    suma: extracted?.suma ?? null,
    data_bon: extracted?.dataBon || null,
  }).select(SELECT_COLS).single()

  if (error) {
    await sb.storage.from('documente').remove([path])
    throw new Error(error.message)
  }
  return { ...data, firmaSchimbata: schimbata, firmaNume: schimbata ? firmaNume : null }
}

export async function POST(req: NextRequest) {
  try {
  const fd = await req.formData()
  const file = fd.get('file') as File | null
  const firmaId = String(fd.get('firmaId') || '')
  if (!file || !firmaId) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Sunt acceptate doar fișiere PDF, JPG și PNG' }, { status: 400 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
  const sb = getServiceSupabase()

  const { data: firmeRows, error: firmeError } = await sb.from('firme').select('id,slug,nume,cui').eq('activa', true)
  if (firmeError) return NextResponse.json({ error: `Nu am putut citi lista firmelor: ${firmeError.message}` }, { status: 500 })
  const candidati: FirmaCandidat[] = (firmeRows || [])
    .filter(f => f.slug !== 'proiect-ab-textile')
    .map(f => ({
      id: f.id,
      nume: f.nume,
      cuiToate: [f.cui, ...(CUI_ALTERNATIVE[f.slug] || [])].filter((v): v is string => !!v).map(norm).filter(Boolean),
    }))

    if (file.type === 'application/pdf') {
      const pageCount = await pdfPageCount(Buffer.from(bytes))
      if (pageCount > 1) {
        const bonuri = []
        for (let i = 1; i <= pageCount; i++) {
          const pagina = await extractPageRange(Buffer.from(bytes), i, i)
          bonuri.push(await saveBon(sb, firmaId, candidati, new Uint8Array(pagina), file.type, extension, `_p${i}`))
        }
        return NextResponse.json({ bonuri })
      }
    }
    const bon = await saveBon(sb, firmaId, candidati, bytes, file.type, extension, '')
    return NextResponse.json({ bon })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Eroare upload' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const { id, fisier_nume, comerciant, cui_client, suma, data_bon, tip } = await req.json()
  if (!id) return NextResponse.json({ error: 'id lipsește' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof fisier_nume === 'string' && fisier_nume.trim()) patch.fisier_nume = fisier_nume.trim()
  if (typeof comerciant === 'string') patch.comerciant = comerciant.trim() || null
  if (typeof cui_client === 'string') patch.cui_client = cui_client.trim() || null
  if (suma === null || typeof suma === 'number') patch.suma = suma
  if (data_bon === null || (typeof data_bon === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data_bon))) patch.data_bon = data_bon
  if (tip === 'combustibil' || tip === 'altul') patch.tip = tip
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Niciun câmp de actualizat' }, { status: 400 })

  const sb = getServiceSupabase()
  const { error } = await sb.from('bonuri').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: doc } = await sb.from('bonuri').select('fisier_path').eq('id', id).single()
  if (doc?.fisier_path) await sb.storage.from('documente').remove([doc.fisier_path])

  const { error } = await sb.from('bonuri').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
