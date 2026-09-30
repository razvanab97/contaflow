import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { accountingMonth, calculateMonthlyFlow, collectPaged, mergeTransactionsById, type MonthlyTransaction } from '@/lib/raport-lunar'

const TX_FIELDS = 'id,extras_id,data_tranzactie,tip,suma,valuta,categorie,descriere,descriere_curatata,referinta'

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
  if (!lunaId || !/^[a-f0-9-]{36}$/i.test(lunaId)) return NextResponse.json({ error: 'lunaId invalid' }, { status: 400 })

  const sb = getServiceSupabase()
  try {
    const { data: luna, error: lunaError } = await sb.from('luni_contabile').select('firma_id,luna').eq('id', lunaId).maybeSingle()
    if (lunaError) throw lunaError
    if (!luna) return NextResponse.json({ error: 'Luna nu există' }, { status: 404 })
    const period = accountingMonth(luna.luna)
    const [year, month] = period.split('-').map(Number)
    const periodStart = period + '-01'
    const nextPeriodStart = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
    const [extraseData, docsData] = await Promise.all([
      collectPaged(async (start, end) => {
        const { data, error } = await sb.from('extrase').select('id,valuta,nr_tranzactii').eq('luna_id', lunaId).eq('firma_id', luna.firma_id).order('id').range(start, end)
        return { data, error }
      }),
      collectPaged(async (start, end) => {
        const { data, error } = await sb.from('documente').select('id,fisier_path,furnizor,modul').eq('luna_id', lunaId).eq('firma_id', luna.firma_id).eq('modul', 'acte_contabile').order('id').range(start, end)
        return { data, error }
      }),
    ])
    const currencyByExtras = new Map(extraseData.map(e => [e.id, e.valuta]))
    const currentExtrasIds = new Set(extraseData.map(e => e.id))
    const txData: MonthlyTransaction[] = []
    for (let i = 0; i < extraseData.length; i += 50) {
      const ids = extraseData.slice(i, i + 50).map(e => e.id)
      const batch = await collectPaged(async (start, end) => {
        const { data, error } = await sb.from('tranzactii').select(TX_FIELDS).eq('firma_id', luna.firma_id).in('extras_id', ids).order('id').range(start, end)
        return { data, error }
      })
      txData.push(...batch.map(tx => ({ ...tx, valuta: tx.valuta || currencyByExtras.get(tx.extras_id) || null })))
    }
    // O operațiune a lunii poate fi într-un extras încărcat sub altă lună.
    const periodData = await collectPaged(async (start, end) => {
      const { data, error } = await sb.from('tranzactii').select(TX_FIELDS).eq('firma_id', luna.firma_id)
        .gte('data_tranzactie', periodStart).lt('data_tranzactie', nextPeriodStart).order('id').range(start, end)
      return { data, error }
    })
    const otherExtrasIds = [...new Set(periodData.map(tx => tx.extras_id).filter((id): id is string => !!id && !currencyByExtras.has(id)))]
    for (let i = 0; i < otherExtrasIds.length; i += 50) {
      const { data, error } = await sb.from('extrase').select('id,valuta').eq('firma_id', luna.firma_id).in('id', otherExtrasIds.slice(i, i + 50))
      if (error) throw error
      for (const item of data || []) currencyByExtras.set(item.id, item.valuta)
    }
    const allRows = mergeTransactionsById(txData, periodData).map(tx => ({
      ...tx, valuta: tx.valuta || (tx.extras_id ? currencyByExtras.get(tx.extras_id) : null) || null,
    }))
    const { flux, analiza, transactions, included, invalid, offPeriod } = calculateMonthlyFlow(allRows, period)
    const fromOtherExtras = periodData.filter(tx => !currentExtrasIds.has(tx.extras_id)).length

  // eMAG Dante reconciliation
  const emagDocs = docsData.filter(d => String(d.fisier_path).includes('/emag-calcul/'))
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
  for (const doc of docsData) {
    const path = String(doc.fisier_path || '')
    if (path.includes('/emag-calcul/')) { docCounts['emag'] = (docCounts['emag'] || 0) + 1; continue }
    for (const sec of SECTIONS) {
      if (path.includes(`/${sec}/`)) { docCounts[sec] = (docCounts[sec] || 0) + 1; break }
    }
  }

  return NextResponse.json({
    flux,
    analiza,
    tranzactii: transactions,
    control: {
      period,
      extrase: extraseData.length,
      tranzactii: txData.length,
      incluse: included,
      dinAlteExtrase: fromOtherExtras,
      asteptate: extraseData.reduce((sum, e) => sum + (Number(e.nr_tranzactii) || 0), 0),
      inAfaraLunii: offPeriod,
      invalide: invalid,
    },
    emag: {
      danteExpenses,
      danteReductions,
      danteNetCost: danteExpenses - danteReductions,
      categories: danteCategories,
    },
    documente: docCounts,
  })
  } catch (error) {
    return NextResponse.json({ error: 'Nu pot calcula raportul lunar: ' + (error instanceof Error ? error.message : 'eroare necunoscută') }, { status: 503 })
  }
}
