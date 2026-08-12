import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import { getServiceSupabase } from '@/lib/supabase/server'
import { FIRMA_CONFIGS, MODULE_DEFS, type ModuleSlug } from '@/lib/firma-config'

export const maxDuration = 120

function safeName(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'documente'
}

const DIACRITICS: Record<string, string> = {
  'ă':'a','â':'a','î':'i','ș':'s','ş':'s','ț':'t','ţ':'t',
  'Ă':'A','Â':'A','Î':'I','Ș':'S','Ş':'S','Ț':'T','Ţ':'T',
}
function safeText(value: string) {
  const withDiacritics = value.replace(/[ăâîșşțţĂÂÎȘŞȚŢ]/g, ch => DIACRITICS[ch] || ch)
  return withDiacritics.replace(/[^\x20-\x7E]/g, '')
}

function sectionLabel(section: string): string {
  const def = MODULE_DEFS[section as ModuleSlug]
  if (def) return def.label
  if (section === 'altele') return 'Alte documente'
  return section
}

// Pagină de separare cu numele categoriei, adăugată înainte de documentele fiecărei secțiuni
function addSectionCover(merged: PDFDocument, font: PDFFont, label: string) {
  const page = merged.addPage([595, 842])
  const text = safeText(label)
  const size = 22
  const textWidth = font.widthOfTextAtSize(text, size)
  page.drawText(text, { x: (595 - textWidth) / 2, y: 842 / 2, size, font, color: rgb(0.15, 0.15, 0.15) })
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
  if (p.includes('/extras/')) return 'extras'
  return 'altele'
}

// Verificare directă path → secțiune (gestionează slug-uri diferite față de path, ex. 'emag' vs 'emag-calcul')
function matchesSection(filePath: string, section: string): boolean {
  const p = String(filePath)
  if (section === 'dispozitie-plata') return p.includes('/dispozitii-plata/')
  if (section === 'emag' || section === 'emag-calcul') return p.includes('/emag-calcul/')
  return p.includes(`/${section}/`)
}

// Documentele atașate individual pe tranzacții (facturi/chitanțe din extras), ordonate după data tranzacției
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

async function embedDoc(merged: PDFDocument, bytes: Buffer, type: string, name: string) {
  try {
    if (type === 'application/pdf' || name?.toLowerCase().endsWith('.pdf')) {
      let source: PDFDocument
      try {
        source = await PDFDocument.load(bytes)
      } catch {
        // fallback pentru PDF-uri cu owner-protection
        source = await PDFDocument.load(bytes, { ignoreEncryption: true })
      }
      if (source.getPageCount() === 0) return
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

  // Filtrare pe secțiune în cod — matchesSection gestionează toate alias-urile de slug
  const docs = (scope?.section && !isExtras)
    ? (allDocs || []).filter(d => matchesSection(String(d.fisier_path), scope.section))
    : allDocs

  // Extras bancare: la export complet, la scope.extras, sau când secțiunea e 'extras'
  const includeExtras = !scope || scope.extras || scope?.section === 'extras'
  const { data: statements } = includeExtras
    ? await sb.from('extrase').select('pdf_path,pdf_nume').eq('luna_id', lunaId)
    : { data: [] }
  const extrasTxDocs = includeExtras ? await getExtrasTxDocs(sb, lunaId) : []

  if (!docs?.length && !statements?.length && !extrasTxDocs.length)
    return NextResponse.json({ error: 'Nu există documente în această categorie' }, { status: 404 })

  const merged = await PDFDocument.create()
  const coverFont = await merged.embedFont(StandardFonts.HelveticaBold)

  // PDF complet (fără scope) — grupare pe secțiuni în ordinea modulelor, pagină cu numele categoriei înainte de fiecare
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
    // Documente atașate pe tranzacții (facturi/chitanțe), în ordine cronologică, după extrasul brut
    if (extrasTxDocs.length) {
      if (!sectionMap.has('extras')) sectionMap.set('extras', [])
      for (const doc of extrasTxDocs)
        sectionMap.get('extras')!.push({ path: doc.fisier_path, name: doc.fisier_nume, type: doc.fisier_tip, bucket: 'documente' })
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
    for (const section of nonEmpty) {
      addSectionCover(merged, coverFont, sectionLabel(section))
      for (const entry of sectionMap.get(section) || []) {
        const { data } = await sb.storage.from(entry.bucket).download(entry.path)
        if (!data) continue
        await embedDoc(merged, Buffer.from(await data.arrayBuffer()), entry.type, entry.name)
      }
    }
  } else {
    // PDF per-secțiune (sau fără firmaSlug): pagină cu numele categoriei, apoi extras + documente secțiunii
    const label = scope?.section ? sectionLabel(scope.section) : isExtras ? sectionLabel('extras') : 'Documente'
    addSectionCover(merged, coverFont, label)
    for (const s of statements || []) {
      if (!s.pdf_path) continue
      const { data } = await sb.storage.from('extrase-pdf').download(s.pdf_path)
      if (!data) continue
      await embedDoc(merged, Buffer.from(await data.arrayBuffer()), 'application/pdf', s.pdf_nume || 'extras.pdf')
    }
    for (const doc of extrasTxDocs) {
      const { data } = await sb.storage.from('documente').download(doc.fisier_path)
      if (!data) continue
      await embedDoc(merged, Buffer.from(await data.arrayBuffer()), doc.fisier_tip, doc.fisier_nume)
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
