import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

function emagMeta(doc: { furnizor?: string|null; fisier_path?: string|null }) {
  const src = String(doc.furnizor || '')
  const val = (label: string) => src.match(new RegExp(`${label}: ([^|]+)`))?.[1]?.trim() || ''
  const amount = Number(val('Suma')) || 0
  const effect = val('Efect') === 'reducere' ? 'reducere' : 'cheltuiala'
  const category = String(doc.fisier_path || '').split('/emag-calcul/')[1]?.split('/')[0] || 'altele'
  return { amount, effect, category }
}

export async function GET(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!lunaId) return NextResponse.json({ error: 'lunaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()

  const [{ data: extraseData }, { data: docsData }] = await Promise.all([
    sb.from('extrase').select('id').eq('luna_id', lunaId),
    sb.from('documente')
      .select('fisier_path,furnizor,modul')
      .eq('luna_id', lunaId)
      .eq('modul', 'acte_contabile'),
  ])

  const extraseIds = (extraseData || []).map((e: any) => e.id)

  const { data: txData } = extraseIds.length
    ? await sb.from('tranzactii').select('tip,suma,valuta,categorie').in('extras_id', extraseIds)
    : { data: [] }

  // Flux numerar: group by valuta → credit/debit → categorie
  type ByCat = Record<string, number>
  interface FluxSide { total: number; by_categorie: ByCat }
  const flux: Record<string, { incasari: FluxSide; cheltuieli: FluxSide; net: number }> = {}

  for (const tx of (txData || [])) {
    const v = String(tx.valuta || 'RON')
    const suma = Number(tx.suma) || 0
    const cat = String(tx.categorie || 'necategorizate')
    if (!flux[v]) flux[v] = { incasari: { total: 0, by_categorie: {} }, cheltuieli: { total: 0, by_categorie: {} }, net: 0 }
    if (tx.tip === 'credit') {
      flux[v].incasari.total += suma
      flux[v].incasari.by_categorie[cat] = (flux[v].incasari.by_categorie[cat] || 0) + suma
    } else {
      flux[v].cheltuieli.total += suma
      flux[v].cheltuieli.by_categorie[cat] = (flux[v].cheltuieli.by_categorie[cat] || 0) + suma
    }
  }
  for (const v of Object.keys(flux)) {
    flux[v].net = flux[v].incasari.total - flux[v].cheltuieli.total
  }

  // eMAG Dante reconciliation
  const emagDocs = (docsData || []).filter((d: any) => String(d.fisier_path).includes('/emag-calcul/'))
  let danteExpenses = 0, danteReductions = 0
  const danteCategories: Record<string, number> = {}
  for (const doc of emagDocs) {
    const { amount, effect, category } = emagMeta(doc)
    const signed = effect === 'reducere' ? -amount : amount
    danteCategories[category] = (danteCategories[category] || 0) + signed
    if (effect === 'reducere') danteReductions += amount
    else danteExpenses += amount
  }

  // Document counts by section
  const docCounts: Record<string, number> = {}
  const SECTIONS = ['facturi-chitanta', 'facturi-restante', 'trendyol', 'booking-facturi', 'booking-borderou', 'airbnb-facturi', 'airbnb-borderou', '5stardesk']
  for (const doc of (docsData || [])) {
    const path = String((doc as any).fisier_path || '')
    if (path.includes('/emag-calcul/')) { docCounts['emag'] = (docCounts['emag'] || 0) + 1; continue }
    for (const sec of SECTIONS) {
      if (path.includes(`/${sec}/`)) { docCounts[sec] = (docCounts[sec] || 0) + 1; break }
    }
  }

  return NextResponse.json({
    flux,
    emag: {
      danteExpenses,
      danteReductions,
      danteNetCost: danteExpenses - danteReductions,
      categories: danteCategories,
    },
    documente: docCounts,
  })
}
