import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { getFirmaModules } from '@/lib/firma-config'
import { generateMonthlyRecommendations, type MonthlySummary } from '@/lib/ai/monthlyReview'

function sectionFromPath(path: string): string {
  const p = String(path || '')
  if (p.includes('/dispozitii-plata/')) return 'Dispoziție de plată'
  if (p.includes('/facturi-chitanta/')) return 'Facturi + chitanță'
  if (p.includes('/facturi-restante/')) return 'Facturi restante'
  if (p.includes('/booking-facturi/')) return 'Booking · Facturi'
  if (p.includes('/booking-borderou/')) return 'Booking · Borderou'
  if (p.includes('/airbnb-facturi/')) return 'Airbnb · Facturi'
  if (p.includes('/airbnb-borderou/')) return 'Airbnb · Borderou'
  if (p.includes('/5stardesk/')) return '5StarDesk'
  if (p.includes('/trendyol/')) return 'Trendyol'
  if (p.includes('/emag-calcul/') || p.includes('/emag-avize/') || p.includes('/emag-facturi/')) return 'eMAG Facturi'
  if (p.includes('/acte-contabile/')) return 'Acte contabile'
  if (p.includes('/angajati/')) return 'Documente angajați'
  if (p.includes('/tx/') || p.includes('/extras/')) return 'Extras de cont'
  return 'Altele'
}

async function buildSummary(sb: ReturnType<typeof getServiceSupabase>, firmaId: string, firmaSlug: string, firmaNume: string, lunaId: string, lunaLabel: string): Promise<MonthlySummary> {
  const [{ data: taskStariRaw }, { data: moduleStariRaw }, { data: docsRaw }, { data: extraseRaw }, { count: restanteCount }] = await Promise.all([
    sb.from('task_stari').select('task_key,completat').eq('luna_id', lunaId),
    sb.from('module_stari').select('modul_slug,dezactivat').eq('luna_id', lunaId),
    sb.from('documente').select('fisier_path').eq('firma_id', firmaId).eq('luna_id', lunaId),
    sb.from('extrase').select('id').eq('luna_id', lunaId),
    sb.from('documente').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId).eq('platit', false).like('fisier_path', '%/facturi-restante/%'),
  ])

  const taskMap: Record<string, boolean> = {}
  for (const t of taskStariRaw || []) taskMap[t.task_key] = t.completat

  const dezactivate = new Set((moduleStariRaw || []).filter((m: any) => m.dezactivat).map((m: any) => m.modul_slug))

  const module: MonthlySummary['module'] = getFirmaModules(firmaSlug).map(m => ({
    slug: m.slug,
    label: m.label,
    done: m.tasks.filter(t => taskMap[t.key]).length,
    total: m.tasks.length,
    dezactivat: dezactivate.has(m.slug),
  }))

  const documentePeSectiune: Record<string, number> = {}
  for (const d of docsRaw || []) {
    const sec = sectionFromPath((d as any).fisier_path)
    documentePeSectiune[sec] = (documentePeSectiune[sec] || 0) + 1
  }

  const extrasIds = (extraseRaw || []).map((e: any) => e.id)
  let extras: MonthlySummary['extras'] = null
  if (extrasIds.length) {
    const { data: txRaw } = await sb.from('tranzactii').select('note,status_note,document_id').in('extras_id', extrasIds)
    const txs = txRaw || []
    extras = {
      totalTranzactii: txs.length,
      cuNota: txs.filter((t: any) => t.status_note).length,
      nedocumentate: txs.filter((t: any) => !t.document_id && t.note !== 'na').length,
    }
  }

  return { firmaNume, lunaLabel, module, extras, documentePeSectiune, restanteCount: restanteCount || 0 }
}

export async function GET(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!lunaId) return NextResponse.json({ error: 'lunaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb.from('recomandari_luna').select('id,continut,creat_la').eq('luna_id', lunaId).order('creat_la', { ascending: false }).limit(1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ recomandare: data?.[0] || null })
}

export async function POST(req: NextRequest) {
  try {
    const { lunaId, firmaId, firmaSlug, firmaNume, lunaLabel } = await req.json()
    if (!lunaId || !firmaId || !firmaSlug) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })

    const sb = getServiceSupabase()
    const summary = await buildSummary(sb, firmaId, firmaSlug, firmaNume, lunaId, lunaLabel)
    const continut = await generateMonthlyRecommendations(summary)

    const { data, error } = await sb.from('recomandari_luna').insert({ luna_id: lunaId, continut, rezumat_date: summary }).select('id,continut,creat_la').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ recomandare: data })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
