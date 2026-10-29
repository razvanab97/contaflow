import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceSupabase } from '@/lib/supabase/server'
import { COLOANE_OP, ataseazaLaTranzactie, citesteOp, detaseaza, firmeCuConturi, hashFisier, lipsaTabel, platiFaraOp, proceseazaOp, reincearcaNeasociate, type TxDb } from '@/lib/ordine-plata-server'
import { scorPotrivire } from '@/lib/ordine-plata'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Zona OP-uri (pagina /op-uri): registrul ordinelor de plata, asocierea lor cu platile din extrase si platile fara OP.
const TIPURI = new Set(['application/pdf', 'image/jpeg', 'image/png'])

async function context(sb: ReturnType<typeof getServiceSupabase>, txIds: string[]) {
  const txs: Record<string, unknown>[] = []
  for (let i = 0; i < txIds.length; i += 150) {
    const { data } = await sb.from('tranzactii').select('id,firma_id,extras_id,data_tranzactie,descriere_curatata,descriere,suma,referinta,document_id').in('id', txIds.slice(i, i + 150))
    txs.push(...(data || []))
  }
  const extrasIds = [...new Set(txs.map(t => t.extras_id as string))]
  const { data: extrase } = extrasIds.length ? await sb.from('extrase').select('id,luna_id').in('id', extrasIds) : { data: [] }
  const lunaIds = [...new Set((extrase || []).map(e => e.luna_id))]
  const { data: luni } = lunaIds.length ? await sb.from('luni_contabile').select('id,luna').in('id', lunaIds) : { data: [] }
  const lunaDeExtras = new Map((extrase || []).map(e => [e.id, String((luni || []).find(l => l.id === e.luna_id)?.luna || '').slice(0, 7)]))
  return new Map(txs.map(t => [t.id as string, { ...t, luna: lunaDeExtras.get(t.extras_id as string) || null }]))
}

export async function GET(req: NextRequest) {
  const sb = getServiceSupabase()
  const sp = req.nextUrl.searchParams

  // Fisierul unui OP
  const fisier = sp.get('fisier')
  if (fisier) {
    const { data: op } = await sb.from('ordine_plata').select('fisier_path,fisier_nume').eq('id', fisier).maybeSingle()
    if (!op) return NextResponse.json({ error: 'OP negăsit' }, { status: 404 })
    const { data, error } = await sb.storage.from('documente').download(op.fisier_path)
    if (error || !data) return NextResponse.json({ error: 'Fișierul nu a putut fi descărcat' }, { status: 500 })
    const nume = String(op.fisier_nume || 'op.pdf')
    return new NextResponse(Buffer.from(await data.arrayBuffer()), { headers: { 'Content-Type': data.type || 'application/pdf', 'Content-Disposition': `inline; filename="${nume.normalize('NFD').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')}"` } })
  }

  // Platile posibile pentru un OP neasociat (aceeasi firma si suma, oricand), pentru alegere manuala
  const candidati = sp.get('candidati')
  if (candidati) {
    const { data: op } = await sb.from('ordine_plata').select(COLOANE_OP).eq('id', candidati).maybeSingle()
    if (!op?.firma_id || op.suma == null) return NextResponse.json({ candidati: [] })
    const { data } = await sb.from('tranzactii').select('id,firma_id,extras_id,data_tranzactie,descriere,descriere_curatata,tip,suma,referinta,categorie,document_id')
      .eq('firma_id', op.firma_id).eq('tip', 'debit').gte('suma', Number(op.suma) - 0.01).lte('suma', Number(op.suma) + 0.01).order('data_tranzactie', { ascending: false }).limit(30)
    const ctx = await context(sb, (data || []).map(t => t.id))
    return NextResponse.json({ candidati: (data || []).map(t => ({ ...ctx.get(t.id), scor: scorPotrivire({ ...op, data: null }, t as TxDb).scor })) })
  }

  const { data: opsDb, error } = await sb.from('ordine_plata').select(COLOANE_OP).order('created_at', { ascending: false }).limit(2000)
  if (error && !lipsaTabel(error)) return NextResponse.json({ error: error.message }, { status: 500 })
  const ops = opsDb || [] // fara tabel (migrarea nerulata): lista platilor fara OP se arata oricum
  const [fara, { data: firme }] = await Promise.all([platiFaraOp(sb), sb.from('firme').select('id,slug,nume,culoare')])
  const ctx = await context(sb, [...new Set([...ops.map(o => o.tranzactie_id).filter(Boolean) as string[], ...fara.map(t => t.id)])])
  return NextResponse.json({
    op: ops.map(o => ({ ...o, tranzactie: o.tranzactie_id ? ctx.get(o.tranzactie_id) || null : null })),
    faraOp: fara.map(t => ({ id: t.id, firma_id: t.firma_id, data_tranzactie: t.data_tranzactie, suma: Number(t.suma), descriere: t.descriere_curatata || t.descriere, numar_op: t.numar_op, luna: (ctx.get(t.id) as { luna?: string } | undefined)?.luna || null })),
    firme: firme || [],
    lipsaMigrare: !!error,
  })
}

