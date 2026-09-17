import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import { getServiceSupabase } from '@/lib/supabase/server'
import { FIRMA_CONFIGS, MODULE_DEFS, type ModuleSlug } from '@/lib/firma-config'
import { generateNotePdfBytes } from '@/lib/notePdf'

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
  if (p.includes('/inbox-facturi/')) return 'inbox-facturi'
  if (p.includes('/booking-facturi/')) return 'booking-facturi'
  if (p.includes('/booking-borderou/')) return 'booking-borderou'
  if (p.includes('/airbnb-facturi/')) return 'airbnb-facturi'
  if (p.includes('/airbnb-borderou/')) return 'airbnb-borderou'
  if (p.includes('/5stardesk/')) return '5stardesk'
  if (p.includes('/trendyol/')) return 'trendyol'
  if (p.includes('/emag-calcul/') || p.includes('/emag-avize/') || p.includes('/emag-facturi/')) return 'emag'
  if (p.includes('/acte-contabile/')) return 'acte-contabile'
  if (p.includes('/angajati/')) return 'angajati'
  if (p.includes('/tx/') || p.includes('/extras/')) return 'extras'
  return 'altele'
}

// Verificare directă path → secțiune (gestionează slug-uri diferite față de path, ex. 'emag' vs 'emag-calcul')
function matchesSection(filePath: string, section: string): boolean {
  const p = String(filePath)
  if (section === 'dispozitie-plata') return p.includes('/dispozitii-plata/')
  if (section === 'emag' || section === 'emag-calcul') return p.includes('/emag-calcul/') || p.includes('/emag-avize/') || p.includes('/emag-facturi/')
  return p.includes(`/${section}/`)
}

