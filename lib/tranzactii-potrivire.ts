// Potrivirea tranzactiilor bancare cu documente nelegate inca (facturi adaugate in avans, bonuri,
// facturi din Inbox) - folosita pentru sugestiile din Extras de cont (api/tranzactii/list) si pentru
// asocierea automata "sigura" (api/extras/auto-proceseaza). Mutata aici din api/tranzactii/list.

import { cursuriBnrSigur, inLei, type CursFn } from '@/lib/curs-bnr'

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

// Factura in valuta (ex. Anthropic 18 EUR) platita cu cardul din contul in lei: banca converteste la
// cursul ei, de obicei cu 1-4% peste cursul BNR din ziua facturii (Anthropic: 97.29 RON pentru
// 18 EUR x 5.2636 = 94.74 RON, adica +2.7%). Raportul suma tranzactie / echivalent BNR trebuie sa
// cada in aceasta marja.
const MARJA_CURS_MIN = 0.98
const MARJA_CURS_MAX = 1.06
// La moneda diferita suma singura nu mai e un indiciu suficient - cerem si numele furnizorului in
// descrierea tranzactiei si o plata apropiata de data facturii.
const ZILE_MAX_VALUTA = 10

const CUVINTE_GENERICE = new Set(['limited', 'international', 'romania', 'company', 'group', 'trade', 'services', 'digital', 'invest', 'holding', 'retail'])
function cuvinteFurnizor(furnizor: string | null | undefined) {
  return String(furnizor || '').split('|')[0]
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 4 && !CUVINTE_GENERICE.has(t))
}
export function furnizorInDescriere(furnizor: string | null | undefined, tx: any) {
  const text = [tx.descriere_curatata, tx.descriere, tx.referinta].filter(Boolean).join(' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return cuvinteFurnizor(furnizor).some(t => text.includes(t))
}

// Compara suma documentului cu tranzactia: direct cand au aceeasi moneda, altfel prin echivalentul
// BNR din ziua documentului (doar factura in valuta platita din cont in lei). Intoarce diferenta in
// moneda tranzactiei, sau null daca nu sunt comparabile / nu se potrivesc.
export function diferentaSuma(d: { suma: any; valuta?: string | null; data_document?: string | null; furnizor?: string | null }, tx: any, curs: CursFn | null, toleranta = SUMA_TOLERANTA): { diff: number; valutaDiferita: boolean } | null {
  if (d.suma == null || tx.suma == null) return null
  const vDoc = (d.valuta || 'RON').toUpperCase()
  const vTx = (tx.valuta || 'RON').toUpperCase()
  if (vDoc === vTx) {
    const diff = Math.abs(Number(d.suma) - Number(tx.suma))
    return diff <= toleranta ? { diff, valutaDiferita: false } : null
  }
  if (vTx !== 'RON' || !d.data_document) return null
  if (daysBetween(d.data_document, tx.data_tranzactie) > ZILE_MAX_VALUTA) return null
  if (!furnizorInDescriere(d.furnizor, tx)) return null
  const conv = inLei(curs, Math.abs(Number(d.suma)), vDoc, d.data_document)
  if (!conv || conv.sumaRon <= 0) return null
  const raport = Math.abs(Number(tx.suma)) / conv.sumaRon
  if (raport < MARJA_CURS_MIN || raport > MARJA_CURS_MAX) return null
  return { diff: Math.abs(Math.abs(Number(tx.suma)) - conv.sumaRon), valutaDiferita: true }
}

// Adauga echivalentul in lei (curs BNR din ziua documentului) pe un document in valuta - pentru afisare.
export function cuEchivalentLei<T extends { suma?: any; valuta?: string | null; data_document?: string | null }>(d: T, curs: CursFn | null) {
  const conv = inLei(curs, d.suma, d.valuta, d.data_document)
  return conv ? { ...d, suma_ron: conv.sumaRon, curs_bnr: conv.curs } : d
}

// Potriveste documentele deja importate in Inbox Facturi (local, Gmail sau Oblio), dar inca nelegate
// de nicio tranzactie, cu tranzactiile nedocumentate - dupa suma apropiata (+/- SUMA_TOLERANTA) si,
// cand documentul are data, dupa apropierea de data tranzactiei - ca sugestie automata (nu asociere
// directa), la fel ca la facturile Airbnb de mai jos. Alege mereu cea mai apropiata suma disponibila,
// nu prima gasita, ca sa nu "fure" un document mai potrivit pentru o alta tranzactie. Facturile in
// valuta platite in lei se compara prin cursul BNR (vezi diferentaSuma); cele in aceeasi moneda au
// mereu prioritate.
export async function matchInboxFacturi(firmaId: string, txs: any[]) {
  const dRes = await fetch(`${SB}/documente?firma_id=eq.${firmaId}&modul=eq.inbox_facturi&tranzactie_id=is.null&suma=not.is.null&select=id,fisier_nume,furnizor,suma,valuta,data_document,numar_document`, { headers: H })
  if (!dRes.ok) return new Map<string, any>()
  const docs: any[] = await dRes.json()
  if (!docs?.length) return new Map<string, any>()
  const curs = await cursuriBnrSigur(docs.filter(d => (d.valuta || 'RON').toUpperCase() !== 'RON').map(d => d.data_document))

  const used = new Set<string>()
  const sugestii = new Map<string, any>()
  for (const tx of txs) {
    if (tx.document_id || tx.tip !== 'debit' || tx.suma == null) continue
    let best: any = null
    let bestCheie = Infinity
    for (const d of docs) {
      if (used.has(d.id) || d.suma == null) continue
      if (d.data_document && daysBetween(d.data_document, tx.data_tranzactie) > 60) continue
      const p = diferentaSuma(d, tx, curs)
      if (!p) continue
      // aceeasi moneda inaintea conversiei valutare, apoi cea mai mica diferenta
      const cheie = (p.valutaDiferita ? 1e6 : 0) + p.diff
      if (cheie < bestCheie) { best = d; bestCheie = cheie }
    }
    if (best) { used.add(best.id); sugestii.set(tx.id, cuEchivalentLei(best, curs)) }
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
    fetch(`${SB}/documente?firma_id=eq.${firmaId}&modul=eq.inbox_facturi&tranzactie_id=is.null&suma=not.is.null&select=id,suma,valuta,data_document,furnizor`, { headers: H }),
  ])
  const facturi: any[] = fRes.ok ? await fRes.json() : []
  const bonuri: any[] = bRes.ok ? await bRes.json() : []
  const inbox: any[] = dRes.ok ? await dRes.json() : []
  const curs = await cursuriBnrSigur(inbox.filter(d => (d.valuta || 'RON').toUpperCase() !== 'RON').map(d => d.data_document))

  const cand: { tip: PotrivireSigura['tip']; id: string; ok: (tx: any) => boolean }[] = [
    ...facturi.filter(f => f.suma != null).map(f => ({ tip: 'factura' as const, id: f.id, ok: (tx: any) =>
      (tx.valuta || 'RON').toUpperCase() === 'RON' && Math.abs(Number(f.suma) - Number(tx.suma)) < 0.01 &&
      daysBetween(f.data_factura || f.created_at, tx.data_tranzactie) <= (f.data_factura ? 7 : 3) })),
    ...bonuri.filter(b => b.suma != null).map(b => ({ tip: 'bon' as const, id: b.id, ok: (tx: any) =>
      (tx.valuta || 'RON').toUpperCase() === 'RON' && Math.abs(Number(b.suma) - Number(tx.suma)) < 0.01 &&
      daysBetween(b.data_bon || b.created_at, tx.data_tranzactie) <= (b.data_bon ? 4 : 3) })),
    // Facturile din Inbox au nevoie si de data documentului (fara data, potrivirea doar pe suma e prea slaba).
    // In valuta (platite din contul in lei): suma la cursul BNR in marja bancii + furnizorul in descrierea
    // platii + maxim 7 zile - vezi diferentaSuma.
    ...inbox.filter(d => d.suma != null && d.data_document).map(d => ({ tip: 'inbox' as const, id: d.id, ok: (tx: any) => {
      if (daysBetween(d.data_document, tx.data_tranzactie) > 10) return false
      if ((d.valuta || 'RON').toUpperCase() === (tx.valuta || 'RON').toUpperCase()) return Math.abs(Number(d.suma) - Number(tx.suma)) < 0.01
      return daysBetween(d.data_document, tx.data_tranzactie) <= 7 && !!diferentaSuma(d, tx, curs)
    } })),
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

// eMAG (si alti furnizori, prin PayU/marketplace) emite adesea 2-3 facturi pentru O SINGURA plata:
// produse de la vanzatori diferiti, transport separat etc. Cautam combinatii de 2-3 facturi din
// Inbox, nelegate, care adunate dau exact suma platii (+/- 0.05), emise intre 10 zile inainte si 30
// de zile dupa plata (factura vine de obicei la livrare). La platile eMAG/PayU acceptam orice
// vanzator (marketplace); la celelalte, fiecare factura trebuie sa aiba furnizorul in descrierea
// platii. Sugeram grupul doar daca e UNICA combinatie gasita - la mai multe, nu ghicim.
const RE_MARKETPLACE = /emag|payu|dante international/i
const TOLERANTA_GRUP = 0.05
const MAX_CANDIDATI_GRUP = 40

export async function matchGrupuriInbox(firmaId: string, txs: any[], exclude: { tx: Set<string>; docs: Set<string> }) {
  const sugestii = new Map<string, { ids: string[]; docs: any[]; suma: number }>()
  const deschise = txs.filter(tx => !tx.document_id && tx.note !== 'na' && tx.tip === 'debit' && tx.suma != null && !exclude.tx.has(tx.id))
  if (!deschise.length) return sugestii
  const dRes = await fetch(`${SB}/documente?firma_id=eq.${firmaId}&modul=eq.inbox_facturi&tranzactie_id=is.null&suma=gt.0&data_document=not.is.null&select=id,fisier_nume,furnizor,suma,valuta,data_document,numar_document`, { headers: H })
  if (!dRes.ok) return sugestii
  const docs: any[] = (await dRes.json()).filter((d: any) => !exclude.docs.has(d.id))
  const folosite = new Set<string>()

  for (const tx of deschise) {
    const textTx = [tx.descriere_curatata, tx.descriere].filter(Boolean).join(' ')
    const marketplace = RE_MARKETPLACE.test(textTx)
    const txValuta = (tx.valuta || 'RON').toUpperCase()
    const tinta = Math.abs(Number(tx.suma))
    const zi = (d: string) => new Date(String(d).slice(0, 10) + 'T00:00:00Z').getTime() / MS_DAY
    const ziTx = zi(tx.data_tranzactie)
    const cand = docs.filter(d =>
      !folosite.has(d.id) &&
      (d.valuta || 'RON').toUpperCase() === txValuta &&
      Number(d.suma) < tinta &&
      zi(d.data_document) >= ziTx - 10 && zi(d.data_document) <= ziTx + 30 &&
      (marketplace || furnizorInDescriere(d.furnizor, tx)))
      .slice(0, MAX_CANDIDATI_GRUP)
    if (cand.length < 2) continue

    const gasite: any[][] = []
    for (let i = 0; i < cand.length && gasite.length < 2; i++) {
      for (let j = i + 1; j < cand.length && gasite.length < 2; j++) {
        const s2 = Number(cand[i].suma) + Number(cand[j].suma)
        if (Math.abs(s2 - tinta) <= TOLERANTA_GRUP) gasite.push([cand[i], cand[j]])
        if (s2 >= tinta) continue
        for (let k = j + 1; k < cand.length && gasite.length < 2; k++) {
          if (Math.abs(s2 + Number(cand[k].suma) - tinta) <= TOLERANTA_GRUP) gasite.push([cand[i], cand[j], cand[k]])
        }
      }
    }
    if (gasite.length !== 1) continue
    const grup = gasite[0]
    for (const d of grup) folosite.add(d.id)
    sugestii.set(tx.id, { ids: grup.map(d => d.id), docs: grup, suma: Math.round(grup.reduce((a, d) => a + Number(d.suma), 0) * 100) / 100 })
  }
  return sugestii
}
