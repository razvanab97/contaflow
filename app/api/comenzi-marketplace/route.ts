import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { emitentImplicit, incarcaComanda, lipsaTabel, type LinieComanda } from '@/lib/comenzi-marketplace'

export const dynamic = 'force-dynamic'

// Comanda marketplace a unei plati din extras: GET (cu potrivirea facturilor atasate + facturi gasite in Inbox
// pentru liniile care asteapta), POST (salveaza / inlocuieste comanda), PATCH (o linie), DELETE (comanda).

const r2 = (n: number) => Math.round(n * 100) / 100
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export async function GET(req: NextRequest) {
  const txId = req.nextUrl.searchParams.get('txId')
  if (!txId) return NextResponse.json({ error: 'Tranzacție lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const r = await incarcaComanda(sb, txId)
  if (!r.comanda) return NextResponse.json(r)

  // Facturi ale firmei, neatasate niciunei plati, cu suma unei linii care asteapta (Inbox, facturi restante, module)
  const asteptate = r.linii.filter(l => l.stare === 'asteptata')
  let candidati: Record<string, { id: string; furnizor: string | null; numar_document: string | null; suma: number; fisier_nume: string; data_document: string | null }[]> = {}
  if (asteptate.length) {
    const sume = [...new Set(asteptate.map(l => l.subtotal))]
    const { data } = await sb.from('documente').select('id,furnizor,numar_document,suma,fisier_nume,data_document')
      .eq('firma_id', r.comanda.firma_id).is('tranzactie_id', null).in('tip_document', ['factura', 'invoice'])
      .gte('suma', Math.min(...sume) - 0.05).lte('suma', Math.max(...sume) + 0.05).order('created_at', { ascending: false }).limit(200)
    candidati = Object.fromEntries(asteptate.map(l => [l.id, (data || []).filter(d => Math.abs(Number(d.suma) - l.subtotal) <= 0.05)
      .map(d => ({ ...d, suma: Number(d.suma) }))
      .sort((a, b) => Number(norm(b.furnizor).includes(norm(l.vanzator).split(/\s+/)[0])) - Number(norm(a.furnizor).includes(norm(l.vanzator).split(/\s+/)[0])))
      .slice(0, 4)]))
  }
  return NextResponse.json({ ...r, candidati })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { txId?: string; platforma?: string; numar_comanda?: string; data_comanda?: string; total?: number; valuta?: string; linii?: Partial<LinieComanda>[] }
  if (!b.txId) return NextResponse.json({ error: 'Tranzacție lipsă' }, { status: 400 })
  const linii = (b.linii || []).map(l => ({ vanzator: String(l.vanzator || '').trim().slice(0, 160), emitent: String(l.emitent || '').trim().slice(0, 160) || null, subtotal: r2(Number(String(l.subtotal ?? '').replace(',', '.'))), stare: l.stare === 'anulata' ? 'anulata' : 'asteptata', nota: l.nota ? String(l.nota).slice(0, 300) : null }))
    .filter(l => l.vanzator && Number.isFinite(l.subtotal) && l.subtotal > 0)
  if (linii.length < 1) return NextResponse.json({ error: 'Adaugă cel puțin un vânzător cu subtotal' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: tx } = await sb.from('tranzactii').select('id,firma_id,suma,valuta,tip').eq('id', b.txId).maybeSingle()
  if (!tx) return NextResponse.json({ error: 'Tranzacția nu a fost găsită' }, { status: 404 })

  // O comanda pe plata: salvarea inlocuieste comanda veche (cu tot cu linii)
  const { error: e0 } = await sb.from('comenzi_marketplace').delete().eq('tranzactie_id', tx.id)
  if (e0) return NextResponse.json({ error: lipsaTabel(e0) ? 'Rulează întâi migrarea SQL pentru comenzile marketplace.' : e0.message }, { status: 500 })
  const { data: c, error } = await sb.from('comenzi_marketplace').insert({
    firma_id: tx.firma_id, tranzactie_id: tx.id, platforma: String(b.platforma || 'Marketplace').slice(0, 60),
    numar_comanda: b.numar_comanda ? String(b.numar_comanda).slice(0, 60) : null,
    data_comanda: /^\d{4}-\d{2}-\d{2}$/.test(String(b.data_comanda)) ? b.data_comanda : null,
    total: Number.isFinite(Number(b.total)) && Number(b.total) > 0 ? r2(Number(b.total)) : Math.abs(Number(tx.suma)), valuta: b.valuta || tx.valuta || 'RON',
  }).select('id').single()
  if (error || !c) return NextResponse.json({ error: error?.message || 'Comanda nu s-a salvat' }, { status: 500 })
  const { error: e2 } = await sb.from('comenzi_marketplace_linii').insert(linii.map((l, i) => ({ ...l, emitent: l.emitent || emitentImplicit(l.vanzator), comanda_id: c.id, ordine: i })))
  if (e2) { await sb.from('comenzi_marketplace').delete().eq('id', c.id); return NextResponse.json({ error: e2.message }, { status: 500 }) }
  return NextResponse.json(await incarcaComanda(sb, tx.id))
}

// O linie: stare (asteptata / anulata), document_id (alegere manuala dintre facturile atasate), nota, subtotal, vanzator
export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { id?: string; txId?: string; stare?: string; document_id?: string | null; nota?: string; subtotal?: number; vanzator?: string }
  if (!b.id || !b.txId) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const patch: Record<string, unknown> = {}
  if (b.document_id !== undefined) {
    if (b.document_id) {
      const { data: d } = await sb.from('documente').select('id').eq('id', b.document_id).eq('tranzactie_id', b.txId).maybeSingle()
      if (!d) return NextResponse.json({ error: 'Factura nu e atașată acestei plăți' }, { status: 400 })
      await sb.from('comenzi_marketplace_linii').update({ document_id: null, stare: 'asteptata' }).eq('document_id', b.document_id).neq('id', b.id)
    }
    patch.document_id = b.document_id || null; patch.stare = b.document_id ? 'primita' : 'asteptata'
  }
  if (b.stare === 'anulata' || b.stare === 'asteptata') { patch.stare = b.stare; if (b.stare === 'anulata') patch.document_id = null }
  if (typeof b.nota === 'string') patch.nota = b.nota.slice(0, 300) || null
  if (b.subtotal != null && Number(b.subtotal) > 0) patch.subtotal = r2(Number(b.subtotal))
  if (typeof b.vanzator === 'string' && b.vanzator.trim()) patch.vanzator = b.vanzator.trim().slice(0, 160)
  const { error } = await sb.from('comenzi_marketplace_linii').update(patch).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(await incarcaComanda(sb, b.txId))
}

export async function DELETE(req: NextRequest) {
  const txId = req.nextUrl.searchParams.get('txId')
  if (!txId) return NextResponse.json({ error: 'Tranzacție lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const { error } = await sb.from('comenzi_marketplace').delete().eq('tranzactie_id', txId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await sb.from('tranzactii').update({ status_note: null }).eq('id', txId)
  return NextResponse.json({ ok: true })
}
