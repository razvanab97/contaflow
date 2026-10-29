import Anthropic from '@anthropic-ai/sdk'
import { createHash, randomUUID } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import type { getServiceSupabase } from '@/lib/supabase/server'
import { alegeTranzactia, firmaPlatitoare, ibanCurat, necesitaOp, numarOpTx, type OpCitit, type TxOp } from '@/lib/ordine-plata'

// Zona OP-uri: incarcare -> AI citeste fiecare OP din fisier -> firma platitoare -> dubluri -> plata din extras ->
// OP-ul se ataseaza tranzactiei (document "ordin_plata" in luna extrasului). Registrul e tabelul ordine_plata.

type Sb = ReturnType<typeof getServiceSupabase>
export const MODEL_OP = process.env.OP_AI_MODEL || process.env.PROIECT_AI_MODEL || 'claude-sonnet-5'
export const lipsaTabel = (e: { code?: string } | null) => !!e && ['42P01', 'PGRST205'].includes(e.code || '')
export const COLOANE_OP = 'id,firma_id,fisier_path,fisier_nume,fisier_hash,pagina,numar_op,data,suma,valuta,platitor,iban_platitor,beneficiar,iban_beneficiar,explicatie,tranzactie_id,document_id,status,dublura_de,motiv,created_at'

export interface FirmaOp { id: string; slug: string; nume: string; cui: string | null; ibanuri: string[] }
export interface TxDb extends TxOp { id: string; firma_id: string; extras_id: string; document_id: string | null; data_tranzactie: string }

export async function firmeCuConturi(sb: Sb): Promise<FirmaOp[]> {
  const [{ data: firme }, { data: extrase }] = await Promise.all([
    sb.from('firme').select('id,slug,nume,cui,iban_ron,iban_eur'),
    sb.from('extrase').select('firma_id,iban'),
  ])
  return (firme || []).map(f => ({
    id: f.id, slug: f.slug, nume: f.nume, cui: f.cui,
    ibanuri: [...new Set([f.iban_ron, f.iban_eur, ...(extrase || []).filter(e => e.firma_id === f.id).map(e => e.iban)].map(ibanCurat).filter(Boolean))],
  })).filter(f => f.ibanuri.length || f.cui) // firma PROIECT nu are conturi proprii - platile ei sunt in AB Textile SRL
}

const PROMPT = (firme: FirmaOp[]) => `Documentul atașat conține unul sau mai multe ordine de plată (OP) / confirmări de plată emise de bancă. Extrage FIECARE ordin de plată.

Firmele noastre (plătitorul e una dintre ele): ${firme.map(f => `${f.nume} (CUI ${f.cui || '-'}; conturi ${f.ibanuri.join(', ') || '-'})`).join('; ')}.

Răspunde DOAR cu JSON: {"op":[{"pagina":1,"numar_op":"71","data":"AAAA-LL-ZZ","suma":931.93,"valuta":"RON","platitor":"AB TEXTILE SRL","iban_platitor":"RO..","beneficiar":"MUULOX S.R.L.","iban_beneficiar":"RO..","explicatie":"MX109711"}]}
- pagina = pagina din PDF pe care e OP-ul (1 = prima); numar_op = numărul ordinului de plată (doar cifrele, fără serie), data = data plății / emiterii.
- suma = număr (1.234,56 -> 1234.56); IBAN-urile fără spații. Un câmp ilizibil = null — nu inventa.
- Dacă documentul nu e un ordin de plată, întoarce {"op":[]}.`

export async function citesteOp(client: Anthropic, bytes: Buffer, tip: string, firme: FirmaOp[]): Promise<(OpCitit & { pagina?: number | null })[]> {
  const sursa = tip === 'application/pdf'
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: bytes.toString('base64') } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: tip as 'image/jpeg' | 'image/png', data: bytes.toString('base64') } }
  const r = await client.messages.create({ model: MODEL_OP, max_tokens: 8000, messages: [{ role: 'user', content: [sursa, { type: 'text', text: PROMPT(firme) }] }] })
  const raw = r.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
  let j: { op?: Record<string, unknown>[] } = {}
  try { j = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}') } catch { return [] }
  return (Array.isArray(j.op) ? j.op : []).map(o => ({
    pagina: Number.isInteger(Number(o.pagina)) && Number(o.pagina) > 0 ? Number(o.pagina) : null,
    numar_op: o.numar_op != null && String(o.numar_op).replace(/\D/g, '') ? String(Number(String(o.numar_op).replace(/\D/g, ''))) : null,
    data: /^\d{4}-\d{2}-\d{2}$/.test(String(o.data)) ? String(o.data) : null,
    suma: Number.isFinite(Number(o.suma)) && Number(o.suma) > 0 ? Math.round(Number(o.suma) * 100) / 100 : null,
    valuta: String(o.valuta || 'RON').toUpperCase().slice(0, 3),
    platitor: o.platitor ? String(o.platitor).slice(0, 200) : null, iban_platitor: ibanCurat(o.iban_platitor) || null,
    beneficiar: o.beneficiar ? String(o.beneficiar).slice(0, 200) : null, iban_beneficiar: ibanCurat(o.iban_beneficiar) || null,
    explicatie: o.explicatie ? String(o.explicatie).slice(0, 500) : null,
  }))
}

