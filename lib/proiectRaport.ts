import JSZip from 'jszip'
import { getServiceSupabase } from './supabase/server'
import { generateFromTemplate } from './docxRaportTemplate'
import { parseReportSections, REPORT_SECTIONS_KEY } from './documentWorkspace/reportSections'
import { workMonthLabel } from './accounting-period'

export const SECTIUNE = 'raport_lunar'
export const SECTIUNE_SABLON = 'raport_lunar_sablon'

// Luna despre care e raportul, din „Perioada de raportare” (ex. „01.08.2026 – 31.08.2026” -> August 2026).
export function lunaRaportata(perioada: string | null | undefined): { cheie: string; eticheta: string } | null {
  const m = String(perioada || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null
  const cheie = `${m[3]}-${String(Number(m[2])).padStart(2, '0')}`
  return { cheie, eticheta: workMonthLabel(cheie) }
}
export const numeRaportImplementare = (eticheta: string, ext = '.docx') => `Raport implementare ${eticheta}${ext}`

// Perioada de raportare scrisa in documentul Word (pentru rapoartele incarcate de mana).
export async function perioadaDinDocx(buffer: Buffer): Promise<string | null> {
  try {
    const xml = await (await JSZip.loadAsync(buffer)).file('word/document.xml')?.async('string')
    const text = (xml || '').replace(/<[^>]+>/g, '')
    return text.match(/Perioada de raportare:?\s*(\d{1,2}\.\d{1,2}\.\d{4})/i)?.[1] || null
  } catch { return null }
}

// Fiecare luna raportata se pastreaza ca document propriu al proiectului („Raport implementare <Luna> <An>”), in afara
// documentului curent (care se inlocuieste la fiecare generare): regenerarea aceleiasi luni o inlocuieste doar pe a ei.
// Sta in `documente` (modul „obligatii”, tip „raport”), deci intra si in exportul lunii; luna de lucru = luna raportata + 1.
export async function salveazaRaportLuna(sb: ReturnType<typeof getServiceSupabase>, firmaId: string, bytes: Buffer, nume: string, tip: string | null, cheieLuna: string) {
  const [an, luna] = cheieLuna.split('-').map(Number)
  const lucru = new Date(Date.UTC(an, luna, 1)).toISOString().slice(0, 10)
  const [{ data: lunaRow }, { data: existente }] = await Promise.all([
    sb.from('luni_contabile').select('id').eq('firma_id', firmaId).eq('luna', lucru).maybeSingle(),
    sb.from('documente').select('id,fisier_path').eq('firma_id', firmaId).eq('modul', 'obligatii').eq('tip_document', 'raport').eq('fisier_nume', nume).limit(1),
  ])
  const existent = existente?.[0]
  const path = `${firmaId}/proiect-documente/rapoarte/${Date.now()}_${nume.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_')}`
  const { error: upErr } = await sb.storage.from('documente').upload(path, bytes, { contentType: tip || undefined })
  if (upErr) throw new Error(upErr.message)
  const camp = { fisier_path: path, fisier_tip: tip, fisier_marime: bytes.length, luna_id: lunaRow?.id ?? null }
  const { error } = existent
    ? await sb.from('documente').update(camp).eq('id', existent.id)
    : await sb.from('documente').insert({ firma_id: firmaId, modul: 'obligatii', tip_document: 'raport', fisier_nume: nume, in_zip: true, ...camp })
  if (error) { await sb.storage.from('documente').remove([path]); throw new Error(error.message) }
  if (existent?.fisier_path) await sb.storage.from('documente').remove([existent.fisier_path])
}

const toLines = (s: string) => s.split('\n').map(l => l.trim()).filter(Boolean)

interface FixedFields { perioada: string; autorizatii: string; obiective: string; activitati: string }

/**
 * Regenereaza documentul vizibil (raport_lunar) din sablon + valorile curente ale campurilor
 * (fixe + personalizate) si il pune in locul celui vechi - folosit atat de generarea explicita
 * din formular, cat si automat dupa ce se adauga un camp nou prin selectie din previzualizare.
 */
export async function regenerateRaportLunar(sb: ReturnType<typeof getServiceSupabase>, firmaId: string, fixedOverride?: FixedFields) {
  const { data: sablon } = await sb.from('proiect_documente').select('*').eq('firma_id', firmaId).eq('sectiune', SECTIUNE_SABLON).maybeSingle()
  if (!sablon) throw new Error('Formularul nu e configurat încă')

  const [{ data: campuriRow }, { data: custom }] = await Promise.all([
    sb.from('proiect_raport_campuri').select('*').eq('firma_id', firmaId).eq('sectiune', SECTIUNE).maybeSingle(),
    sb.from('proiect_raport_campuri_custom').select('cheie,valoare').eq('firma_id', firmaId).eq('sectiune', SECTIUNE),
  ])

  const fixed: FixedFields | null = fixedOverride || campuriRow
  if (!fixed) throw new Error('Câmpurile nu sunt încă completate')

  const { data: sablonFile, error: dlErr } = await sb.storage.from('documente').download(sablon.fisier_path)
  if (dlErr || !sablonFile) throw new Error('Șablonul nu a putut fi descărcat')

  const buffer = Buffer.from(await sablonFile.arrayBuffer())
  const zip = await JSZip.loadAsync(buffer)
  const templateXml = await zip.file('word/document.xml')!.async('string')

  const finalXml = generateFromTemplate(templateXml, {
    perioada: fixed.perioada.trim(),
    autorizatii: toLines(fixed.autorizatii || ''),
    obiective: toLines(fixed.obiective || ''),
    activitati: toLines(fixed.activitati || ''),
    custom: Object.fromEntries((custom || []).filter(c => c.cheie !== REPORT_SECTIONS_KEY).map((c: { cheie: string; valoare: string }) => [c.cheie, c.valoare])),
    sections: parseReportSections(custom?.find(c => c.cheie === REPORT_SECTIONS_KEY)?.valoare || '[]'),
  })

  zip.file('word/document.xml', finalXml)
  const finalBuffer = await zip.generateAsync({ type: 'nodebuffer' })

  const { data: existing } = await sb.from('proiect_documente').select('fisier_path,fisier_nume,fisier_tip').eq('firma_id', firmaId).eq('sectiune', SECTIUNE).maybeSingle()
  // Numele spune luna raportata (din „Perioada de raportare”), nu mai pastreaza numele sablonului
  const lunaRap = lunaRaportata(fixed.perioada)
  const ext = sablon.fisier_nume.match(/\.[a-z0-9]+$/i)?.[0] || '.docx'
  const fisierNume = lunaRap ? numeRaportImplementare(lunaRap.eticheta, ext) : existing?.fisier_nume || sablon.fisier_nume
  const fisierTip = existing?.fisier_tip || sablon.fisier_tip
  const path = `${firmaId}/proiect-documente/${SECTIUNE}/${Date.now()}_${fisierNume}`

  const { error: upErr } = await sb.storage.from('documente').upload(path, finalBuffer, { contentType: fisierTip })
  if (upErr) throw new Error(upErr.message)

  const { data: newDoc, error } = await sb.from('proiect_documente').upsert({
    firma_id: firmaId, sectiune: SECTIUNE, fisier_nume: fisierNume, fisier_path: path,
    fisier_tip: fisierTip, fisier_marime: finalBuffer.length, updated_at: new Date().toISOString(),
  }, { onConflict: 'firma_id,sectiune' }).select('id,fisier_nume,fisier_tip,fisier_marime,updated_at').single()

  if (error) {
    await sb.storage.from('documente').remove([path])
    throw new Error(error.message)
  }
  if (existing?.fisier_path) await sb.storage.from('documente').remove([existing.fisier_path])

  if (lunaRap) await salveazaRaportLuna(sb, firmaId, finalBuffer, fisierNume, fisierTip, lunaRap.cheie).catch(e => console.error('Raportul lunii nu s-a putut păstra:', e))

  return newDoc
}
