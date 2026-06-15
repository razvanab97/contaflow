import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { FIRMA_CONFIGS, MODULE_DEFS } from '@/lib/firma-config'
import JSZip from 'jszip'

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
  if (p.includes('/emag-calcul/')) return 'emag'
  if (p.includes('/acte-contabile/')) return 'acte-contabile'
  if (p.includes('/angajati/')) return 'angajati'
  if (p.includes('/extras/')) return 'extras'
  return 'altele'
}

function sectionLabel(section: string): string {
  return MODULE_DEFS[section as keyof typeof MODULE_DEFS]?.label || section
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
    const extraseFiles: { name: string; data: Blob }[] = []
    for (const e of extrase || []) {
      if (!e.pdf_path) continue
      const { data: b } = await sb.storage.from('extrase-pdf').download(e.pdf_path)
      if (b) extraseFiles.push({ name: e.pdf_nume || `extras_${e.valuta}.pdf`, data: b })
    }

    // Documente din categorii — fără filtru in_zip (include doc-uri istorice + noi)
    const { data: docs } = await sb.from('documente')
      .select('fisier_path,fisier_nume,fisier_tip,created_at')
      .eq('luna_id', lunaId)
      .not('fisier_path', 'like', '%/tx/%')
      .not('fisier_path', 'like', '%/checklist/%')
      .order('created_at', { ascending: true })

    if (!extraseFiles.length && !docs?.length)
      return NextResponse.json({ error: 'Nu există documente de descărcat pentru această lună' }, { status: 404 })

    type Entry = { name: string; data: Blob }
    const sectionMap = new Map<string, Entry[]>()

    if (extraseFiles.length) sectionMap.set('extras', extraseFiles)

    for (const doc of docs || []) {
      const section = pathToSection(doc.fisier_path)
      const { data: b } = await sb.storage.from('documente').download(doc.fisier_path)
      if (!b) continue
      if (!sectionMap.has(section)) sectionMap.set(section, [])
      sectionMap.get(section)!.push({ name: doc.fisier_nume, data: b })
    }

    // Ordinea secțiunilor după modulele firmei, necunoscutele la final
    const ordered: string[] = []
    for (const mod of moduleOrder) {
      if (sectionMap.has(mod)) ordered.push(mod)
    }
    for (const sec of sectionMap.keys()) {
      if (!ordered.includes(sec)) ordered.push(sec)
    }

    // Creează dosarele și adaugă fișierele
    for (const section of ordered) {
      const entries = sectionMap.get(section) || []
      if (!entries.length) continue
      const folder = root.folder(sectionLabel(section))!
      for (const entry of entries) {
        folder.file(entry.name, entry.data)
      }
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
