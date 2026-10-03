// Potrivirea tranzactiilor bancare cu documente nelegate inca (facturi adaugate in avans, bonuri,
// facturi din Inbox) - folosita pentru sugestiile din Extras de cont (api/tranzactii/list) si pentru
// asocierea automata "sigura" (api/extras/auto-proceseaza). Mutata aici din api/tranzactii/list.

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co/rest/v1'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }

const MS_DAY = 86400000
// Diferenta in zile calendaristice intre doua date (ignora ora, ca sa nu strice pragul de toleranta
// cand factura a fost incarcata spre finalul zilei).
export function daysBetween(a: string, b: string) {
  const da = new Date(String(a).slice(0, 10) + 'T00:00:00Z').getTime()
  const db = new Date(String(b).slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.abs(da - db) / MS_DAY
}

// Diferenta de suma acceptata intre document si tranzactie (comisioane bancare, rotunjiri de curs
// etc. produc de obicei cateva zeci de bani diferenta) - sub acest prag sugestia automata tot apare,
// doar ca nu mai e marcata "suma identica" (vezi sumaPotrivita in components/types.ts).
const SUMA_TOLERANTA = 1

// Potriveste documentele deja importate in Inbox Facturi (local, Gmail sau Oblio), dar inca nelegate
// de nicio tranzactie, cu tranzactiile nedocumentate - dupa suma apropiata (+/- SUMA_TOLERANTA) si,
// cand documentul are data, dupa apropierea de data tranzactiei - ca sugestie automata (nu asociere
// directa), la fel ca la facturile Airbnb de mai jos. Alege mereu cea mai apropiata suma disponibila,
// nu prima gasita, ca sa nu "fure" un document mai potrivit pentru o alta tranzactie.
export async function matchInboxFacturi(firmaId: string, txs: any[]) {
  const dRes = await fetch(`${SB}/documente?firma_id=eq.${firmaId}&modul=eq.inbox_facturi&tranzactie_id=is.null&suma=not.is.null&select=id,fisier_nume,furnizor,suma,valuta,data_document,numar_document`, { headers: H })
  if (!dRes.ok) return new Map<string, any>()
  const docs: any[] = await dRes.json()
  if (!docs?.length) return new Map<string, any>()

  const used = new Set<string>()
  const sugestii = new Map<string, any>()
  for (const tx of txs) {
    if (tx.document_id || tx.tip !== 'debit' || tx.suma == null) continue
    const txValuta = (tx.valuta || 'RON').toUpperCase()
    let best: any = null
    let bestDiff = Infinity
    for (const d of docs) {
      if (used.has(d.id) || d.suma == null) continue
      if ((d.valuta || 'RON').toUpperCase() !== txValuta) continue
      const diff = Math.abs(Number(d.suma) - Number(tx.suma))
      if (diff > SUMA_TOLERANTA) continue
      if (d.data_document && daysBetween(d.data_document, tx.data_tranzactie) > 60) continue
      if (diff < bestDiff) { best = d; bestDiff = diff }
    }
    if (best) { used.add(best.id); sugestii.set(tx.id, best) }
  }
  return sugestii
}

// Data cea mai de incredere pentru apropierea de tranzactia bancara: data reala a documentului
// (data_factura/data_bon) cand exista - de multe ori bonurile/facturile sunt fotografiate/incarcate
// in lot, mult dupa cumparare (ex. mai multe bonuri de combustibil scanate intr-o singura sedinta la
// sfarsit de luna), deci data incarcarii (created_at) nu mai are nicio legatura cu data platii. Cand
// documentul nu are data proprie, ramanem pe created_at ca aproximare (comportamentul de dinainte).
function dataReferintaDocument(dataDocument: string | null | undefined, createdAt: string): string {
  return dataDocument || createdAt
}

// Potriveste facturile adaugate in avans (luna trecuta) cu tranzactiile nedocumentate ale lunii curente,
// dupa suma apropiata (+/- SUMA_TOLERANTA) si apropierea de data platii (data facturii cand exista,
// altfel data incarcarii) - ca sugestie, nu asociere automata. Alege cea mai apropiata suma, nu prima gasita.
export async function matchFacturiAsteptate(firmaId: string, txs: any[]) {
  const fRes = await fetch(`${SB}/facturi_asteptate?firma_id=eq.${firmaId}&status=eq.asteptare&select=id,fisier_nume,furnizor,suma,data_factura,created_at`, { headers: H })
  if (!fRes.ok) return new Map<string, any>()
  const facturi: any[] = await fRes.json()
  if (!facturi?.length) return new Map<string, any>()

  const used = new Set<string>()
  const sugestii = new Map<string, any>()
  for (const tx of txs) {
    if (tx.document_id || tx.tip !== 'debit' || tx.suma == null) continue
    // facturi_asteptate nu are coloana valuta (presupune mereu RON) - o tranzactie in alta moneda
    // nu poate fi comparata corect dupa suma bruta, asa ca o excludem din potrivire automata.
    if ((tx.valuta || 'RON').toUpperCase() !== 'RON') continue
    let best: any = null
    let bestDiff = Infinity
    for (const f of facturi) {
      if (used.has(f.id) || f.suma == null) continue
      const diff = Math.abs(Number(f.suma) - Number(tx.suma))
      if (diff > SUMA_TOLERANTA) continue
      const referinta = dataReferintaDocument(f.data_factura, f.created_at)
      const maxZile = f.data_factura ? 7 : 3
      if (daysBetween(referinta, tx.data_tranzactie) > maxZile) continue
      if (diff < bestDiff) { best = f; bestDiff = diff }
    }
    if (best) { used.add(best.id); sugestii.set(tx.id, best) }
  }
  return sugestii
}

// Potriveste bonurile fiscale adaugate in avans cu tranzactiile nedocumentate, dupa aceleasi
// criterii ca facturile din facturi_asteptate (suma apropiata + apropierea de data platii) - ca
// sugestie, nu asociere automata. Alege cea mai apropiata suma.
export async function matchBonuri(firmaId: string, txs: any[]) {
  const bRes = await fetch(`${SB}/bonuri?firma_id=eq.${firmaId}&status=eq.asteptare&select=id,fisier_nume,comerciant,cui_client,suma,data_bon,tip,created_at`, { headers: H })
  if (!bRes.ok) return new Map<string, any>()
  const bonuri: any[] = await bRes.json()
  if (!bonuri?.length) return new Map<string, any>()

  const used = new Set<string>()
  const sugestii = new Map<string, any>()
  for (const tx of txs) {
    if (tx.document_id || tx.tip !== 'debit' || tx.suma == null) continue
    // bonuri nu are coloana valuta (presupune mereu RON) - vezi motivul de mai sus la facturi_asteptate.
    if ((tx.valuta || 'RON').toUpperCase() !== 'RON') continue
    let best: any = null
    let bestDiff = Infinity
    for (const b of bonuri) {
      if (used.has(b.id) || b.suma == null) continue
      const diff = Math.abs(Number(b.suma) - Number(tx.suma))
      if (diff > SUMA_TOLERANTA) continue
      const referinta = dataReferintaDocument(b.data_bon, b.created_at)
      const maxZile = b.data_bon ? 7 : 3
      if (daysBetween(referinta, tx.data_tranzactie) > maxZile) continue
      if (diff < bestDiff) { best = b; bestDiff = diff }
    }
    if (best) { used.add(best.id); sugestii.set(tx.id, best) }
  }
  return sugestii
}


// Asociere AUTOMATA doar cand potrivirea e fara echivoc: suma identica la ban, aceeasi moneda,
// data apropiata, si un singur document candidat (si documentul se potriveste exact cu o singura
// tranzactie). Orice dubiu ramane sugestie, ca pana acum - nu se leaga nimic gresit.
export interface PotrivireSigura { txId: string; tip: 'factura' | 'bon' | 'inbox'; docId: string }

export async function potriviriSigure(firmaId: string, txs: any[]): Promise<PotrivireSigura[]> {
  const deschise = txs.filter(t => !t.document_id && t.note !== 'na' && t.tip === 'debit' && t.suma != null)
  if (!deschise.length) return []
  const [fRes, bRes, dRes] = await Promise.all([
    fetch(`${SB}/facturi_asteptate?firma_id=eq.${firmaId}&status=eq.asteptare&select=id,suma,data_factura,created_at`, { headers: H }),
    fetch(`${SB}/bonuri?firma_id=eq.${firmaId}&status=eq.asteptare&select=id,suma,data_bon,created_at`, { headers: H }),
    fetch(`${SB}/documente?firma_id=eq.${firmaId}&modul=eq.inbox_facturi&tranzactie_id=is.null&suma=not.is.null&select=id,suma,valuta,data_document`, { headers: H }),
  ])
  const facturi: any[] = fRes.ok ? await fRes.json() : []
  const bonuri: any[] = bRes.ok ? await bRes.json() : []
  const inbox: any[] = dRes.ok ? await dRes.json() : []

  const cand: { tip: PotrivireSigura['tip']; id: string; ok: (tx: any) => boolean }[] = [
    ...facturi.filter(f => f.suma != null).map(f => ({ tip: 'factura' as const, id: f.id, ok: (tx: any) =>
      (tx.valuta || 'RON').toUpperCase() === 'RON' && Math.abs(Number(f.suma) - Number(tx.suma)) < 0.01 &&
      daysBetween(f.data_factura || f.created_at, tx.data_tranzactie) <= (f.data_factura ? 7 : 3) })),
    ...bonuri.filter(b => b.suma != null).map(b => ({ tip: 'bon' as const, id: b.id, ok: (tx: any) =>
      (tx.valuta || 'RON').toUpperCase() === 'RON' && Math.abs(Number(b.suma) - Number(tx.suma)) < 0.01 &&
      daysBetween(b.data_bon || b.created_at, tx.data_tranzactie) <= (b.data_bon ? 4 : 3) })),
    // Facturile din Inbox au nevoie si de data documentului (fara data, potrivirea doar pe suma e prea slaba).
    ...inbox.filter(d => d.suma != null && d.data_document).map(d => ({ tip: 'inbox' as const, id: d.id, ok: (tx: any) =>
      (d.valuta || 'RON').toUpperCase() === (tx.valuta || 'RON').toUpperCase() && Math.abs(Number(d.suma) - Number(tx.suma)) < 0.01 &&
      daysBetween(d.data_document, tx.data_tranzactie) <= 10 })),
  ]

  const txPerDoc = new Map<string, number>()
  const docsPerTx = new Map<string, typeof cand>()
  for (const tx of deschise) {
    const potrivite = cand.filter(c => c.ok(tx))
    docsPerTx.set(tx.id, potrivite)
    for (const c of potrivite) txPerDoc.set(c.id, (txPerDoc.get(c.id) || 0) + 1)
  }
  const out: PotrivireSigura[] = []
  for (const tx of deschise) {
    const p = docsPerTx.get(tx.id) || []
    if (p.length === 1 && txPerDoc.get(p[0].id) === 1) out.push({ txId: tx.id, tip: p[0].tip, docId: p[0].id })
  }
  return out
}