// Un fisier pe cerere (pagina trimite fisierele pe rand, cate 3 in paralel). Un fisier poate contine mai multe OP-uri.
export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY lipsește.' }, { status: 500 })
  const fd = await req.formData()
  const file = fd.get('file')
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: 'Fișier lipsă' }, { status: 400 })
  if (!TIPURI.has(file.type)) return NextResponse.json({ error: 'Doar PDF, JPG sau PNG' }, { status: 400 })
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'Fișier mai mare de 15 MB' }, { status: 400 })
  const sb = getServiceSupabase()
  const bytes = Buffer.from(await file.arrayBuffer())
  const hash = hashFisier(bytes)

  const { data: exista, error: e0 } = await sb.from('ordine_plata').select('id,created_at').eq('fisier_hash', hash).limit(1)
  if (e0) return NextResponse.json({ error: lipsaTabel(e0) ? 'Rulează întâi migrarea SQL pentru tabelul ordine_plata.' : e0.message }, { status: 500 })
  if (exista?.length) return NextResponse.json({ dublura: true, motiv: `fișier încărcat deja pe ${new Date(exista[0].created_at).toLocaleDateString('ro-RO')}`, op: [] })

  const firme = await firmeCuConturi(sb)
  let citite
  try { citite = await citesteOp(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }), bytes, file.type, firme) }
  catch (e) { return NextResponse.json({ error: 'AI nu a putut citi fișierul: ' + (e instanceof Error ? e.message : String(e)) }, { status: 502 }) }
  if (!citite.length) return NextResponse.json({ error: 'Nu am găsit niciun ordin de plată în fișier' }, { status: 422 })

  const path = `op-uri/${hash.slice(0, 16)}_${file.name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80)}`
  const { error: upErr } = await sb.storage.from('documente').upload(path, bytes, { contentType: file.type, upsert: true })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // Pe rand: fiecare OP salvat inainte de urmatorul, ca dublurile din acelasi fisier sa fie recunoscute
  const salvate = []
  for (const op of citite) {
    let rand: Record<string, unknown>
    try { rand = await proceseazaOp(sb, op, { firme, fisier_path: path, fisier_nume: file.name, fisier_hash: hash, fisier_tip: file.type, bytes }) }
    catch (e) { rand = { ...op, fisier_path: path, fisier_nume: file.name, fisier_hash: hash, firma_id: null, status: 'neasociat', motiv: 'eroare la atașare: ' + (e instanceof Error ? e.message : String(e)), tranzactie_id: null, document_id: null, dublura_de: null } }
    const { data, error } = await sb.from('ordine_plata').insert(rand).select(COLOANE_OP).single()
    if (error) { if (rand.document_id) await detaseaza(sb, String(rand.document_id), (rand.tranzactie_id as string) || null); return NextResponse.json({ error: error.message }, { status: 500 }) }
    salvate.push(data)
  }
  const ctx = await context(sb, salvate.map(o => o.tranzactie_id).filter(Boolean) as string[])
  return NextResponse.json({ op: salvate.map(o => ({ ...o, tranzactie: o.tranzactie_id ? ctx.get(o.tranzactie_id) || null : null })) })
}