export const hashFisier = (b: Buffer) => createHash('sha256').update(b).digest('hex')

// O pagina dintr-un PDF cu mai multe OP-uri (ca fiecare plata sa primeasca doar OP-ul ei).
async function paginaPdf(bytes: Buffer, pagina: number): Promise<Buffer | null> {
  try {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
    if (pagina < 1 || pagina > src.getPageCount()) return null
    const out = await PDFDocument.create()
    const [p] = await out.copyPages(src, [pagina - 1]); out.addPage(p)
    return Buffer.from(await out.save())
  } catch { return null }
}

const esteTaxa = (tx: TxOp, op: OpCitit) => /trezorerie|anaf|d\.?g\.?r\.?f\.?p|\/ROC\//i.test(`${tx.descriere || ''} ${op.beneficiar || ''}`)

// Ataseaza OP-ul tranzactiei: copie a fisierului (sau doar pagina lui) in luna extrasului, document "ordin_plata".
// La platile catre stat (ANAF / trezorerie) OP-ul e chiar documentul justificativ: devine documentul principal al
// tranzactiei daca aceasta nu are deja unul. La celelalte plati ramane document suplimentar (factura e tot necesara).
export async function ataseazaLaTranzactie(sb: Sb, op: OpCitit & { id: string; fisier_path: string; fisier_nume?: string | null; pagina?: number | null; fisier_tip?: string }, tx: TxDb, bytes?: Buffer | null) {
  const { data: ex } = await sb.from('extrase').select('luna_id').eq('id', tx.extras_id).maybeSingle()
  if (!ex?.luna_id) throw new Error('Extrasul plății nu are lună')
  let continut = bytes ?? null
  if (!continut) { const { data } = await sb.storage.from('documente').download(op.fisier_path); continut = data ? Buffer.from(await data.arrayBuffer()) : null }
  if (!continut) throw new Error('Fișierul OP-ului nu a putut fi citit')
  const tip = op.fisier_tip || (/\.pdf$/i.test(op.fisier_path) ? 'application/pdf' : /\.png$/i.test(op.fisier_path) ? 'image/png' : 'image/jpeg')
  if (tip === 'application/pdf' && op.pagina) {
    const doc = await PDFDocument.load(continut, { ignoreEncryption: true }).catch(() => null)
    if (doc && doc.getPageCount() > 1) continut = (await paginaPdf(continut, op.pagina)) || continut
  }
  const ext = tip === 'application/pdf' ? 'pdf' : tip === 'image/png' ? 'png' : 'jpg'
  const benef = String(op.beneficiar || 'beneficiar').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').slice(0, 50)
  const nume = `OP_${op.numar_op || 'fara_nr'}_${tx.data_tranzactie}_${benef}.${ext}`
  const path = `${tx.firma_id}/${ex.luna_id}/tx/${tx.id}_op_${Date.now()}_${nume}`
  const { error: upErr } = await sb.storage.from('documente').upload(path, continut, { contentType: tip })
  if (upErr) throw new Error(upErr.message)
  const { data: d, error } = await sb.from('documente').insert({
    firma_id: tx.firma_id, luna_id: ex.luna_id, tranzactie_id: tx.id, modul: 'extras', tip_document: 'ordin_plata',
    furnizor: op.beneficiar, numar_document: op.numar_op ? `OP ${op.numar_op}` : 'OP', suma: op.suma, valuta: op.valuta || 'RON',
    data_document: op.data || tx.data_tranzactie, fisier_path: path, fisier_nume: nume, fisier_tip: tip, fisier_marime: continut.length, in_zip: true,
  }).select('id').single()
  if (error || !d) { await sb.storage.from('documente').remove([path]); throw new Error(error?.message || 'Documentul OP nu s-a salvat') }
  if (!tx.document_id && esteTaxa(tx, op)) {
    await sb.from('tranzactii').update({ document_id: d.id, note: null, status_note: null }).eq('id', tx.id)
    await recalculeazaDocumentate(sb, tx.extras_id)
  }
  return d.id as string
}

