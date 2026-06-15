import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { getServiceSupabase } from '@/lib/supabase/server'
import { FIRMA_CONFIGS } from '@/lib/firma-config'

function safeName(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'documente'
}

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

async function embedDoc(merged: PDFDocument, bytes: Buffer, type: string, name: string) {
  try {
    if (type === 'application/pdf' || name?.toLowerCase().endsWith('.pdf')) {
      const source = await PDFDocument.load(bytes)
      const pages = await merged.copyPages(source, source.getPageIndices())
      pages.forEach(page => merged.addPage(page))
    } else if (type?.startsWith('image/')) {
      const image = type === 'image/png' ? await merged.embedPng(bytes) : await merged.embedJpg(bytes)
      const page = merged.addPage()
      const scale = Math.min(page.getWidth() / image.width, page.getHeight() / image.height, 1)
      page.drawImage(image, {
        x: (page.getWidth() - image.width * scale) / 2,
        y: (page.getHeight() - image.height * scale) / 2,
        width: image.width * scale,
        height: image.height * scale,
      })
    }
  } catch {}
}

export async function POST(req: NextRequest) {
  const { lunaId, title, scope, firmaSlug, itemIds = [] } = await req.json()
  if (!lunaId) return NextResponse.json({ error: 'Luna contabilă lipsește' }, { status: 400 })
  const sb = getServiceSupabase()

  // Categoria extras e stocată în tabelul extrase, nu în documente
  const isExtras = scope?.extras || scope?.section === 'extras'

  // Documente din categorii (fără filtru in_zip — include doc-uri istorice + noi)
  const { data: allDocs, error } = isExtras
    ? { data: [], error: null }
    : await sb.from('documente')
        .select('fisier_path,fisier_nume,fisier_tip,created_at')
        .eq('luna_id', lunaId)
        .not('fisier_path', 'like', '%/tx/%')
        .not('fisier_path', 'like', '%/checklist/%')
        .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Filtrare pe secțiune în cod (suportă 'dispozitie-plata' → '/dispozitii-plata/')
  const docs = (scope?.section && !isExtras)
    ? (allDocs || []).filter(d => pathToSection(String(d.fisier_path)) === scope.section)
    : allDocs

  // Extras bancare: la export complet, la scope.extras, sau când secțiunea e 'extras'
  const includeExtras = !scope || scope.extras || scope?.section === 'extras'
  const { data: statements } = includeExtras
    ? await sb.from('extrase').select('pdf_path,pdf_nume').eq('luna_id', lunaId)
    : { data: [] }

  if (!docs?.length && !statements?.length)
    return NextResponse.json({ error: 'Nu există documente în această categorie' }, { status: 404 })

  const merged = await PDFDocument.create()

  // PDF complet (fără scope) — grupare pe secțiuni în ordinea modulelor, pagină albă între categorii
  if (!scope && firmaSlug) {
    const moduleOrder = FIRMA_CONFIGS[firmaSlug]?.module || []

    type Entry = { path: string; name: string; type: string; bucket: 'documente' | 'extrase-pdf' }
    const sectionMap = new Map<string, Entry[]>()

    // Extras bancare
    for (const s of statements || []) {
      if (!s.pdf_path) continue
      if (!sectionMap.has('extras')) sectionMap.set('extras', [])
      sectionMap.get('extras')!.push({ path: s.pdf_path, name: s.pdf_nume || 'extras.pdf', type: 'application/pdf', bucket: 'extrase-pdf' })
    }
    // Documente din categorii
    for (const doc of docs || []) {
      const section = pathToSection(doc.fisier_path)
      if (!sectionMap.has(section)) sectionMap.set(section, [])
      sectionMap.get(section)!.push({ path: doc.fisier_path, name: doc.fisier_nume, type: doc.fisier_tip, bucket: 'documente' })
    }

    // Ordinea secțiunilor după modulele firmei
    const ordered: string[] = []
    for (const mod of moduleOrder) {
      if (sectionMap.has(mod)) ordered.push(mod)
    }
    for (const sec of sectionMap.keys()) {
      if (!ordered.includes(sec)) ordered.push(sec)
    }

    const nonEmpty = ordered.filter(s => (sectionMap.get(s) || []).length > 0)
    for (let i = 0; i < nonEmpty.length; i++) {
      if (i > 0) merged.addPage([595, 842]) // pagină albă separator
      for (const entry of sectionMap.get(nonEmpty[i]) || []) {
        const { data } = await sb.storage.from(entry.bucket).download(entry.path)
        if (!data) continue
        await embedDoc(merged, Buffer.from(await data.arrayBuffer()), entry.type, entry.name)
      }
    }
  } else {
    // PDF per-secțiune (sau fără firmaSlug): extras + documente secțiunii
    for (const s of statements || []) {
      if (!s.pdf_path) continue
      const { data } = await sb.storage.from('extrase-pdf').download(s.pdf_path)
      if (!data) continue
      await embedDoc(merged, Buffer.from(await data.arrayBuffer()), 'application/pdf', s.pdf_nume || 'extras.pdf')
    }
    for (const doc of docs || []) {
      const { data } = await sb.storage.from('documente').download(doc.fisier_path)
      if (!data) continue
      await embedDoc(merged, Buffer.from(await data.arrayBuffer()), doc.fisier_tip, doc.fisier_nume)
    }
  }

  if (!merged.getPageCount())
    return NextResponse.json({ error: 'Documentele nu au putut fi convertite în PDF (format nesuportat)' }, { status: 422 })
  const bytes = await merged.save()
  const fileName = `${safeName(title || 'documente_generale')}.pdf`
  return new NextResponse(Buffer.from(bytes), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fileName}"` },
  })
}
