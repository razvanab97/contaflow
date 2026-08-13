import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { FIRMA_CONFIGS, MODULE_DEFS } from '@/lib/firma-config'
import JSZip from 'jszip'

export const maxDuration = 120

function pathToSection(path: string): string {
  const p = String(path)
  if (p.includes('/dispozitii-plata/')) return 'dispozitie-plata'
  if (p.includes('/facturi-chitanta/')) return 'facturi-chitanta'
  if (p.includes('/facturi-restante/')) return 'facturi-restante'
  if (p.includes('/booking-facturi/')) return 'booking-facturi'
  if (p.includes('/booking-borderou/')) return 'booking-borderou'
  if (p.includes('/airbnb-facturi/')) return 'airbnb-facturi'
  if (p.includes('/airbnb-borderou/')) return 'airbnb-borderou'
  if (p.includes('/5stardesk/')) return '5stardesk'
  if (p.includes('/trendyol/')) return 'trendyol'
  if (p.includes('/emag-calcul/') || p.includes('/emag-avize/') || p.includes('/emag-facturi/')) return 'emag'
  if (p.includes('/acte-contabile/')) return 'acte-contabile'
  if (p.includes('/angajati/')) return 'angajati'
  if (p.includes('/extras/')) return 'extras'
  return 'altele'
}

function sectionLabel(section: string): string {
  const def = MODULE_DEFS[section as keyof typeof MODULE_DEFS]
  if (def) return def.label
  if (section === 'altele') return 'Alte documente'
  return section
}

// Grupeaza avizele eMAG cu facturile lor proprii (dupa furnizor = task_key), in ordinea din MODULE_DEFS;
// avizul apare inaintea facturilor sale; facturile Dante (emag-calcul) raman la final, cronologic
function sortEmagDocs<T extends { fisier_path: string; furnizor?: string | null; created_at?: string }>(items: T[]): T[] {
  const avizOrder = (MODULE_DEFS.emag?.tasks || []).filter(t => t.key.startsWith('emag.aviz_')).map(t => t.key)
  const avizeAndFacturi = items.filter(d => d.fisier_path.includes('/emag-avize/') || d.fisier_path.includes('/emag-facturi/'))
  const dante = items.filter(d => d.fisier_path.includes('/emag-calcul/'))

  const byTask = new Map<string, T[]>()
  for (const d of avizeAndFacturi) {
    const key = d.furnizor || ''
    if (!byTask.has(key)) byTask.set(key, [])
    byTask.get(key)!.push(d)
  }
  const orderedKeys = [...avizOrder, ...[...byTask.keys()].filter(k => !avizOrder.includes(k))]
  const ordered: T[] = []
  for (const key of orderedKeys) {
    const group = byTask.get(key) || []
    group.sort((a, b) => {
      const aAviz = a.fisier_path.includes('/emag-avize/')
      const bAviz = b.fisier_path.includes('/emag-avize/')
      if (aAviz === bAviz) return (a.created_at || '') < (b.created_at || '') ? -1 : 1
      return aAviz ? -1 : 1
    })
    ordered.push(...group)
  }
  dante.sort((a, b) => (a.created_at || '') < (b.created_at || '') ? -1 : 1)
  return [...ordered, ...dante]
}

// Documentele atașate individual pe tranzacții (facturi/chitanțe din extras), în exact ordinea din Extras (dată tranzacție)
async function getExtrasTxDocs(sb: ReturnType<typeof getServiceSupabase>, lunaId: string) {
  const { data: txDocs } = await sb.from('documente')
    .select('fisier_path,fisier_nume,fisier_tip,tranzactie_id')
    .eq('luna_id', lunaId)
    .eq('modul', 'extras')
    .not('tranzactie_id', 'is', null)
  if (!txDocs?.length) return []
  const txIds = [...new Set(txDocs.map(d => d.tranzactie_id).filter(Boolean))]
  const { data: txs } = await sb.from('tranzactii').select('id,data_tranzactie').in('id', txIds)
  const dateById = new Map((txs || []).map(t => [t.id, t.data_tranzactie]))
  return txDocs.slice().sort((a, b) => {
    const da = dateById.get(a.tranzactie_id) || ''
    const db = dateById.get(b.tranzactie_id) || ''
    return da < db ? -1 : da > db ? 1 : 0
  })
}

