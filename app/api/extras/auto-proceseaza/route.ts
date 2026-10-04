import { NextRequest, NextResponse } from 'next/server'
import { regulaAutomata, type MotivIgnorare } from '@/lib/tranzactii-reguli'
import { potriviriSigure } from '@/lib/tranzactii-potrivire'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co/rest/v1'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }

export const maxDuration = 60

const ASOCIERE: Record<'factura' | 'bon' | 'inbox', { url: string; idKey: string }> = {
  factura: { url: '/api/facturi-asteptate/asociaza', idKey: 'facturaId' },
  bon: { url: '/api/bonuri/asociaza', idKey: 'bonId' },
  inbox: { url: '/api/inbox-facturi/asociaza', idKey: 'facturaId' },
}

async function patchTx(ids: string[], body: Record<string, unknown>) {
  return fetch(`${SB}/tranzactii?id=in.(${ids.join(',')})&document_id=is.null&note=is.null`, {
    method: 'PATCH',
    headers: { ...H, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  })
}

// Procesare automata a tranzactiilor DESCHISE dintr-o luna (fara document, neignorate):
//  1. asociaza documentele care se potrivesc fara echivoc (suma la ban + data apropiata + candidat unic):
//     facturi adaugate in avans, bonuri, facturi din Inbox - prin aceleasi rute ca butonul manual;
//  2. sare tranzactiile standard (comisioane, schimb valutar, incasari Booking/Airbnb/eMAG, chirii catre
//     persoane fizice, impozite catre Trezorerie/ANAF),
//     marcate "automat" si cu motivul lor - oricare se poate reactiva cu un click.
// Rulata dupa importul unui extras si la deschiderea Extrasului de cont. Nu atinge tranzactiile deja
// documentate sau ignorate manual.
export async function POST(req: NextRequest) {
  const { lunaId, dryRun = false } = await req.json().catch(() => ({}))
  if (!lunaId) return NextResponse.json({ error: 'lunaId lipsește' }, { status: 400 })

  const [lRes, eRes] = await Promise.all([
    fetch(`${SB}/luni_contabile?id=eq.${encodeURIComponent(lunaId)}&select=firma_id`, { headers: H }),
    fetch(`${SB}/extrase?luna_id=eq.${encodeURIComponent(lunaId)}&select=id`, { headers: H }),
  ])
  const [luna] = lRes.ok ? await lRes.json() : []
  const extrase: { id: string }[] = eRes.ok ? await eRes.json() : []
  if (!luna?.firma_id) return NextResponse.json({ error: 'Luna nu există' }, { status: 404 })
  if (!extrase.length) return NextResponse.json({ asociate: {}, ignorate: {}, total: 0 })

  const tRes = await fetch(`${SB}/tranzactii?extras_id=in.(${extrase.map(e => e.id).join(',')})&document_id=is.null&note=is.null&select=id,data_tranzactie,descriere,descriere_curatata,tip,suma,valuta,categorie,document_id,note`, { headers: H })
  if (!tRes.ok) return NextResponse.json({ error: await tRes.text() }, { status: 502 })
  const deschise: any[] = await tRes.json()

  // 1. Asocieri sigure (inainte de ignorare - un document gasit e mereu preferabil).
  const asociate: Record<string, number> = {}
  const erori: string[] = []
  const asociateIds = new Set<string>()
  const potriviri = await potriviriSigure(luna.firma_id, deschise)
  if (dryRun) {
    // Simulare: ce s-ar asocia / sari, fara nicio scriere.
    const ids = new Set(potriviri.map(p => p.txId))
    const sim: Record<string, string[]> = {}
    for (const t of deschise) { if (ids.has(t.id)) continue; const m = regulaAutomata(t); if (m) (sim[m] ||= []).push(`${t.tip} ${t.suma} ${(t.descriere_curatata || t.descriere || '').slice(0, 50)}`) }
    return NextResponse.json({ dryRun: true, deschise: deschise.length, asocieri: potriviri, ignorate: sim })
  }
  for (const p of potriviri) {
    const cfg = ASOCIERE[p.tip]
    const r = await fetch(new URL(cfg.url, req.nextUrl.origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [cfg.idKey]: p.docId, tranzactieId: p.txId }),
    }).catch(() => null)
    if (r?.ok) { asociate[p.tip] = (asociate[p.tip] || 0) + 1; asociateIds.add(p.txId) }
    else erori.push(`${p.tip}: ${r ? (await r.json().catch(() => ({})))?.error || r.status : 'conexiune'}`)
  }

  // 2. Sarire automata dupa regulile standard - DOAR daca exista coloanele de motiv/marcaj automat
  // (supabase_tranzactii_motiv_ignorare.sql). Fara ele nu s-ar mai putea deosebi ce a sarit sistemul
  // de ce a ignorat utilizatorul, asa ca nu sarim nimic pana la rularea migrarii.
  const probe = await fetch(`${SB}/tranzactii?select=motiv_ignorare,ignorat_auto&limit=1`, { headers: H })
  if (!probe.ok) {
    const totalA = Object.values(asociate).reduce((a, b) => a + b, 0)
    return NextResponse.json({ asociate, ignorate: {}, total: totalA, erori, migrareLipsa: true })
  }
  const peMotiv = new Map<MotivIgnorare, string[]>()
  for (const t of deschise) {
    if (asociateIds.has(t.id)) continue
    const m = regulaAutomata(t)
    if (m) peMotiv.set(m, [...(peMotiv.get(m) || []), t.id])
  }
  const ignorate: Record<string, number> = {}
  for (const [motiv, ids] of peMotiv) {
    for (let i = 0; i < ids.length; i += 100) {
      const lot = ids.slice(i, i + 100)
      const r = await patchTx(lot, { note: 'na', motiv_ignorare: motiv, ignorat_auto: true })
      if (r.ok) ignorate[motiv] = (ignorate[motiv] || 0) + lot.length
      else erori.push(`ignorare ${motiv}: ${r.status}`)
    }
  }

  const total = Object.values(asociate).reduce((a, b) => a + b, 0) + Object.values(ignorate).reduce((a, b) => a + b, 0)
  return NextResponse.json({ asociate, ignorate, total, erori })
}
