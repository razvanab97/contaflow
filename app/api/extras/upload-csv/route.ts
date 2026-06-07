import { NextRequest, NextResponse } from 'next/server'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbG11b2FhaXBiYW5qZHB0bGVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDY2NzE2OCwiZXhwIjoyMDk2MjQzMTY4fQ.VCnFDYSfxcbS9Hb9g12di7npy5plSvHpMrb6E2FEdfU'
const SBH = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const CAT_MAP: Record<string, string> = {
  'incasare marketplace': 'client',
  'trendyol': 'client',
  'emag': 'client',
  'heyblu': 'client',
  'dante': 'client',
  'refund': 'furnizor',
  'plata furnizor': 'furnizor',
  'curierat': 'furnizor',
  'sameday': 'furnizor',
  'inatech': 'furnizor',
  'anaf': 'taxa',
  'trezrobu': 'taxa',
  'tva': 'taxa',
  'cam': 'taxa',
  'impozit': 'taxa',
  'imprumut': 'angajat',
  'avans': 'angajat',
  'restituire': 'angajat',
  'abunei': 'angajat',
  'schimb valutar': 'transfer',
  'comision': 'banca',
  'pachet': 'banca',
}

function guessCategorie(descriere: string, catSugerata: string): string {
  const d = (descriere + ' ' + catSugerata).toLowerCase()
  for (const [key, cat] of Object.entries(CAT_MAP)) {
    if (d.includes(key)) return cat
  }
  return 'altele'
}

function parseCleanFloat(valStr: string): number {
  if (!valStr) return 0
  let clean = valStr.trim().replace(/\s/g, '')
  const lastComma = clean.lastIndexOf(',')
  const lastDot = clean.lastIndexOf('.')
  if (lastComma > lastDot) {
    // Comma is decimal separator (e.g. 1.543,28 or 300,15)
    clean = clean.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma) {
    // Dot is decimal separator (e.g. 1,543.28 or 300.15)
    clean = clean.replace(/,/g, '')
  } else if (lastComma === -1 && lastDot === -1) {
    // No separators
  } else if (lastComma !== -1) {
    // Only comma
    clean = clean.replace(',', '.')
  }
  const res = parseFloat(clean)
  return isNaN(res) ? 0 : res
}

function parseDate(d: string): string {
  if (!d) return ''
  const cleaned = d.trim()
  // Matches DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
  const m = cleaned.match(/^(\d{1,2})[/\.-](\d{1,2})[/\.-](\d{4})$/)
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  // Matches YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned
  }
  return d
}

