import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SBH = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function sbPost(path: string, body: object) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method: 'POST', headers: { ...SBH, 'Prefer': 'return=representation' },
    body: JSON.stringify(body)
  })
  const t = await r.text()
  try { const d = JSON.parse(t); return { ok: r.ok, data: Array.isArray(d) ? d[0] : d } }
  catch { return { ok: false, data: t } }
}

async function sbDelete(path: string) {
  await fetch(`${SB}/rest/v1/${path}`, { method: 'DELETE', headers: SBH })
}

async function sbGet(path: string) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: SBH })
  return r.ok ? r.json() : []
}

// Extrage obiecte JSON complete dintr-un text partial
function extractObjects(text: string): any[] {
  const results: any[] = []
  let i = 0
  while (i < text.length) {
    if (text[i] !== '{') { i++; continue }
    let depth = 0, j = i
    while (j < text.length) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') { depth--; if (depth === 0) break }
      j++
    }
    if (depth === 0) {
      try {
        const obj = JSON.parse(text.slice(i, j + 1))
        if (obj.data_tranzactie && obj.suma !== undefined && obj.tip) results.push(obj)
      } catch {}
      i = j + 1
    } else {
      // Obiectul deschis la i nu se inchide (text trunchiat) - il sarim si continuam
      // cautarea de la pozitia urmatoare, ca sa gasim obiectele complete de dupa el.
      i++
    }
  }
  return results
}

function normalizeExtractedExtras(parsed: any, selectedValuta: string) {
  const accounts = Array.isArray(parsed?.conturi) ? parsed.conturi : []
  const parsedValuta = String(parsed?.valuta || '').toUpperCase()
  const rootTransactions = Array.isArray(parsed?.tranzactii) ? parsed.tranzactii : []
  const rootByCurrency = Object.values(rootTransactions.reduce((acc: Record<string, any>, tx: any) => {
    const valuta = String(tx?.valuta || parsedValuta || 'RON').toUpperCase()
    if (!acc[valuta]) {
      acc[valuta] = {
        tranzactii: [],
        iban: parsed?.iban || '',
        soldFinal: parsed?.sold_final ?? null,
        detectedValuta: valuta,
      }
    }
    acc[valuta].tranzactii.push(tx)
    return acc
  }, {}))
  const usableAccounts = accounts
    .map((account: any) => {
      const valuta = String(account?.valuta || '').toUpperCase()
      const tranzactii = Array.isArray(account?.tranzactii) ? account.tranzactii : []
      return {
        tranzactii,
        iban: account?.iban || parsed?.iban || '',
        soldFinal: account?.sold_final ?? parsed?.sold_final ?? null,
        detectedValuta: valuta || parsedValuta || String(tranzactii[0]?.valuta || '').toUpperCase(),
      }
    })
    .filter((account: any) => account.tranzactii.length > 0)

  if (selectedValuta && selectedValuta !== 'AUTO') {
    const selectedAccount = usableAccounts.find((account: any) => account.detectedValuta === selectedValuta)
    const selectedRoot = rootByCurrency.find((account: any) => account.detectedValuta === selectedValuta)
    const source = selectedAccount || selectedRoot
    return {
      statements: source?.tranzactii?.length ? [source] : [],
      availableValute: accounts.map((account: any) => String(account?.valuta || '').toUpperCase()).filter(Boolean),
    }
  }

  return {
    statements: usableAccounts.length ? usableAccounts : rootByCurrency,
    availableValute: accounts.map((account: any) => String(account?.valuta || '').toUpperCase()).filter(Boolean),
  }
}

async function deleteExistingStatement(lunaId: string, valuta: string, explicitExtrasId?: string | null) {
  const ids = explicitExtrasId
    ? [explicitExtrasId]
    : (await sbGet(`extrase?luna_id=eq.${lunaId}&valuta=eq.${encodeURIComponent(valuta)}&select=id`)).map((extras: any) => extras.id)
  for (const id of ids.filter(Boolean)) {
    await sbDelete(`tranzactii?extras_id=eq.${id}`)
    await sbDelete(`extrase?id=eq.${id}`)
  }
}

