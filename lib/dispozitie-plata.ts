import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import { getServiceSupabase } from '@/lib/supabase/server'
import { finalizeazaDocument } from '@/lib/denumire-document'
import { workMonthLabel } from '@/lib/accounting-period'

type Sb = ReturnType<typeof getServiceSupabase>

// Dispozitia de plata: numerotarea pe luna si PDF-ul. Folosite la generare (api/chitante/dispozitie)
// si la mutarea unei dispozitii pe alta luna (api/chitante/dispozitie/muta), unde primeste numar nou.

export interface DateDispozitie {
  firmaNume?: string; cif?: string; nrRegCom?: string; adresa?: string
  date?: string; beneficiary?: string; function?: string; purpose?: string; identitySeries?: string; identityNumber?: string
}

const SMALL = ['zero','unu','doi','trei','patru','cinci','sase','sapte','opt','noua','zece','unsprezece','doisprezece','treisprezece','paisprezece','cincisprezece','saisprezece','saptesprezece','optsprezece','nouasprezece']
const TENS = ['','','douazeci','treizeci','patruzeci','cincizeci','saizeci','saptezeci','optzeci','nouazeci']

function underHundred(value: number) {
  if (value < 20) return SMALL[value]
  const tens = Math.floor(value / 10)
  const units = value % 10
  return TENS[tens] + (units ? ` si ${SMALL[units]}` : '')
}

function underThousand(value: number) {
  if (value < 100) return underHundred(value)
  const hundreds = Math.floor(value / 100)
  const rest = value % 100
  const prefix = hundreds === 1 ? 'o suta' : hundreds === 2 ? 'doua sute' : `${SMALL[hundreds]} sute`
  return prefix + (rest ? ` ${underHundred(rest)}` : '')
}

function amountInWords(amount: number) {
  const lei = Math.floor(amount)
  const bani = Math.round((amount - lei) * 100)
  const thousands = Math.floor(lei / 1000)
  const rest = lei % 1000
  const leiWords = [
    thousands ? `${thousands === 1 ? 'o mie' : `${underThousand(thousands)} mii`}` : '',
    rest ? underThousand(rest) : '',
  ].filter(Boolean).join(' ') || 'zero'
  return `${leiWords} lei si ${underHundred(bani)} bani`
}

// Fontul standard PDF (Helvetica) nu are diacritice, iar eliminarea lor brută trunchia
// cuvinte întregi (ex. "Bordeanu Dănuț" -> "Bordeanu Dnu"); le transliterăm în loc să le ștergem.
const DIACRITICS: Record<string, string> = {
  ă:'a', â:'a', î:'i', ș:'s', ş:'s', ț:'t', ţ:'t',
  Ă:'A', Â:'A', Î:'I', Ș:'S', Ş:'S', Ț:'T', Ţ:'T',
}
export function safe(value: unknown, fallback = '') {
  const str = String(value || fallback).replace(/[ăâîșşțţĂÂÎȘŞȚŢ]/g, ch => DIACRITICS[ch])
  return str.replace(/[^\x20-\x7E]/g, '')
}

export function readStoredHash(value: unknown) {
  return String(value || '').match(/\bHASH:([a-f0-9]{64})\b/i)?.[1] || ''
}

