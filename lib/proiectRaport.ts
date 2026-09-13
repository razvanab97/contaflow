import JSZip from 'jszip'
import { getServiceSupabase } from './supabase/server'
import { generateFromTemplate } from './docxRaportTemplate'

export const SECTIUNE = 'raport_lunar'
export const SECTIUNE_SABLON = 'raport_lunar_sablon'

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
    custom: Object.fromEntries((custom || []).map((c: { cheie: string; valoare: string }) => [c.cheie, c.valoare])),
  })

  zip.file('word/document.xml', finalXml)
  const finalBuffer = await zip.generateAsync({ type: 'nodebuffer' })

  const { data: existing } = await sb.from('proiect_documente').select('fisier_path,fisier_nume,fisier_tip').eq('firma_id', firmaId).eq('sectiune', SECTIUNE).maybeSingle()
  const fisierNume = existing?.fisier_nume || sablon.fisier_nume
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

  return newDoc
}