function splitRow(line: string, delimiter: string): string[] {
  if (delimiter !== ',' && delimiter !== ';') {
    return line.split(delimiter).map(c => c.trim())
  }
  const cols: string[] = []
  let cur = ''
  let inQuote = false
  for (let idx = 0; idx < line.length; idx++) {
    const ch = line[idx]
    if (ch === '"') {
      inQuote = !inQuote
    } else if (ch === delimiter && !inQuote) {
      cols.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  cols.push(cur.trim())
  return cols
}

function parseBankCSV(text: string): {
  iban?: string
  valuta?: string
  sold_final?: number
  perioada_start?: string
  perioada_end?: string
  numar_extras?: number
  rows: any[]
} {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l)
  if (lines.length === 0) return { rows: [] }

  let iban: string | undefined
  let valuta: string | undefined
  let sold_final: number | undefined
  let perioada_start: string | undefined
  let perioada_end: string | undefined
  let numar_extras: number | undefined

  // 1. Extract metadata from preamble lines
  for (const line of lines) {
    const cleanLine = line.replace(/\t+/g, ' ').replace(/\s+/g, ' ')
    const lowerLine = cleanLine.toLowerCase()
    
    if (lowerLine.includes('numar cont:') || lowerLine.includes('iban:')) {
      const match = cleanLine.match(/(?:numar cont:|iban:)\s*([a-z0-9]+)/i)
      if (match) iban = match[1].trim()
    }
    if (lowerLine.includes('moneda cont:') || lowerLine.includes('valuta:')) {
      const match = cleanLine.match(/(?:moneda cont:|valuta:)\s*([a-z]+)/i)
      if (match) valuta = match[1].trim().toUpperCase()
    }
    if (lowerLine.includes('sold final')) {
      const match = cleanLine.match(/sold final\s*(?:cont:)?\s*([\d.,\s-]+)/i)
      if (match) sold_final = parseCleanFloat(match[1])
    }
    if (lowerLine.includes('de la:')) {
      const match = cleanLine.match(/de la:\s*([\d/.-]+)/i)
      if (match) perioada_start = parseDate(match[1])
    }
    if (lowerLine.includes('pana la:')) {
      const match = cleanLine.match(/pana la:\s*([\d/.-]+)/i)
      if (match) perioada_end = parseDate(match[1])
    }
    if (lowerLine.includes('numar extras:')) {
      const match = cleanLine.match(/numar extras:\s*(\d+)/i)
      if (match) numar_extras = parseInt(match[1], 10)
    }
  }

  // 2. Find header row
  let headerIndex = -1
  let delimiter = ','

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lLower = line.toLowerCase()
    if (
      (lLower.includes('data') && lLower.includes('descriere')) ||
      (lLower.includes('data tranzactie') && lLower.includes('credit')) ||
      (lLower.includes('data') && lLower.includes('suma')) ||
      (lLower.includes('referinta') && lLower.includes('debit') && lLower.includes('credit'))
    ) {
      headerIndex = i
      if (line.includes('\t')) delimiter = '\t'
      else if (line.includes(';')) delimiter = ';'
      else delimiter = ','
      break
    }
  }

  // Fallback if no header row is identified
  if (headerIndex === -1) {
    headerIndex = 0
    const firstLine = lines[0]
    if (firstLine.includes('\t')) delimiter = '\t'
    else if (firstLine.includes(';')) delimiter = ';'
    else delimiter = ','
  }

  const headerLine = lines[headerIndex]
  const headers = splitRow(headerLine, delimiter)

  let idxData = -1
  let idxRef = -1
  let idxDesc = -1
  let idxDebit = -1
  let idxCredit = -1
  let idxSuma = -1
  let idxTip = -1
  let idxCatSugerata = -1

  headers.forEach((h, idx) => {
    const cleanH = h.toLowerCase().trim().replace(/^\uFEFF/, '')
    if (cleanH === 'data tranzactie' || cleanH === 'data tranzactiei' || (cleanH.includes('data') && !cleanH.includes('valuta') && idxData === -1)) {
      idxData = idx
    } else if (cleanH === 'data valuta' && idxData === -1) {
      idxData = idx
    } else if (cleanH.includes('referinta') || cleanH === 'ref') {
      idxRef = idx
    } else if (cleanH.includes('descriere') || cleanH.includes('explicatii') || cleanH.includes('detalii') || cleanH.includes('tranzactie')) {
      if (cleanH !== 'tip tranzactie') {
        idxDesc = idx
      }
    } else if (cleanH.includes('debit')) {
      idxDebit = idx
    } else if (cleanH.includes('credit')) {
      idxCredit = idx
    } else if (cleanH.includes('suma') || cleanH.includes('valoare')) {
      idxSuma = idx
    } else if (cleanH.includes('tip tranzactie') || cleanH === 'tip') {
      idxTip = idx
    } else if (cleanH.includes('categorie') || cleanH.includes('cat')) {
      idxCatSugerata = idx
    }
  })

  if (idxData === -1) idxData = 0
  if (idxDesc === -1) idxDesc = Math.min(headers.length - 1, 4)

  const rows: any[] = []
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    const cols = splitRow(line, delimiter)
    if (cols.length === 0) continue

    const rawDate = cols[idxData] || ''
    const dateParsed = parseDate(rawDate)
    
    // Skip rows that don't start with a valid date format
    if (!dateParsed || !/\d{4}/.test(dateParsed)) {
      continue
    }

    const descriere = idxDesc !== -1 ? (cols[idxDesc] || '') : ''
    const ref = idxRef !== -1 ? (cols[idxRef] || '') : ''
    const catSugerata = idxCatSugerata !== -1 ? (cols[idxCatSugerata] || '') : ''

    let debit = 0
    let credit = 0
    let suma = 0
    let tip: 'debit' | 'credit' = 'debit'

    if (idxDebit !== -1 || idxCredit !== -1) {
      debit = idxDebit !== -1 ? parseCleanFloat(cols[idxDebit]) : 0
      credit = idxCredit !== -1 ? parseCleanFloat(cols[idxCredit]) : 0
      if (credit > 0 && debit === 0) {
        tip = 'credit'
        suma = credit
      } else if (debit > 0 && credit === 0) {
        tip = 'debit'
        suma = debit
      } else {
        suma = credit || debit
        tip = credit > 0 ? 'credit' : 'debit'
      }
    } else if (idxSuma !== -1) {
      const rawSuma = parseCleanFloat(cols[idxSuma])
      if (rawSuma < 0) {
        tip = 'debit'
        suma = Math.abs(rawSuma)
      } else {
        tip = 'credit'
        suma = rawSuma
      }
    }

    rows.push({
      data: dateParsed,
      descriere,
      debit,
      credit,
      tip,
      suma,
      ref,
      categorie_sugerata: catSugerata,
      valuta: valuta || 'RON'
    })
  }

  return {
    iban,
    valuta,
    sold_final,
    perioada_start,
    perioada_end,
    numar_extras,
    rows
  }
}

