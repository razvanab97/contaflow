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
  return 'altele'
}

function sectionLabel(section: string): string {
  return MODULE_DEFS[section as keyof typeof MODULE_DEFS]?.label || section
}

export async function POST(req: NextRequest) {
  const { firmaId, firmaNume, firmaSlug, lunaId, luna } = await req.json()
  const sb = getServiceSupabase()
  const zip = new JSZip()
  const root = zip.folder(`${firmaNume} - ${luna}`)!

  const moduleOrder = firmaSlug ? (FIRMA_CONFIGS[firmaSlug]?.module || []) : []

  // Extrase bancare
  const { data: extrase } = await sb.from('extrase').select('*').eq('luna_id', lunaId)
  const extraseFiles: { name: string; data: Blob }[] = []
  for (const e of extrase || []) {
    if (!e.pdf_path) continue
    const { data: b } = await sb.storage.from('extrase-pdf').download(e.pdf_path)
    if (b) extraseFiles.push({ name: e.pdf_nume || `extras_${e.valuta}.pdf`, data: b })
  }

  // Documente
  const { data: docs } = await sb.from('documente')
    .select('fisier_path,fisier_nume,fisier_tip,created_at')
    .eq('luna_id', lunaId)
    .eq('in_zip', true)
    .order('created_at', { ascending: true })

  type Entry = { name: string; data: Blob }
  const sectionMap = new Map<string, Entry[]>()

  // Extras de cont
  if (extraseFiles.length) sectionMap.set('extras', extraseFiles)

  // Celelalte documente
  for (const doc of docs || []) {
    const section = pathToSection(doc.fisier_path)
    const { data: b } = await sb.storage.from('documente').download(doc.fisier_path)
    if (!b) continue
    if (!sectionMap.has(section)) sectionMap.set(section, [])
    sectionMap.get(section)!.push({ name: doc.fisier_nume, data: b })
  }

  // Ordinea secțiunilor după modulele firmei
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

  // CSV tranzacții (util pentru reconciliere)
  const ids = (extrase || []).map(e => e.id)
  if (ids.length) {
    const { data: txs } = await sb.from('tranzactii')
      .select('*, documente(tip_document,furnizor,numar_document)')
      .in('extras_id', ids)
      .order('data_tranzactie')
    if (txs?.length) {
      const csv = ['Data,Descriere,Tip,Suma,Valuta,Categorie,Document',
        ...txs.map(t => {
          const d = Array.isArray(t.documente) ? t.documente[0] : t.documente
          return [t.data_tranzactie, `"${t.descriere_curatata || t.descriere}"`, t.tip, t.suma, t.valuta, t.categorie || '', d?.tip_document || 'LIPSA'].join(',')
        })
      ].join('\n')
      root.file('tranzactii.csv', csv)
    }
  }

  const buf = await zip.generateAsync({ type: 'arraybuffer' })
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${firmaNume}_${luna}.zip"`,
    },
  })
}