export async function detaseaza(sb: Sb, documentId: string | null, tranzactieId: string | null) {
  if (!documentId) return
  const { data: d } = await sb.from('documente').select('fisier_path,tranzactie_id').eq('id', documentId).eq('tip_document', 'ordin_plata').maybeSingle()
  if (!d) return
  const txId = tranzactieId || d.tranzactie_id
  const { data: tx } = txId ? await sb.from('tranzactii').select('id,extras_id,document_id').eq('id', txId).maybeSingle() : { data: null }
  if (tx?.document_id === documentId) await sb.from('tranzactii').update({ document_id: null }).eq('id', tx.id)
  await sb.from('documente').delete().eq('id', documentId)
  await sb.storage.from('documente').remove([d.fisier_path])
  if (tx?.extras_id) await recalculeazaDocumentate(sb, tx.extras_id)
}

async function recalculeazaDocumentate(sb: Sb, extrasId: string) {
  const { count } = await sb.from('tranzactii').select('id', { count: 'exact', head: true }).eq('extras_id', extrasId).not('document_id', 'is', null)
  if (count != null) await sb.from('extrase').update({ nr_documentate: count }).eq('id', extrasId)
}

export async function tranzactiiDebit(sb: Sb, firmaId: string, de: string, pana: string): Promise<TxDb[]> {
  const { data } = await sb.from('tranzactii').select('id,firma_id,extras_id,data_tranzactie,descriere,descriere_curatata,tip,suma,referinta,categorie,document_id')
    .eq('firma_id', firmaId).eq('tip', 'debit').gte('data_tranzactie', de).lte('data_tranzactie', pana)
  return (data || []) as TxDb[]
}
const plusZile = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

// Plata din extras pentru un OP; daca extrasul pentru data OP-ului nu e inca incarcat, motivul o spune
// (OP-ul ramane neasociat si se asociaza singur la urmatoarea deschidere a paginii, dupa incarcarea extrasului).
async function cautaPlata(sb: Sb, firmaId: string, op: OpCitit) {
  const ales = alegeTranzactia(op, await tranzactiiDebit(sb, firmaId, plusZile(op.data!, -3), plusZile(op.data!, 7)))
  if (ales.tx || ales.candidati) return ales
  const { data: ultima } = await sb.from('tranzactii').select('data_tranzactie').eq('firma_id', firmaId).order('data_tranzactie', { ascending: false }).limit(1)
  const ult = ultima?.[0]?.data_tranzactie as string | undefined
  if (!ult || ult < op.data!) return { ...ales, motiv: `extrasul pentru ${op.data!.split('-').reverse().join('.')} nu e încă încărcat${ult ? ` (ultima plată din extrase: ${ult.split('-').reverse().join('.')})` : ''} — se asociază singur după încărcarea extrasului` }
  return ales
}

// Reincearca asocierea OP-urilor neasociate (ex. extrasul lunii a fost incarcat intre timp). Fara AI - doar potrivirea.
export async function reincearcaNeasociate(sb: Sb) {
  const { data: ops, error } = await sb.from('ordine_plata').select(COLOANE_OP).eq('status', 'neasociat').not('firma_id', 'is', null).not('data', 'is', null).not('suma', 'is', null).or('motiv.is.null,motiv.neq.dezasociat manual').limit(300)
  if (error || !ops?.length) return 0
  let asociate = 0
  for (const op of ops) {
    const o = { ...op, suma: Number(op.suma) }
    const ales = await cautaPlata(sb, op.firma_id!, o)
    if (!ales.tx) { if (ales.motiv !== op.motiv) await sb.from('ordine_plata').update({ motiv: ales.motiv }).eq('id', op.id); continue }
    const { data: deja } = await sb.from('ordine_plata').select('id,numar_op').eq('tranzactie_id', ales.tx.id).eq('status', 'asociat').limit(1)
    if (deja?.length) { await sb.from('ordine_plata').update({ status: 'dublura', dublura_de: deja[0].id, tranzactie_id: ales.tx.id, motiv: `plata din extras are deja OP-ul${deja[0].numar_op ? ` nr. ${deja[0].numar_op}` : ''}` }).eq('id', op.id); continue }
    try {
      const documentId = await ataseazaLaTranzactie(sb, o, ales.tx)
      const { error: e } = await sb.from('ordine_plata').update({ status: 'asociat', tranzactie_id: ales.tx.id, document_id: documentId, motiv: ales.motive.join(' · ') }).eq('id', op.id)
      if (e) await detaseaza(sb, documentId, ales.tx.id); else asociate++
    } catch { /* ramane neasociat; se reincearca data viitoare */ }
  }
  return asociate
}

