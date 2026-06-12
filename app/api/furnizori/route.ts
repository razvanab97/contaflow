import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()

  const [{ data: luniData }, { data: docsData }] = await Promise.all([
    sb.from('luni_contabile').select('id,luna').eq('firma_id', firmaId).order('luna', { ascending: false }),
    sb.from('documente')
      .select('id,furnizor,fisier_path,fisier_nume,tip_document,numar_document,created_at,luna_id')
      .eq('firma_id', firmaId)
      .not('furnizor', 'is', null)
      .not('furnizor', 'eq', '')
      .order('created_at', { ascending: false }),
  ])

  const lunaIds = (luniData || []).map((l: any) => l.id)
  const lunaMap: Record<string, string> = {}
  for (const l of (luniData || [])) lunaMap[l.id] = String(l.luna || '').slice(0, 7)

  const { data: extraseData } = lunaIds.length
    ? await sb.from('extrase').select('id,luna_id').in('luna_id', lunaIds)
    : { data: [] }

  const extraseIds = (extraseData || []).map((e: any) => e.id)
  const extraseToLuna: Record<string, string> = {}
  for (const e of (extraseData || [])) extraseToLuna[e.id] = e.luna_id

  const { data: txData } = extraseIds.length
    ? await sb.from('tranzactii')
      .select('id,tip,suma,valuta,data_tranzactie,descriere_curatata,descriere,categorie,extras_id,document_id,documente(id,furnizor,fisier_nume,tip_document,numar_document)')
      .in('extras_id', extraseIds)
      .order('data_tranzactie', { ascending: false })
    : { data: [] }

  // Build furnizori map: key = normalized name
  interface FurnizorEntry {
    name: string
    totalDebit: number
    totalCredit: number
    txCount: number
    docCount: number
    luni: Set<string>
    tranzactii: any[]
    documente: any[]
  }

  const map = new Map<string, FurnizorEntry>()

  function normalize(s: string) { return s.trim().toLowerCase().replace(/\s+/g, ' ') }

  function getOrCreate(name: string): FurnizorEntry {
    const key = normalize(name)
    if (!map.has(key)) map.set(key, { name, totalDebit: 0, totalCredit: 0, txCount: 0, docCount: 0, luni: new Set(), tranzactii: [], documente: [] })
    return map.get(key)!
  }

  // Add tranzactii
  for (const tx of (txData || [])) {
    const furnizorName = (tx as any).documente?.furnizor || (tx as any).descriere_curatata || (tx as any).descriere
    if (!furnizorName) continue
    const entry = getOrCreate(furnizorName)
    entry.txCount++
    const suma = Number((tx as any).suma) || 0
    if ((tx as any).tip === 'debit') entry.totalDebit += suma
    else entry.totalCredit += suma
    const lunaId = extraseToLuna[(tx as any).extras_id]
    if (lunaId && lunaMap[lunaId]) entry.luni.add(lunaMap[lunaId])
    entry.tranzactii.push({
      id: (tx as any).id,
      tip: (tx as any).tip,
      suma: (tx as any).suma,
      valuta: (tx as any).valuta,
      data: (tx as any).data_tranzactie,
      descriere: (tx as any).descriere_curatata || (tx as any).descriere,
      categorie: (tx as any).categorie,
      document_id: (tx as any).document_id,
      luna: lunaId ? lunaMap[lunaId] : null,
    })
  }

  // Add documente (non-tranzactie ones, like eMAG, chitante)
  for (const doc of (docsData || [])) {
    const name = String((doc as any).furnizor || '').trim()
    if (!name) continue
    // Skip eMAG Dante metadata (furnizor is long string with pipe separators)
    if (name.includes(' | ')) continue
    const entry = getOrCreate(name)
    entry.docCount++
    const luna = lunaMap[(doc as any).luna_id] || null
    if (luna) entry.luni.add(luna)
    entry.documente.push({
      id: (doc as any).id,
      fisier_nume: (doc as any).fisier_nume,
      tip_document: (doc as any).tip_document,
      numar_document: (doc as any).numar_document,
      luna,
      created_at: (doc as any).created_at,
    })
  }

  const result = Array.from(map.values())
    .filter(f => f.txCount > 0 || f.docCount > 0)
    .map(f => ({
      name: f.name,
      totalDebit: f.totalDebit,
      totalCredit: f.totalCredit,
      txCount: f.txCount,
      docCount: f.docCount,
      luni: Array.from(f.luni).sort().reverse(),
      tranzactii: f.tranzactii.slice(0, 50),
      documente: f.documente.slice(0, 20),
    }))
    .sort((a, b) => (b.totalDebit + b.totalCredit) - (a.totalDebit + a.totalCredit))

  return NextResponse.json(result)
}