export async function getNextNumber(lunaId: string, sb: Sb = getServiceSupabase()) {
  const { data, error } = await sb
    .from('documente')
    .select('numar_document,fisier_path,created_at')
    .eq('luna_id', lunaId)
    .eq('modul', 'acte_contabile')
    .neq('tip_document', 'factura')
    .like('fisier_path', '%/dispozitii-plata/%')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  const lastReset = [...(data || [])].reverse().find(document => String(document.fisier_path).includes('/resetari/'))
  const relevant = lastReset ? (data || []).filter(document => document.created_at > lastReset.created_at) : (data || [])
  const maximum = relevant.reduce((max, document) => {
    if (String(document.fisier_path).includes('/resetari/')) return max
    const value = Number.parseInt(String(document.numar_document || ''), 10)
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  return String(maximum + 1).padStart(2, '0')
}

export async function construiestePdfDispozitie(body: DateDispozitie, amount: number, dispositionNumber: string) {
  function fmtDate(s: string) {
    const p = String(s || '').split('-')
    return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : (safe(s) || '__.__.____')
  }

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const black = rgb(0, 0, 0)

  const L = 50, R = 545, W = R - L
  const money = amount.toFixed(2).replace('.', ',')
  const dateStr = fmtDate(body.date || '')

  const t = (val: string, x: number, y: number, sz = 10, b = false) =>
    page.drawText(safe(val), { x, y, size: sz, font: b ? bold : font, color: black })
  const tw = (val: string, sz = 10, b = false) =>
    (b ? bold : font).widthOfTextAtSize(safe(val), sz)
  const hl = (y: number, x1 = L, x2 = R, lw = 0.5) =>
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: lw, color: black })
  const vl = (x: number, y1: number, y2: number, lw = 0.5) =>
    page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: lw, color: black })

  function wrapLines(val: string, maxW: number, sz = 9, b = false): string[] {
    const f = b ? bold : font
    const words = safe(val).split(/\s+/).filter(Boolean)
    const rows: string[] = []
    for (const word of words) {
      const last = rows.at(-1)
      const candidate = last ? `${last} ${word}` : word
      if (!last || f.widthOfTextAtSize(candidate, sz) > maxW) rows.push(word)
      else rows[rows.length - 1] = candidate
    }
    return rows
  }

  // ─── TITLU ───────────────────────────────────────────────────────────
  const TITLE = 'Dispozitie de plata'
  const TSZ = 16
  const TW = bold.widthOfTextAtSize(TITLE, TSZ)
  t(TITLE, L + (W - TW) / 2, 796, TSZ, true)
  t(dispositionNumber, R - tw(dispositionNumber, TSZ, true) - 2, 796, TSZ, true)
  hl(782, L, R, 1)

  // ─── DATE FIRMĂ ──────────────────────────────────────────────────────
  const LBL = 95
  t('Unitatea', L, 766, 10, true)
  t(safe(body.firmaNume), L + LBL, 766, 10)
  t('CUI', L, 752, 10, true)
  t(safe(body.cif), L + LBL, 752, 10)
  t('Nr. Reg. Com.', L, 738, 10, true)
  t(safe(body.nrRegCom), L + LBL, 738, 10)
  t('Adresa', L, 724, 10, true)
  t(safe(body.adresa), L + LBL, 724, 9)
  t('Punct Lucru', L, 710, 10, true)
  t('Sediu', L + LBL, 710, 10)
  t('Data emiterii', L, 696, 10, true)
  t(dateStr, L + LBL, 696, 10)

  // ─── TABEL PRINCIPAL ─────────────────────────────────────────────────
  // Coloane: Nume(L..C2) | Functia(C2..C3) | Suma(C3..C4) | Explicatie(C4..R)
  const C2 = 220, C3 = 318, C4 = 415
  const TBL_TOP = 678

  hl(TBL_TOP, L, R, 1)

  const HDR_Y = TBL_TOP - 14
  t('Nume si prenume', L + 4, HDR_Y, 9, true)
  t('Functia', C2 + 4, HDR_Y, 9, true)
  t('Suma', C3 + 4, HDR_Y, 9, true)
  t('Explicatie', C4 + 4, HDR_Y, 9, true)

  const HDR_BOT = TBL_TOP - 27
  hl(HDR_BOT, L, R, 1)

  const DATA_Y = HDR_BOT - 14
  const EXP_W = R - C4 - 8
  const expLines = wrapLines(safe(body.purpose), EXP_W)
  const rowH = Math.max(22, expLines.length * 12 + 10)

  t(safe(body.beneficiary), L + 4, DATA_Y, 9)
  t(safe(body.function), C2 + 4, DATA_Y, 9)
  t(`${money} RON`, C3 + 4, DATA_Y, 9)
  expLines.forEach((l, i) => t(l, C4 + 4, DATA_Y - i * 12, 9))

  const DATA_BOT = HDR_BOT - rowH
  hl(DATA_BOT, L, R, 1)

  const TOT_Y = DATA_BOT - 14
  t('Total plata', C3 + 4, TOT_Y, 10, true)
  t(`${money} RON`, C4 + 4, TOT_Y, 10, true)

  const TBL_BOT = DATA_BOT - 26
  hl(TBL_BOT, L, R, 1)

  vl(C2, TBL_TOP, TBL_BOT, 1)
  vl(C3, TBL_TOP, TBL_BOT, 1)
  vl(C4, TBL_TOP, TBL_BOT, 1)
  vl(L, TBL_TOP, TBL_BOT, 1)
  vl(R, TBL_TOP, TBL_BOT, 1)

  // ─── CASETA SEMNĂTURI ────────────────────────────────────────────────
  const SIG_TOP = TBL_BOT - 14
  const SIG_H = 100
  const SIG_BOT = SIG_TOP - SIG_H

  hl(SIG_TOP, L, R, 1); hl(SIG_BOT, L, R, 1)
  vl(L, SIG_TOP, SIG_BOT, 1); vl(R, SIG_TOP, SIG_BOT, 1)

  const SEM_X = L + 28
  vl(SEM_X, SIG_TOP, SIG_BOT, 1)
  page.drawText('Semnatura', {
    x: L + 21, y: SIG_BOT + (SIG_H - tw('Semnatura', 8)) / 2,
    size: 8, font, color: black, rotate: degrees(90),
  })

  const COL_W = (R - SEM_X) / 4
  const SC1 = SEM_X, SC2 = SEM_X + COL_W, SC3 = SEM_X + COL_W * 2, SC4 = SEM_X + COL_W * 3
  vl(SC2, SIG_TOP, SIG_BOT, 1)
  vl(SC3, SIG_TOP, SIG_BOT, 1)
  vl(SC4, SIG_TOP, SIG_BOT, 1)

  const SIG_DIV = SIG_TOP - 46
  hl(SIG_DIV, SEM_X, R, 1)

  t('Conducatorul Unitatii', SC1 + 4, SIG_TOP - 14, 8)
  t('Viza de control financiar', SC2 + 4, SIG_TOP - 12, 8)
  t('- preventiv', SC2 + 4, SIG_TOP - 22, 8)
  t('Compartimentul financiar', SC3 + 4, SIG_TOP - 12, 8)
  t('- contabil', SC3 + 4, SIG_TOP - 22, 8)
  t('Casier,', SC4 + 4, SIG_TOP - 12, 8)
  t('Platit suma de ', SC4 + 4, SIG_TOP - 23, 8)
  t(`${money} RON`, SC4 + 4 + tw('Platit suma de ', 8), SIG_TOP - 23, 8, true)
  t('Data: ', SC4 + 4, SIG_TOP - 34, 8)
  t(dateStr, SC4 + 4 + tw('Data: ', 8), SIG_TOP - 34, 8, true)

  // ─── DATE SUPLIMENTARE ───────────────────────────────────────────────
  const DS_Y = SIG_BOT - 20
  t('Date suplimentare privind beneficiarul sumei', L, DS_Y, 10, true)
  hl(DS_Y - 13, L, R, 0.5)

  const AI_Y = DS_Y - 27
  let ax = L
  const ai1 = 'Act de identitate: Seria '
  t(ai1, ax, AI_Y, 10); ax += tw(ai1, 10)
  t(safe(body.identitySeries), ax, AI_Y, 10, true); ax += tw(safe(body.identitySeries), 10, true)
  const ai2 = ', Numar '
  t(ai2, ax, AI_Y, 10); ax += tw(ai2, 10)
  t(safe(body.identityNumber), ax, AI_Y, 10, true)

  const AP_Y = AI_Y - 17
  let bx = L
  const ap1 = 'Am primit suma de '
  t(ap1, bx, AP_Y, 10); bx += tw(ap1, 10)
  t(`${money} RON`, bx, AP_Y, 10, true)

  const DP_Y = AP_Y - 17
  t('Data: ', L, DP_Y, 10)
  t(dateStr, L + tw('Data: ', 10), DP_Y, 10, true)
  t('Semnatura:', 300, DP_Y, 10, true)

  const bytes = await pdf.save()
  const fileName = `dispozitie_plata_${dispositionNumber}_${dateStr.replace(/[./]/g, '-') || 'fara-data'}.pdf`
  return { bytes, fileName, dateStr }
}