export async function POST(req: NextRequest) {
  try {
    const { firmaId, firmaNume, firmaSlug, lunaId, luna } = await req.json()
    if (!lunaId) return NextResponse.json({ error: 'Luna contabilă lipsește' }, { status: 400 })

    const sb = getServiceSupabase()
    const zip = new JSZip()
    const root = zip.folder(`${firmaNume} - ${luna}`)!

    const moduleOrder = firmaSlug ? (FIRMA_CONFIGS[firmaSlug]?.module || []) : []

    // Extrase bancare — PDF-uri din bucket extrase-pdf
    const { data: extrase } = await sb.from('extrase').select('id,valuta,pdf_path,pdf_nume').eq('luna_id', lunaId)
    const extraseFiles: { name: string; data: ArrayBuffer }[] = []
    for (const e of extrase || []) {
      if (!e.pdf_path) continue
      const { data: b } = await sb.storage.from('extrase-pdf').download(e.pdf_path)
      if (b) extraseFiles.push({ name: e.pdf_nume || `extras_${e.valuta}.pdf`, data: await b.arrayBuffer() })
    }

    // Documente atașate pe tranzacții (facturi/chitanțe din Extras), în exact ordinea din Extras
    const extrasTxDocs = await getExtrasTxDocs(sb, lunaId)

    // Documente din categorii — fără filtru in_zip (include doc-uri istorice + noi)
    const { data: docs } = await sb.from('documente')
      .select('fisier_path,fisier_nume,fisier_tip,created_at,furnizor')
      .eq('luna_id', lunaId)
      .not('fisier_path', 'like', '%/tx/%')
      .not('fisier_path', 'like', '%/checklist/%')
      .not('fisier_path', 'like', '%/config/%')
      .not('fisier_path', 'like', '%/dispozitii-plata/resetari/%')
      .order('created_at', { ascending: true })

    if (!extraseFiles.length && !extrasTxDocs.length && !docs?.length)
      return NextResponse.json({ error: 'Nu există documente de descărcat pentru această lună' }, { status: 404 })

    type Entry = { name: string; data?: ArrayBuffer; fisier_path: string; furnizor?: string | null; created_at?: string }
    const sectionMap = new Map<string, Entry[]>()

    if (extraseFiles.length) sectionMap.set('extras', extraseFiles.map(f => ({ ...f, fisier_path: '/extras/' })))

    // Documentele de pe tranzacții intră tot la secțiunea 'extras', după extrasul brut, în ordinea din Extras
    for (const doc of extrasTxDocs) {
      const { data: b } = await sb.storage.from('documente').download(doc.fisier_path)
      if (!b) continue
      if (!sectionMap.has('extras')) sectionMap.set('extras', [])
      sectionMap.get('extras')!.push({ name: doc.fisier_nume, data: await b.arrayBuffer(), fisier_path: doc.fisier_path })
    }

    for (const doc of docs || []) {
      const section = pathToSection(doc.fisier_path)
      const { data: b } = await sb.storage.from('documente').download(doc.fisier_path)
      if (!b) continue
      if (!sectionMap.has(section)) sectionMap.set(section, [])
      sectionMap.get(section)!.push({ name: doc.fisier_nume, data: await b.arrayBuffer(), fisier_path: doc.fisier_path, furnizor: doc.furnizor, created_at: doc.created_at })
    }

    // eMAG: avizele împreună cu facturile lor proprii, în ordinea din task-uri
    if (sectionMap.has('emag')) {
      sectionMap.set('emag', sortEmagDocs(sectionMap.get('emag')!))
    }

    // Ordinea secțiunilor după modulele firmei, necunoscutele la final
    const ordered: string[] = []
    for (const mod of moduleOrder) {
      if (sectionMap.has(mod)) ordered.push(mod)
    }
    for (const sec of sectionMap.keys()) {
      if (!ordered.includes(sec)) ordered.push(sec)
    }

    // Creează dosarele și adaugă fișierele — nume prefixate cu ordinea, ca sortarea alfabetică din
    // orice aplicație de dezarhivare (Finder/Explorer) să respecte ordinea reală, nu doar cea din arhivă
    for (const section of ordered) {
      const entries = sectionMap.get(section) || []
      if (!entries.length) continue
      const folder = root.folder(sectionLabel(section))!
      const pad = String(entries.length).length
      entries.forEach((entry, i) => {
        const fileName = entries.length > 1 ? `${String(i + 1).padStart(pad, '0')} - ${entry.name}` : entry.name
        folder.file(fileName, entry.data!)
      })
    }

    const buf = await zip.generateAsync({ type: 'arraybuffer' })
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${firmaNume}_${luna}.zip"`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