async function sbDelete(path: string) {
  await fetch(`${SB}/rest/v1/${path}`, { method: 'DELETE', headers: SBH })
}

async function sbGet(path: string) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: SBH })
  return r.ok ? r.json() : []
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('csv') as File
    const firmaId = fd.get('firmaId') as string
    const lunaId = fd.get('lunaId') as string

    if (!file || !firmaId || !lunaId)
      return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })

    const text = await file.text()
    const parsedData = parseBankCSV(text)

    if (parsedData.rows.length === 0)
      return NextResponse.json({ error: 'CSV gol sau format invalid' }, { status: 400 })

    // Group by valuta (either from parsed metadata or default to what's in rows or 'RON')
    const byValuta: Record<string, any[]> = {}
    for (const row of parsedData.rows) {
      const v = row.valuta || 'RON'
      if (!byValuta[v]) byValuta[v] = []
      byValuta[v].push(row)
    }

    const results: any[] = []

    for (const [valuta, valRows] of Object.entries(byValuta)) {
      // Clear old statement for this luna and valuta
      const old = await sbGet(`extrase?luna_id=eq.${lunaId}&valuta=eq.${valuta}&select=id`)
      for (const e of old) await sbDelete(`tranzactii?extras_id=eq.${e.id}`)
      if (old.length > 0) await sbDelete(`extrase?id=in.(${old.map((e:any) => e.id).join(',')})`)

      const iban = parsedData.iban || null
      const soldFinal = parsedData.sold_final !== undefined ? parsedData.sold_final : null
      const nrExtras = parsedData.numar_extras || null
      const perioadaStart = parsedData.perioada_start || null
      const perioadaEnd = parsedData.perioada_end || null
      
      // Insert extras
      const eRes = await fetch(`${SB}/rest/v1/extrase`, {
        method: 'POST',
        headers: { ...SBH, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          firma_id: firmaId,
          luna_id: lunaId,
          valuta,
          iban,
          numar_extras: nrExtras,
          perioada_start: perioadaStart,
          perioada_end: perioadaEnd,
          pdf_path: null,
          pdf_nume: file.name,
          procesat_ai: false,
          nr_tranzactii: valRows.length,
          nr_documentate: 0,
          sold_final: soldFinal
        })
      })
      const eData = await eRes.json()
      const extras = Array.isArray(eData) ? eData[0] : eData
      if (!extras?.id) {
        results.push({ valuta, error: JSON.stringify(eData) })
        continue
      }

      // Insert tranzactii in batches of 25
      const txs = valRows.map(row => {
        return {
          extras_id: extras.id,
          firma_id: firmaId,
          data_tranzactie: row.data,
          descriere: row.descriere,
          descriere_curatata: row.categorie_sugerata || row.descriere.slice(0, 80),
          tip: row.tip,
          suma: row.suma,
          valuta: row.valuta,
          referinta: row.ref || null,
          categorie: guessCategorie(row.descriere, row.categorie_sugerata),
        }
      })

      for (let i = 0; i < txs.length; i += 25) {
        const r = await fetch(`${SB}/rest/v1/tranzactii`, {
          method: 'POST',
          headers: { ...SBH, 'Prefer': 'return=minimal' },
          body: JSON.stringify(txs.slice(i, i + 25))
        })
        if (!r.ok) {
          results.push({ valuta, error: `Batch ${i}: ${await r.text()}` })
          break
        }
      }

      results.push({ valuta, count: txs.length, extrasId: extras.id })
    }

    return NextResponse.json({ ok: true, results })

  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
