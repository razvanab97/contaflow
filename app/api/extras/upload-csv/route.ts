import { NextRequest, NextResponse } from 'next/server'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
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

function parseDate(d: string): string {
  // DD/MM/YYYY -> YYYY-MM-DD
  const parts = d.split('/')
  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
  return d
}

function parseCSV(text: string): any[] {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  
  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().replace(/^\uFEFF/, ''))
  
  const rows: any[] = []
  for (let i = 1; i < lines.length; i++) {
    // Handle commas inside quoted fields
    const cols: string[] = []
    let cur = ''
    let inQuote = false
    for (const ch of lines[i]) {
      if (ch === '"') { inQuote = !inQuote }
      else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = '' }
      else cur += ch
    }
    cols.push(cur.trim())
    
    if (cols.length < headers.length) continue
    
    const row: any = {}
    headers.forEach((h, idx) => { row[h] = cols[idx] || '' })
    rows.push(row)
  }
  return rows
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
    const rows = parseCSV(text)

    if (rows.length === 0)
      return NextResponse.json({ error: 'CSV gol sau format invalid' }, { status: 400 })

    // Grupează pe valuta
    const byValuta: Record<string, any[]> = {}
    for (const row of rows) {
      const v = row.valuta_cont || row.valuta || 'RON'
      if (!byValuta[v]) byValuta[v] = []
      byValuta[v].push(row)
    }

    const results: any[] = []

    for (const [valuta, valRows] of Object.entries(byValuta)) {
      // Sterge extras vechi
      const old = await sbGet(`extrase?luna_id=eq.${lunaId}&valuta=eq.${valuta}&select=id`)
      for (const e of old) await sbDelete(`tranzactii?extras_id=eq.${e.id}`)
      if (old.length > 0) await sbDelete(`extrase?id=in.(${old.map((e:any) => e.id).join(',')})`)

      // Detecteaza IBAN si perioada din primul rand
      const firstRow = valRows[0]
      const iban = firstRow.iban || ''
      const perioada = firstRow.perioada_extras || ''
      
      // Insert extras
      const eRes = await fetch(`${SB}/rest/v1/extrase`, {
        method: 'POST',
        headers: { ...SBH, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          firma_id: firmaId, luna_id: lunaId, valuta,
          iban: iban || null,
          numar_extras: null,
          perioada_start: perioada ? parseDate(perioada.split('-')[0]) : null,
          perioada_end: perioada ? parseDate(perioada.split('-')[1]) : null,
          pdf_path: null, pdf_nume: file.name,
          procesat_ai: false,
          nr_tranzactii: valRows.length,
          nr_documentate: 0,
        })
      })
      const eData = await eRes.json()
      const extras = Array.isArray(eData) ? eData[0] : eData
      if (!extras?.id) {
        results.push({ valuta, error: JSON.stringify(eData) })
        continue
      }

      // Insert tranzactii in batches de 25
      const txs = valRows.map(row => {
        const debit = parseFloat(row.debit) || 0
        const credit = parseFloat(row.credit) || 0
        const tip = credit > 0 && debit === 0 ? 'credit' : 'debit'
        const suma = credit > 0 ? credit : debit
        const descriere = row.descriere || ''
        const catSugerata = row.categorie_sugerata || ''

        return {
          extras_id: extras.id,
          firma_id: firmaId,
          data_tranzactie: parseDate(row.data),
          descriere: descriere,
          descriere_curatata: catSugerata || descriere.slice(0, 80),
          tip,
          suma,
          valuta,
          referinta: row.ref || null,
          categorie: guessCategorie(descriere, catSugerata),
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