// Muta o dispozitie de plata (cu facturile atasate) pe alta luna a aceleiasi firme. Numerotarea e pe luna,
// deci dispozitia primeste urmatorul numar din luna tinta, iar PDF-ul se regenereaza cu numarul nou.
// Luna tinta se creeaza daca nu exista inca (init_luna_noua e idempotent).
export async function mutaDispozitie(sb: Sb, body: Record<string, string>) {
  const fail = (error: string, status: number) => ({ ok: false as const, error, status })
  const { id, firmaId } = body
  const tinta = String(body.luna || '')
  if (!id || !firmaId || !/^\d{4}-\d{2}$/.test(tinta)) return fail('Dispoziția sau luna țintă lipsește', 400)

  const { data: dp, error } = await sb.from('documente')
    .select('id,firma_id,luna_id,furnizor,numar_document,fisier_path,suma')
    .eq('id', id).eq('firma_id', firmaId).eq('tip_document', 'dispozitie_plata').maybeSingle()
  if (error || !dp || !String(dp.fisier_path).includes('/dispozitii-plata/')) return fail('Dispoziția de plată nu a fost găsită', 404)

  const { data: tintaId, error: initError } = await sb.rpc('init_luna_noua', { p_firma_id: firmaId, p_luna: `${tinta}-01` })
  if (initError || !tintaId) return fail(`Luna ${workMonthLabel(tinta)} nu a putut fi deschisă: ${initError?.message || ''}`, 500)
  if (tintaId === dp.luna_id) return fail('Dispoziția e deja pe luna aleasă', 400)

  let date: Record<string, string> = {}
  try { if (String(dp.furnizor).startsWith('DP_DATA:')) date = JSON.parse(String(dp.furnizor).slice(8)) } catch {}
  const amount = Number(dp.suma ?? date.amount)
  if (!Number.isFinite(amount) || amount <= 0) return fail('Dispoziția nu are sumă', 400)

  const { data: atasamente } = await sb.from('documente')
    .select('id,furnizor,numar_document')
    .eq('luna_id', dp.luna_id).eq('modul', 'acte_contabile').eq('tip_document', 'factura').like('furnizor', 'Atașament DP %')
  const legate = (atasamente || []).filter(a =>
    String(a.furnizor).startsWith(`Atașament DP ${dp.id} `)
    || (String(a.furnizor).startsWith('Atașament DP nr.') && a.numar_document === dp.numar_document))

  const { fisier_path: pdfVechi, numar_document: numarVechi, luna_id: lunaSursa } = dp
  const numar = await getNextNumber(tintaId, sb)
  const { bytes, fileName } = await construiestePdfDispozitie({
    ...date, firmaNume: body.firmaNume, cif: body.cif, nrRegCom: body.nrRegCom, adresa: body.adresa,
  }, amount, numar)
  const path = `${firmaId}/${tintaId}/dispozitii-plata/dispozitie_plata_${numar}_${Date.now()}.pdf`
  const { error: upErr } = await sb.storage.from('documente').upload(path, Buffer.from(bytes), { contentType: 'application/pdf' })
  if (upErr) return fail(upErr.message, 500)

  const { error: updErr } = await sb.from('documente')
    // created_at = acum: in luna tinta e cea mai noua dispozitie (ordinea listei si numerotarea dupa o resetare)
    .update({ luna_id: tintaId, numar_document: numar, fisier_path: path, fisier_nume: fileName, fisier_marime: bytes.length, created_at: new Date().toISOString() })
    .eq('id', dp.id)
  if (updErr) { await sb.storage.from('documente').remove([path]); return fail(updErr.message, 500) }
  await sb.storage.from('documente').remove([pdfVechi])
  await finalizeazaDocument(sb, dp.id, { extrage: false })

  for (const a of legate) {
    const hash = readStoredHash(a.furnizor)
    await sb.from('documente')
      .update({ luna_id: tintaId, numar_document: numar, furnizor: `Atașament DP ${dp.id} nr. ${numar} | ${safe(date.purpose)}${hash ? ` | HASH:${hash}` : ''}` })
      .eq('id', a.id).eq('firma_id', firmaId)
  }

  return { ok: true as const, numar, vechi: numarVechi, lunaId: tintaId, facturi: legate.length, nextNumber: await getNextNumber(lunaSursa, sb) }
}