async function saveStatement(params: {
  firmaId: string
  lunaId: string
  fileName: string
  buf: Buffer
  valuta: string
  iban: string
  soldFinal: number | null
  tranzactii: any[]
  replaceExtrasId?: string | null
}) {
  const { firmaId, lunaId, fileName, buf, valuta, iban, soldFinal, tranzactii, replaceExtrasId } = params
  const storagePath = `${firmaId}/${lunaId}/${valuta}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.pdf`
  const upRes = await fetch(`${SB}/storage/v1/object/extrase-pdf/${storagePath}`, {
    method: 'POST',
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body: new Blob([new Uint8Array(buf)], { type: 'application/pdf' })
  })
  if (!upRes.ok) throw new Error('Storage: ' + await upRes.text())

  await deleteExistingStatement(lunaId, valuta, replaceExtrasId)

  const { ok: eOk, data: extras } = await sbPost('extrase', {
    firma_id: firmaId, luna_id: lunaId,
    valuta, iban: iban || null, sold_final: soldFinal,
    pdf_path: storagePath, pdf_nume: fileName,
    procesat_ai: true, nr_tranzactii: tranzactii.length, nr_documentate: 0,
  })

  if (!eOk || !extras?.id)
    throw new Error('DB extras: ' + JSON.stringify(extras))

  for (let i = 0; i < tranzactii.length; i += 25) {
    const batch = tranzactii.slice(i, i + 25).map((t: any) => ({
      extras_id: extras.id, firma_id: firmaId,
      data_tranzactie: t.data_tranzactie,
      descriere: t.descriere || t.descriere_curatata || '',
      descriere_curatata: t.descriere_curatata || t.descriere || '',
      tip: t.tip, suma: Number(t.suma),
      valuta: t.valuta || valuta,
      referinta: t.referinta || null,
      categorie: t.categorie || 'altele',
    }))
    const r = await fetch(`${SB}/rest/v1/tranzactii`, {
      method: 'POST', headers: { ...SBH, 'Prefer': 'return=minimal' },
      body: JSON.stringify(batch)
    })
    if (!r.ok) throw new Error(`Batch ${i}: ${await r.text()}`)
  }

  return { extrasId: extras.id, count: tranzactii.length, valuta }
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('pdf') as File
    const firmaId = fd.get('firmaId') as string
    const lunaId = fd.get('lunaId') as string
    const selectedValuta = String(fd.get('valuta') || '').toUpperCase()
    const replaceExtrasId = fd.get('extrasId') as string | null

    if (!file || !firmaId || !lunaId)
      return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    // AI - folosim Haiku (de 10x mai ieftin decat Opus)
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16000,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } },
          { type: 'text', text: `Extrage TOATE tranzactiile din acest extras de cont bancar roman.
Returneaza DOAR JSON, fara text extra, fara markdown:
{"iban":"RO...","valuta":"RON","sold_final":275.54,"tranzactii":[{"data_tranzactie":"2026-05-04","descriere_curatata":"Trendyol plata","referinta":"Order 147612;241","tip":"credit","suma":300.15,"valuta":"RON","categorie":"client"}]}
Daca PDF-ul contine mai multe conturi/monede, returneaza asa:
{"conturi":[{"iban":"RO...","valuta":"RON","sold_final":275.54,"tranzactii":[...]},{"iban":"RO...","valuta":"EUR","sold_final":1.76,"tranzactii":[...]}]}
Nu amesteca monedele: fiecare tranzactie sta in contul/moneda ei.
"descriere_curatata" = doar numele beneficiarului/platitorului, curatat (fara coduri, IBAN-uri, numere de comanda).
"referinta" = codul de comanda/factura mentionat langa numele beneficiarului in descriere (ex: "Order 147612;241") - de obicei primul segment din descriere, inainte de numele companiei. NU folosi codul "REF:" de la finalul blocului tranzactiei (acela e referinta interna a bancii, nu comanda) - foloseste-l doar daca nu exista alt cod de comanda/factura in descriere. Lasa string gol "" daca nu exista niciun cod.
Categorii: client|furnizor|taxa|angajat|transfer|comision|banca|altele
Exclude randurile: RULAJ ZI, SOLD FINAL, SOLD ANTERIOR, SOLD INITIAL.` }
        ]
      }]
    })

    const raw = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')

    // Parse robust - functioneaza si daca JSON e trunchiat
    let statements: { tranzactii: any[]; iban: string; soldFinal: number | null; detectedValuta: string }[] = []

    // Incearca parse complet
    const fullMatch = raw.match(/\{[\s\S]*\}/)
    if (fullMatch) {
      try {
        const parsed = JSON.parse(fullMatch[0])
        const normalized = normalizeExtractedExtras(parsed, selectedValuta)
        statements = normalized.statements
        if (selectedValuta && selectedValuta !== 'AUTO' && normalized.availableValute.length && !normalized.availableValute.includes(selectedValuta)) {
          return NextResponse.json({ error: `Extrasul pare ${normalized.availableValute.join('/')} — ai ales cardul ${selectedValuta}. Încarcă-l pe cardul corect sau folosește „Citire extras cu AI”.` }, { status: 422 })
        }
      } catch {
        // JSON trunchiat - extrage obiectele complete manual
        const tranzactii = extractObjects(raw)
        const ibanM = raw.match(/"iban"\s*:\s*"([^"]+)"/)
        const iban = ibanM ? ibanM[1] : ''
        const soldM = raw.match(/"sold_final"\s*:\s*([\d.]+)/)
        const soldFinal = soldM ? parseFloat(soldM[1]) : null
        const valutaM = raw.match(/"valuta"\s*:\s*"([^"]+)"/)
        const detectedValuta = valutaM ? valutaM[1].toUpperCase() : String(tranzactii[0]?.valuta || '').toUpperCase()
        if (tranzactii.length) statements = [{ tranzactii, iban, soldFinal, detectedValuta }]
      }
    }

    if (statements.length === 0)
      return NextResponse.json({ error: `Nicio tranzactie extrasa. Preview AI: ${raw.slice(0, 200)}` }, { status: 500 })

    const results = []
    for (const statement of statements) {
      const valuta = selectedValuta && selectedValuta !== 'AUTO'
        ? selectedValuta
        : statement.detectedValuta || String(statement.tranzactii[0]?.valuta || 'RON').toUpperCase()
      if (!valuta) continue
      results.push(await saveStatement({
        firmaId,
        lunaId,
        fileName: file.name,
        buf,
        valuta,
        iban: statement.iban,
        soldFinal: statement.soldFinal,
        tranzactii: statement.tranzactii,
        replaceExtrasId: selectedValuta && selectedValuta !== 'AUTO' ? replaceExtrasId : null,
      }))
    }

    if (results.length === 0)
      return NextResponse.json({ error: `Nicio tranzactie extrasa. Preview AI: ${raw.slice(0, 200)}` }, { status: 500 })

    return NextResponse.json({
      ok: true,
      extrasId: results[0].extrasId,
      count: results.reduce((sum, result) => sum + result.count, 0),
      valuta: results.map(result => result.valuta).join('/'),
      results,
    })

  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