// Grupeaza avizele eMAG cu facturile lor proprii (dupa furnizor = task_key), in ordinea din MODULE_DEFS;
// avizul apare inaintea facturilor sale; facturile Dante (emag-calcul) raman la final, cronologic
function sortEmagDocs<T extends { fisier_path:string; furnizor?:string|null; created_at?:string }>(items: T[]): T[] {
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

// Documentele atașate individual pe tranzacții (facturi/chitanțe din extras), ordonate după data tranzacției
async function getExtrasTxDocs(sb: ReturnType<typeof getServiceSupabase>, lunaId: string) {
  const { data: txDocs } = await sb.from('documente')
    .select('fisier_path,fisier_nume,fisier_tip,tranzactie_id')
    .eq('luna_id', lunaId)
    .eq('modul', 'extras')
    .not('tranzactie_id', 'is', null)
  if (!txDocs?.length) return []
  const txIds = [...new Set(txDocs.map(d => d.tranzactie_id).filter(Boolean))]
  const { data: txs } = await sb.from('tranzactii').select('id,extras_id,data_tranzactie').in('id', txIds)
  const txById = new Map((txs || []).map(t => [t.id, t]))
  return txDocs.map(doc => {
    const tx = txById.get(doc.tranzactie_id)
    return { ...doc, extras_id: tx?.extras_id || null, data_tranzactie: tx?.data_tranzactie || '' }
  }).sort((a, b) => {
    const ea = a.extras_id || ''
    const eb = b.extras_id || ''
    if (ea !== eb) return ea.localeCompare(eb)
    const da = a.data_tranzactie || ''
    const db = b.data_tranzactie || ''
    if (da !== db) return da.localeCompare(db)
    return String(a.fisier_nume || '').localeCompare(String(b.fisier_nume || ''))
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
  const { lunaId, title, scope, firmaSlug, firmaNume, lunaLabel, itemIds = [] } = await req.json()
  if (!lunaId) return NextResponse.json({ error: 'Luna contabilă lipsește' }, { status: 400 })
  const sb = getServiceSupabase()

  // Categoria extras e stocată în tabelul extrase, nu în documente
  const isExtras = scope?.extras || scope?.section === 'extras'

  // Documente din categorii (fără filtru in_zip — include doc-uri istorice + noi).
  // Exclus explicit tranzactie_id not null: acelea sunt deja incluse separat, prin getExtrasTxDocs()
  // (ex. un document Inbox Facturi asociat cu o tranzactie isi schimba modul in 'extras', dar
  // fisier_path ramane neschimbat sub /inbox-facturi/ - fara acest filtru ar aparea de doua ori
  // in exportul complet, o data la 'extras' si o data la 'inbox-facturi').
  const { data: allDocs, error } = isExtras
    ? { data: [], error: null }
    : await sb.from('documente')
        .select('fisier_path,fisier_nume,fisier_tip,created_at,furnizor,data_document')
        .eq('luna_id', lunaId)
        .is('tranzactie_id', null)
        .not('fisier_path', 'like', '%/tx/%')
        .not('fisier_path', 'like', '%/checklist/%')
        .not('fisier_path', 'like', '%/config/%')
        .not('fisier_path', 'like', '%/dispozitii-plata/resetari/%')
        .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Filtrare pe secțiune în cod — matchesSection gestionează toate alias-urile de slug
  const docs = (scope?.section && !isExtras)
    ? (allDocs || []).filter(d => matchesSection(String(d.fisier_path), scope.section))
    : allDocs

  // Extras bancare: la export complet, la scope.extras, sau când secțiunea e 'extras'
  const includeExtras = !scope || scope.extras || scope?.section === 'extras'
  const { data: statements } = includeExtras
    ? await sb.from('extrase').select('id,pdf_path,pdf_nume').eq('luna_id', lunaId)
    : { data: [] }
  const extrasTxDocs = includeExtras ? await getExtrasTxDocs(sb, lunaId) : []

  if (!docs?.length && !statements?.length && !extrasTxDocs.length)
    return NextResponse.json({ error: 'Nu există documente în această categorie' }, { status: 404 })

  const merged = await PDFDocument.create()
  const coverFont = await merged.embedFont(StandardFonts.HelveticaBold)

  // PDF complet (fără scope) — grupare pe secțiuni în ordinea modulelor, pagină cu numele categoriei înainte de fiecare
  if (!scope && firmaSlug) {
    const moduleOrder = FIRMA_CONFIGS[firmaSlug]?.module || []

    type Entry = { path: string; name: string; type: string; bucket: 'documente' | 'extrase-pdf'; furnizor?: string|null; created_at?: string; data_document?: string|null }
    const sectionMap = new Map<string, Entry[]>()
    // Ordinea reala a evenimentului (data de pe document), nu data la care a fost incarcat in
    // sistem - un import in lot (multe facturi vechi adaugate intr-o singura sedinta) ar avea
    // altfel created_at aproape identic pentru toate, deci ordinea ar fi practic intamplatoare
    // in loc de cronologica. Foloseste created_at doar cand documentul chiar nu are data proprie.
    function dataReferintaEntry(e: Entry): string {
      return e.data_document || e.created_at || ''
    }

    // Extras bancare
    const txDocsByExtras = new Map<string, typeof extrasTxDocs>()
    const txDocsWithoutStatement: typeof extrasTxDocs = []
    for (const doc of extrasTxDocs) {
      if (!doc.extras_id) { txDocsWithoutStatement.push(doc); continue }
      if (!txDocsByExtras.has(doc.extras_id)) txDocsByExtras.set(doc.extras_id, [])
      txDocsByExtras.get(doc.extras_id)!.push(doc)
    }
    for (const s of statements || []) {
      if (!s.pdf_path) continue
      if (!sectionMap.has('extras')) sectionMap.set('extras', [])
      sectionMap.get('extras')!.push({ path: s.pdf_path, name: s.pdf_nume || 'extras.pdf', type: 'application/pdf', bucket: 'extrase-pdf' })
      for (const doc of txDocsByExtras.get(s.id) || []) {
        sectionMap.get('extras')!.push({ path: doc.fisier_path, name: doc.fisier_nume, type: doc.fisier_tip, bucket: 'documente' })
      }
    }
    // Documente atașate pe tranzacții fără extras brut disponibil (fallback rar)
    const attachedToKnownStatements = new Set((statements || []).map(s => s.id))
    for (const [extrasId, groupedDocs] of txDocsByExtras) {
      if (attachedToKnownStatements.has(extrasId)) continue
      if (!sectionMap.has('extras')) sectionMap.set('extras', [])
      for (const doc of groupedDocs)
        sectionMap.get('extras')!.push({ path: doc.fisier_path, name: doc.fisier_nume, type: doc.fisier_tip, bucket: 'documente' })
    }
    if (txDocsWithoutStatement.length) {
      if (!sectionMap.has('extras')) sectionMap.set('extras', [])
      for (const doc of txDocsWithoutStatement)
        sectionMap.get('extras')!.push({ path: doc.fisier_path, name: doc.fisier_nume, type: doc.fisier_tip, bucket: 'documente' })
    }
    // Documente din categorii
    for (const doc of docs || []) {
      const section = pathToSection(doc.fisier_path)
      if (!sectionMap.has(section)) sectionMap.set(section, [])
      sectionMap.get(section)!.push({ path: doc.fisier_path, name: doc.fisier_nume, type: doc.fisier_tip, bucket: 'documente', furnizor: doc.furnizor, created_at: doc.created_at, data_document: doc.data_document })
    }
    // Emag: avizele impreuna cu facturile lor proprii, in ordinea din task-uri
    if (sectionMap.has('emag')) {
      sectionMap.set('emag', sortEmagDocs(sectionMap.get('emag')!.map(e => ({ ...e, fisier_path: e.path }))))
    }
    // Restul sectiunilor (mai putin extras, care isi are deja ordinea cronologica proprie mai sus,
    // si emag, sortat separat chiar deasupra) - ordonate dupa data reala a documentului.
    for (const [section, entries] of sectionMap) {
      if (section === 'extras' || section === 'emag') continue
      entries.sort((a, b) => dataReferintaEntry(a).localeCompare(dataReferintaEntry(b)))
    }

    // Ordinea secțiunilor după modulele firmei
    const ordered: string[] = []
    for (const mod of moduleOrder) {
      if (sectionMap.has(mod)) ordered.push(mod)
    }
    // Booking · Borderou nu mai e o pagină/modul propriu-zis (a fost unit cu Booking · Facturi),
    // deci nu mai apare în lista de module a firmei — îl punem totuși lângă facturile lui, nu la coadă.
    if (sectionMap.has('booking-borderou') && !ordered.includes('booking-borderou')) {
      const i = ordered.indexOf('booking-facturi')
      ordered.splice(i >= 0 ? i + 1 : ordered.length, 0, 'booking-borderou')
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
      // Notele de pe tranzacții (tab-ul Note din Extras) - o pagină separată, imediat după extras,
      // ca să ajungă și ea la contabilitate o dată cu restul documentelor, nu doar vizibilă în aplicație.
      if (section === 'extras' && firmaNume && lunaLabel) {
        const noteBytes = await generateNotePdfBytes(lunaId, firmaNume, lunaLabel)
        if (noteBytes) {
          addSectionCover(merged, coverFont, 'Note tranzacții')
          await embedDoc(merged, Buffer.from(noteBytes), 'application/pdf', 'note_tranzactii.pdf')
        }
      }
    }
  } else {
    // PDF per-secțiune (sau fără firmaSlug): pagină cu numele categoriei, apoi extras + documente secțiunii
    const label = scope?.section ? sectionLabel(scope.section) : isExtras ? sectionLabel('extras') : 'Documente'
    addSectionCover(merged, coverFont, label)
    const txDocsByExtras = new Map<string, typeof extrasTxDocs>()
    const txDocsWithoutStatement: typeof extrasTxDocs = []
    for (const doc of extrasTxDocs) {
      if (!doc.extras_id) { txDocsWithoutStatement.push(doc); continue }
      if (!txDocsByExtras.has(doc.extras_id)) txDocsByExtras.set(doc.extras_id, [])
      txDocsByExtras.get(doc.extras_id)!.push(doc)
    }
    for (const s of statements || []) {
      if (!s.pdf_path) continue
      const { data } = await sb.storage.from('extrase-pdf').download(s.pdf_path)
      if (data) await embedDoc(merged, Buffer.from(await data.arrayBuffer()), 'application/pdf', s.pdf_nume || 'extras.pdf')
      for (const doc of txDocsByExtras.get(s.id) || []) {
        const { data: docBytes } = await sb.storage.from('documente').download(doc.fisier_path)
        if (!docBytes) continue
        await embedDoc(merged, Buffer.from(await docBytes.arrayBuffer()), doc.fisier_tip, doc.fisier_nume)
      }
    }
    const attachedToKnownStatements = new Set((statements || []).map(s => s.id))
    const remainingExtrasDocs = [
      ...[...txDocsByExtras.entries()].filter(([extrasId]) => !attachedToKnownStatements.has(extrasId)).flatMap(([, value]) => value),
      ...txDocsWithoutStatement,
    ]
    for (const doc of remainingExtrasDocs) {
      const { data } = await sb.storage.from('documente').download(doc.fisier_path)
      if (!data) continue
      await embedDoc(merged, Buffer.from(await data.arrayBuffer()), doc.fisier_tip, doc.fisier_nume)
    }
    const orderedDocs = (scope?.section === 'emag' || scope?.section === 'emag-calcul')
      ? sortEmagDocs(docs || [])
      : (docs || []).slice().sort((a, b) => String(a.data_document || a.created_at || '').localeCompare(String(b.data_document || b.created_at || '')))
    for (const doc of orderedDocs) {
      const { data } = await sb.storage.from('documente').download(doc.fisier_path)
      if (!data) continue
      await embedDoc(merged, Buffer.from(await data.arrayBuffer()), doc.fisier_tip, doc.fisier_nume)
    }
    if (isExtras && firmaNume && lunaLabel) {
      const noteBytes = await generateNotePdfBytes(lunaId, firmaNume, lunaLabel)
      if (noteBytes) {
        addSectionCover(merged, coverFont, 'Note tranzacții')
        await embedDoc(merged, Buffer.from(noteBytes), 'application/pdf', 'note_tranzactii.pdf')
      }
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