// Reincercarea asocierii pentru OP-urile neasociate (pagina o cere la deschidere): extrasele noi se potrivesc singure.
export async function PUT() {
  const asociate = await reincearcaNeasociate(getServiceSupabase()).catch(() => 0)
  return NextResponse.json({ asociate })
}

// Asociere manuala ({id, tranzactie_id}) sau dezasociere ({id, tranzactie_id: null}).
export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { id?: string; tranzactie_id?: string | null }
  if (!b.id) return NextResponse.json({ error: 'OP lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: op } = await sb.from('ordine_plata').select(COLOANE_OP).eq('id', b.id).maybeSingle()
  if (!op) return NextResponse.json({ error: 'OP negăsit' }, { status: 404 })
  await detaseaza(sb, op.document_id, op.tranzactie_id)
  if (!b.tranzactie_id) {
    const { data, error } = await sb.from('ordine_plata').update({ tranzactie_id: null, document_id: null, status: 'neasociat', dublura_de: null, motiv: 'dezasociat manual' }).eq('id', op.id).select(COLOANE_OP).single()
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ op: { ...data, tranzactie: null } })
  }
  const { data: tx } = await sb.from('tranzactii').select('id,firma_id,extras_id,data_tranzactie,descriere,descriere_curatata,tip,suma,referinta,categorie,document_id').eq('id', b.tranzactie_id).maybeSingle()
  if (!tx) return NextResponse.json({ error: 'Plata din extras nu a fost găsită' }, { status: 404 })
  const { data: alt } = await sb.from('ordine_plata').select('id,numar_op').eq('tranzactie_id', tx.id).eq('status', 'asociat').neq('id', op.id).limit(1)
  if (alt?.length) return NextResponse.json({ error: `Plata are deja OP-ul${alt[0].numar_op ? ` nr. ${alt[0].numar_op}` : ''} — dezasociază-l întâi` }, { status: 409 })
  try {
    const documentId = await ataseazaLaTranzactie(sb, { ...op, suma: op.suma != null ? Number(op.suma) : null }, tx as TxDb)
    const { data, error } = await sb.from('ordine_plata').update({ firma_id: tx.firma_id, tranzactie_id: tx.id, document_id: documentId, status: 'asociat', dublura_de: null, motiv: 'asociat manual' }).eq('id', op.id).select(COLOANE_OP).single()
    if (error) { await detaseaza(sb, documentId, tx.id); return NextResponse.json({ error: error.message }, { status: 500 }) }
    const ctx = await context(sb, [tx.id])
    return NextResponse.json({ op: { ...data, tranzactie: ctx.get(tx.id) || null } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// Sterge OP-ul din registru (si documentul atasat platii); fisierul ramane cat timp il mai foloseste alt OP.
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'OP lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: op } = await sb.from('ordine_plata').select('id,fisier_path,document_id,tranzactie_id').eq('id', id).maybeSingle()
  if (!op) return NextResponse.json({ error: 'OP negăsit' }, { status: 404 })
  await detaseaza(sb, op.document_id, op.tranzactie_id)
  const { error } = await sb.from('ordine_plata').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { count } = await sb.from('ordine_plata').select('id', { count: 'exact', head: true }).eq('fisier_path', op.fisier_path)
  if (!count) await sb.storage.from('documente').remove([op.fisier_path])
  return NextResponse.json({ ok: true })
}