// Proceseaza un OP citit: firma, dubluri, potrivire cu plata din extras, atasare. Intoarce randul de salvat in ordine_plata.
export async function proceseazaOp(sb: Sb, op: OpCitit & { pagina?: number | null }, ctx: { firme: FirmaOp[]; fisier_path: string; fisier_nume: string; fisier_hash: string; fisier_tip: string; bytes: Buffer }) {
  const id = randomUUID()
  const baza = { id, fisier_path: ctx.fisier_path, fisier_nume: ctx.fisier_nume, fisier_hash: ctx.fisier_hash, pagina: op.pagina ?? null, ...op }
  const firma = firmaPlatitoare(op, ctx.firme)
  if (!firma) return { ...baza, firma_id: null, status: 'neasociat', motiv: 'nu am recunoscut firma plătitoare (IBAN / nume)', tranzactie_id: null, document_id: null, dublura_de: null }

  // Acelasi OP incarcat deja dintr-un alt fisier
  if (op.numar_op && op.suma != null) {
    let q = sb.from('ordine_plata').select('id,status,tranzactie_id').eq('firma_id', firma.id).eq('numar_op', op.numar_op).eq('suma', op.suma).neq('status', 'dublura')
    if (op.data) q = q.eq('data', op.data)
    const { data: ex } = await q.limit(1)
    if (ex?.length) return { ...baza, firma_id: firma.id, status: 'dublura', dublura_de: ex[0].id, motiv: `OP nr. ${op.numar_op} e deja încărcat`, tranzactie_id: ex[0].tranzactie_id, document_id: null }
  }

  if (op.suma == null || !op.data) return { ...baza, firma_id: firma.id, status: 'neasociat', motiv: 'AI nu a putut citi suma sau data OP-ului', tranzactie_id: null, document_id: null, dublura_de: null }
  const potrivire = await cautaPlata(sb, firma.id, op)
  if (!potrivire.tx) return { ...baza, firma_id: firma.id, status: 'neasociat', motiv: potrivire.motiv, tranzactie_id: null, document_id: null, dublura_de: null }
  const ales = potrivire

  // Plata are deja un OP (alt numar / alt fisier)
  const { data: deja } = await sb.from('ordine_plata').select('id,numar_op').eq('tranzactie_id', ales.tx.id).eq('status', 'asociat').limit(1)
  if (deja?.length) return { ...baza, firma_id: firma.id, status: 'dublura', dublura_de: deja[0].id, motiv: `plata din extras are deja OP-ul${deja[0].numar_op ? ` nr. ${deja[0].numar_op}` : ''}`, tranzactie_id: ales.tx.id, document_id: null }

  const documentId = await ataseazaLaTranzactie(sb, { ...op, id, fisier_path: ctx.fisier_path, fisier_tip: ctx.fisier_tip }, ales.tx, ctx.bytes)
  return { ...baza, firma_id: firma.id, status: 'asociat', motiv: ales.motive.join(' · '), tranzactie_id: ales.tx.id, document_id: documentId, dublura_de: null }
}

// Platile din extrase care ar trebui sa aiba OP si nu au (nici OP din zona OP-uri, nici document "ordin_plata").
export async function platiFaraOp(sb: Sb) {
  const out: (TxDb & { numar_op: string | null })[] = []
  for (let a = 0; a < 20000; a += 1000) {
    const { data } = await sb.from('tranzactii').select('id,firma_id,extras_id,data_tranzactie,descriere,descriere_curatata,tip,suma,referinta,categorie,document_id,motiv_ignorare')
      .eq('tip', 'debit').order('data_tranzactie', { ascending: false }).range(a, a + 999)
    const page = (data || []) as (TxDb & { motiv_ignorare?: string | null })[]
    out.push(...page.filter(t => necesitaOp(t)).map(t => ({ ...t, numar_op: numarOpTx(t) })))
    if (page.length < 1000) break
  }
  if (!out.length) return []
  const cuOp = new Set<string>()
  const ids = out.map(t => t.id)
  for (let i = 0; i < ids.length; i += 150) {
    const bucata = ids.slice(i, i + 150)
    const [{ data: ops }, { data: docs }] = await Promise.all([
      sb.from('ordine_plata').select('tranzactie_id').in('tranzactie_id', bucata).eq('status', 'asociat'),
      sb.from('documente').select('tranzactie_id').in('tranzactie_id', bucata).eq('tip_document', 'ordin_plata'),
    ])
    ;[...(ops || []), ...(docs || [])].forEach(x => x.tranzactie_id && cuOp.add(x.tranzactie_id))
  }
  return out.filter(t => !cuOp.has(t.id))
}
