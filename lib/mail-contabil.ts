import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { workMonthLabel, accountingPeriodLabel } from '@/lib/accounting-period'
import { CATEGORII, type Categorie, type Dovada, type Punct, type StatusPunct } from '@/lib/mail-contabil-tipuri'

export * from '@/lib/mail-contabil-tipuri'

// Mail contabil: mailul primit de la contabil (text lipit si/sau capturi de ecran) e impartit de AI
// in situatii punctuale (o tranzactie neidentificata, o diferenta de refacturat, un client
// neincasat...). Pentru fiecare situatie se cauta in ContaFlow dovezi (tranzactii din extras,
// documente, facturi 5StarDesk, rezervari din borderou) - cautarea e deterministica, in cod -, iar
// AI-ul spune pe baza lor daca situatia e deja rezolvata si, daca nu, ce e de facut concret.

// Analiza (judecata pe dovezi) - modelul mare; extragerea situatiilor din mail e simpla si lunga
// (multe randuri), deci pe modelul rapid, ca sa ramana sub limita Vercel de 60s si cu capturi.
export const MODEL_MAIL = process.env.MAIL_CONTABIL_MODEL || 'claude-sonnet-5'
const MODEL_EXTRAGERE = process.env.MAIL_CONTABIL_MODEL_EXTRAGERE || 'claude-haiku-4-5-20251001'

function client() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) }

function jsonDin<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) as T } catch { return null }
}

function numar(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/\s/g, '').replace(',', '.')) : NaN
  return Number.isFinite(n) && n !== 0 ? Math.round(n * 100) / 100 : null
}
function dataIso(v: unknown): string | null {
  const s = String(v || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}

export interface ContextFirma { firmaNume: string; module: string[]; lunaKey: string | null }

function descriereContext(c: ContextFirma) {
  const per = c.lunaKey ? `Luna de lucru: ${workMonthLabel(c.lunaKey)} (perioada contabilă ${accountingPeriodLabel(c.lunaKey)}).` : ''
  return `Firma: ${c.firmaNume}. Module ContaFlow active: ${c.module.join(', ')}. ${per}
ContaFlow e aplicația noastră internă de contabilitate primară: încărcăm extrasele de cont (fiecare tranzacție se asociază cu documentul ei - factură, bon, chitanță), facturile primite (Inbox Facturi), facturile client emise în 5StarDesk (pentru cazare: rezervări Airbnb și Booking, verificate pe baza borderourilor platformelor), facturile de comision Airbnb/Booking, avizele eMAG etc. Contabilul extern ne trimite lunar mailuri cu ce lipsește sau e neclar.`
}

// ---------------------------------------------------------------------------------------------
// 1. Extragerea situatiilor din mail

export interface ImagineMail { mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; data: string }

export async function extragePuncte(text: string, imagini: ImagineMail[], ctx: ContextFirma) {
  const continut: Anthropic.ContentBlockParam[] = imagini.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } }))
  continut.push({ type: 'text', text: `${descriereContext(ctx)}

Mai jos e un mail de la contabil (${imagini.length ? 'în capturile de ecran de mai sus' : ''}${imagini.length && text ? ' și ' : ''}${text ? 'în textul de mai jos' : ''}). Împarte-l în SITUAȚII PUNCTUALE de rezolvat - fiecare persoană / tranzacție / factură menționată separat e o situație separată (ex. fiecare rând dintr-o listă cu nume e un punct). Cererile generale (ex. "facturați tot restantul", "reglați lunar") sunt puncte cu categoria "general". Nu rata niciun rând.

Categorii: ${Object.entries(CATEGORII).map(([k, v]) => `"${k}" (${v})`).join(', ')}.
- tranzactie_neidentificata: o încasare/plată din extras pentru care contabilul nu are document sau explicație (ex. "04.07.2026 - 188 lei - RADMAN WHEELS").
- diferenta_facturare: factura client e mai mică decât ce s-a încasat, trebuie facturată diferența (sumaDiferenta = diferența cerută).
- factura_client_lipsa: lipsește factura client pentru o încasare/rezervare.
- storno_factura: factura e mai mare decât încasarea, se cere factură cu minus (sumaDiferenta = factura minus încasat, ex. "factura e 410, s-a încasat 387" -> suma 410, sumaDiferenta 23 - NU suma încasată).
- client_neincasat: client facturat dar neîncasat; restituire_bani: trebuie întorși bani unui client.
- furnizor_neachitat / document_lipsa: furnizori neachitați sau acte lipsă (chitanțe, bonuri).

Răspunde DOAR cu JSON valid:
{"subiect":"titlu scurt al mailului","rezumat":"2-3 propoziții: ce cere contabilul","dataMail":"AAAA-LL-ZZ sau null","puncte":[{"categorie":"diferenta_facturare","titlu":"KATERYNA TSUKANOVA - refacturare diferență 33,17 lei","persoana":"KATERYNA TSUKANOVA","suma":180.83,"sumaDiferenta":33.17,"data":null,"platforma":"airbnb|booking|emag|null","cerere":"ce cere contabilul, o propoziție","citat":"rândul original din mail"}]}
"suma" = suma principală menționată (factura/tranzacția), "data" = data menționată în format AAAA-LL-ZZ. Nu inventa valori - pune null.

${text ? `TEXTUL MAILULUI:\n${text.slice(0, 20000)}` : ''}` })

  const res = await client().messages.create({ model: MODEL_EXTRAGERE, max_tokens: 8000, messages: [{ role: 'user', content: continut }] })
  const raw = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
  const p = jsonDin<{ subiect?: string; rezumat?: string; dataMail?: string; puncte?: Record<string, unknown>[] }>(raw)
  if (!p) throw new Error('AI-ul nu a putut citi mailul')
  const puncte: Punct[] = (p.puncte || []).map((x, i) => ({
    id: `p${i + 1}-${Math.random().toString(36).slice(2, 7)}`,
    categorie: (Object.keys(CATEGORII).includes(String(x.categorie)) ? x.categorie : 'general') as Categorie,
    titlu: String(x.titlu || x.citat || 'Situație').slice(0, 200),
    persoana: x.persoana ? String(x.persoana).slice(0, 120) : null,
    suma: numar(x.suma),
    sumaDiferenta: numar(x.sumaDiferenta),
    data: dataIso(x.data),
    platforma: x.platforma && x.platforma !== 'null' ? String(x.platforma).toLowerCase() : null,
    cerere: String(x.cerere || '').slice(0, 500),
    citat: String(x.citat || '').slice(0, 500),
    status: 'nou', dovezi: [], constatare: null, recomandare: null, pasi: [], raspuns: null,
    rezolvatManual: false, nota: null, analizatAt: null,
  }))
  return { subiect: p.subiect ? String(p.subiect).slice(0, 200) : null, rezumat: p.rezumat ? String(p.rezumat).slice(0, 1500) : null, dataMail: dataIso(p.dataMail), puncte }
}

// ---------------------------------------------------------------------------------------------
// 2. Cautarea dovezilor in ContaFlow (tot in cod, pe datele firmei incarcate o singura data)

function ascii(s: string) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ȘșŞş]/g, 's').replace(/[ȚțŢţ]/g, 't').toLowerCase() }
const STOP = new Set(['srl', 'sa', 'pfa', 'ii', 'the', 'and', 'pentru', 'asociatia', 'societatea', 'firma', 'client', 'din', 'cu', 'de', 'la'])
function tokeni(s: string | null | undefined) { return ascii(String(s || '')).split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !STOP.has(t)) }

// Cate cuvinte din numele cautat apar in text (toate, daca numele are 1-2 cuvinte; macar 2 altfel).
function potrivesteNume(persoana: string[], text: string) {
  if (!persoana.length) return false
  const t = new Set(tokeni(text))
  const gasite = persoana.filter(p => t.has(p) || [...t].some(x => x.length >= 5 && p.length >= 5 && (x.startsWith(p) || p.startsWith(x))))
  return persoana.length <= 2 ? gasite.length === persoana.length : gasite.length >= 2
}
const egal = (a: number | null | undefined, b: number | null | undefined) => a != null && b != null && Math.abs(Math.abs(Number(a)) - Math.abs(Number(b))) < 0.015
const zileIntre = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000)

/* eslint-disable @typescript-eslint/no-explicit-any */
async function toate(q: () => any, max = 6000): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await q().range(from, from + 999)
    if (error || !data?.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

export interface DateFirma {
  tranzactii: any[]; documente: any[]; facturi5: any[]; rezervari: any[]; asteptate: any[]
  airbnbCsv: any[]; comisioane: any[]
  luni: Map<string, string>; firmaSlug: string
}

export async function incarcaDateFirma(sb: SupabaseClient, firmaId: string, firmaSlug: string): Promise<DateFirma> {
  const [tranzactii, documente, facturi5, rezervari, asteptate, luniRows, extrase, airbnbCsv, comisioane] = await Promise.all([
    toate(() => sb.from('tranzactii').select('id,extras_id,data_tranzactie,descriere,descriere_curatata,tip,suma,valuta,document_id,note,status_note,motiv_ignorare').eq('firma_id', firmaId).order('data_tranzactie', { ascending: false })),
    toate(() => sb.from('documente').select('id,luna_id,modul,tip_document,furnizor,numar_document,data_document,suma,valuta,fisier_nume,tranzactie_id').eq('firma_id', firmaId)),
    toate(() => sb.from('stardesk_facturi').select('*').eq('firma_id', firmaId)),
    toate(() => sb.from('borderou_rezervari').select('id,luna_id,platforma,cod_rezervare,nume_oaspete,suma').eq('firma_id', firmaId)),
    toate(() => sb.from('facturi_asteptate').select('id,furnizor,numar_document,suma,data_factura,status,fisier_nume').eq('firma_id', firmaId)),
    toate(() => sb.from('luni_contabile').select('id,luna').eq('firma_id', firmaId)),
    toate(() => sb.from('extrase').select('id,luna_id').eq('firma_id', firmaId)),
    toate(() => sb.from('airbnb_facturi_asteptate').select('cod_confirmare,suma,taxa_servicii,castiguri_brute,data_start,data_sfarsit').eq('firma_id', firmaId)),
    toate(() => sb.from('comision_facturi').select('cod_rezervare,numar_factura,suma,platforma').eq('firma_id', firmaId)),
  ])
  const luni = new Map<string, string>(luniRows.map((l: any) => [l.id, String(l.luna).slice(0, 7)]))
  const lunaExtras = new Map<string, string>(extrase.map((e: any) => [e.id, e.luna_id]))
  for (const t of tranzactii) t.luna_id = lunaExtras.get(t.extras_id) || null
  return { tranzactii, documente, facturi5, rezervari, asteptate, airbnbCsv, comisioane, luni, firmaSlug }
}

const fmt = (v: unknown) => v == null ? '—' : new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v))

export function cautaDovezi(p: Punct, d: DateFirma): Dovada[] {
  const nume = tokeni(p.persoana)
  const sume = [p.suma, p.sumaDiferenta].filter((x): x is number => x != null)
  const lunaKey = (id: string | null) => (id && d.luni.get(id)) || null
  const lunaLbl = (id: string | null) => { const k = lunaKey(id); return k ? workMonthLabel(k) : null }
  const out: (Dovada & { scor: number })[] = []

  for (const t of d.tranzactii) {
    const text = `${t.descriere || ''} ${t.descriere_curatata || ''} ${t.note || ''}`
    const n = potrivesteNume(nume, text)
    const s = sume.some(x => egal(x, t.suma))
    const aproape = p.data && t.data_tranzactie ? zileIntre(p.data, t.data_tranzactie) <= 7 : false
    if (!(n || (s && (aproape || !p.data)))) continue
    const docLegat = t.document_id ? d.documente.find(x => x.id === t.document_id) : null
    const stare = t.document_id ? `are document asociat${docLegat ? ` (${docLegat.fisier_nume})` : ''}` : t.motiv_ignorare ? `marcată ignorată: ${t.motiv_ignorare}` : t.note ? `notă: ${t.note}` : 'FĂRĂ document asociat'
    out.push({
      sursa: 'tranzactie', scor: (n ? 2 : 0) + (s ? 2 : 0) + (aproape ? 1 : 0),
      titlu: `${t.tip === 'credit' ? 'Încasare' : 'Plată'} ${fmt(t.suma)} ${t.valuta || 'RON'} · ${t.data_tranzactie}`,
      detalii: `${String(t.descriere_curatata || t.descriere || '').slice(0, 160)} — ${stare}`,
      suma: Number(t.suma), data: t.data_tranzactie, luna: lunaLbl(t.luna_id),
      potrivire: [n && 'nume', s && 'sumă', aproape && 'dată'].filter(Boolean).join(' + '),
      documentUrl: t.document_id ? `/api/chitante/document?id=${t.document_id}` : null,
      href: lunaKey(t.luna_id) ? `/${d.firmaSlug}/${lunaKey(t.luna_id)}/extras` : null,
    })
  }
  for (const f of d.facturi5) {
    const n = potrivesteNume(nume, f.nume_client)
    const s = sume.some(x => egal(x, f.suma))
    if (!n && !(s && nume.length === 0)) continue
    out.push({
      sursa: 'factura_5stardesk', scor: (n ? 3 : 0) + (s ? 2 : 0),
      titlu: `Factură 5StarDesk ${f.numar_factura || '—'} · ${fmt(f.suma)} RON`,
      detalii: `${f.nume_client || '—'}${f.id_rezervare ? ` · rezervare ${f.id_rezervare}` : ''}${f.data_start ? ` · sejur ${f.data_start} – ${f.data_sfarsit}` : ''}`,
      suma: Number(f.suma), data: f.data_sfarsit || null, luna: lunaLbl(f.luna_id),
      potrivire: [n && 'nume', s && 'sumă'].filter(Boolean).join(' + '),
      documentUrl: f.document_id ? `/api/chitante/document?id=${f.document_id}` : null,
      href: lunaKey(f.luna_id) ? `/${d.firmaSlug}/${lunaKey(f.luna_id)}/5stardesk` : null,
    })
  }
  const cod = (v: unknown) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  for (const r of d.rezervari) {
    if (!potrivesteNume(nume, r.nume_oaspete)) continue
    // Airbnb: borderoul are suma NETA (dupa comision). Comisionul (taxa de servicii din CSV-ul
    // Airbnb si/sau factura de comision) explica de obicei "diferenta de refacturat" a contabilului.
    const csv = r.platforma === 'airbnb' ? d.airbnbCsv.find(x => cod(x.cod_confirmare) === cod(r.cod_rezervare)) : null
    const com = d.comisioane.find(x => cod(x.cod_rezervare) === cod(r.cod_rezervare))
    const comision = csv?.taxa_servicii != null ? Number(csv.taxa_servicii) : com?.suma != null ? Number(com.suma) : null
    const extra = [
      comision != null && `comision ${r.platforma === 'airbnb' ? 'Airbnb' : 'Booking'} ${fmt(comision)} RON${com?.numar_factura ? ` (factura de comision ${com.numar_factura})` : ''}`,
      comision != null && `total plătit de client = ${fmt(Number(r.suma) + comision)} RON`,
      csv?.data_start && `sejur ${csv.data_start} – ${csv.data_sfarsit}`,
    ].filter(Boolean).join(' · ')
    out.push({
      sursa: 'rezervare', scor: 3,
      titlu: `Rezervare ${r.platforma === 'airbnb' ? 'Airbnb' : 'Booking'} ${r.cod_rezervare} · încasat net ${fmt(r.suma)} RON`,
      detalii: `${r.nume_oaspete || '—'} — suma din borderoul platformei${extra ? ` · ${extra}` : ''}`,
      suma: Number(r.suma), data: null, luna: lunaLbl(r.luna_id), potrivire: 'nume',
      href: lunaKey(r.luna_id) ? `/${d.firmaSlug}/${lunaKey(r.luna_id)}/5stardesk` : null,
    })
  }
  for (const doc of d.documente) {
    if (doc.modul === '5stardesk') continue  // facturile 5StarDesk sunt deja citite individual mai sus
    const n = potrivesteNume(nume, `${doc.furnizor || ''} ${doc.fisier_nume || ''}`)
    const s = sume.some(x => egal(x, doc.suma))
    if (!n && !(s && (nume.length === 0 || p.categorie === 'tranzactie_neidentificata'))) continue
    out.push({
      sursa: 'document', scor: (n ? 2 : 0) + (s ? 2 : 0),
      titlu: `${doc.fisier_nume || 'Document'}`,
      detalii: `${doc.tip_document || 'document'} · modul ${doc.modul || '—'}${doc.tranzactie_id ? ' · asociat unei tranzacții' : ''}`,
      suma: doc.suma != null ? Number(doc.suma) : null, data: doc.data_document, luna: lunaLbl(doc.luna_id),
      potrivire: [n && 'nume', s && 'sumă'].filter(Boolean).join(' + '),
      documentUrl: `/api/chitante/document?id=${doc.id}`,
    })
  }
  for (const f of d.asteptate) {
    const n = potrivesteNume(nume, f.furnizor)
    const s = sume.some(x => egal(x, f.suma))
    if (!n && !s) continue
    out.push({
      sursa: 'factura_asteptata', scor: (n ? 2 : 0) + (s ? 2 : 0),
      titlu: `Factură de asociat ${f.numar_document || ''} · ${f.furnizor || '—'} · ${fmt(f.suma)} RON`,
      detalii: `status: ${f.status}${f.data_factura ? ` · ${f.data_factura}` : ''}`,
      suma: f.suma != null ? Number(f.suma) : null, data: f.data_factura, luna: null,
      potrivire: [n && 'nume', s && 'sumă'].filter(Boolean).join(' + '),
      documentUrl: `/api/facturi-asteptate/download?id=${f.id}`,
    })
  }
  return out.sort((a, b) => b.scor - a.scor || String(b.data || '').localeCompare(String(a.data || ''))).slice(0, 15).map(({ scor, ...x }) => x)
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------------------------
// 3. Analiza AI a unei situatii, pe baza dovezilor gasite

export async function analizeazaPunct(p: Punct, dovezi: Dovada[], ctx: ContextFirma, rezumatMail: string | null) {
  const prompt = `${descriereContext(ctx)}
Azi: ${new Date().toISOString().slice(0, 10)}.

Contabilul a scris în mail (context general: ${rezumatMail || '—'}):
SITUAȚIA: ${JSON.stringify({ categorie: CATEGORII[p.categorie], titlu: p.titlu, persoana: p.persoana, suma: p.suma, sumaDiferenta: p.sumaDiferenta, data: p.data, platforma: p.platforma, cerere: p.cerere, citat: p.citat })}

Ce am găsit automat în ContaFlow pentru această situație (căutare după nume și sume, în toate lunile; listă goală = nimic găsit):
${JSON.stringify(dovezi.map(d => ({ sursa: d.sursa, titlu: d.titlu, detalii: d.detalii, suma: d.suma, data: d.data, luna: d.luna, potrivire: d.potrivire })))}

Spune dacă situația e deja rezolvată în platformă și, dacă nu, ce trebuie făcut concret.
Reguli:
- Cum se facturează cazările: factura client 5StarDesk trebuie emisă pe TOTALUL plătit de client = suma netă din borderou + comisionul platformei. Dacă factura a fost emisă doar pe suma netă din borderou, diferența de refacturat este exact comisionul (verifică în dovezi: "comision ... RON"). Spune explicit dacă diferența cerută de contabil = comisionul găsit. Dacă nu se potrivește, arată calculul.
- "rezolvat" doar dacă dovezile arată clar rezolvarea (ex. pentru o diferență de refacturat există o factură 5StarDesk nouă pentru același client cu exact suma diferenței; pentru o tranzacție neidentificată, tranzacția are document asociat).
- "partial" dacă e rezolvată doar o parte; "nerezolvat" dacă nu există nicio dovadă de rezolvare; "neclar" dacă dovezile se contrazic sau lipsesc informații.
- Folosește numere de factură, sume și date din dovezi. Nu inventa dovezi. Dacă o sumă din mail nu se potrivește cu ce vezi (ex. borderou vs factură), spune diferența exactă.
- Recomandarea: pași concreți (ex. "Emite în 5StarDesk factură către X de 33,17 lei pentru rezervarea HM..., apoi încarc-o în ContaFlow la 5StarDesk", "Asociază în Extras de cont tranzacția din 04.07 cu factura...", "Cere de la furnizor factura și încarc-o în Inbox Facturi").
- "raspuns" = o propoziție scurtă, la persoana I plural, de pus în mailul de răspuns către contabil (ce am făcut / ce vom face / ce explicație dăm).

Fii concis: maxim 3 propoziții pe câmp, maxim 4 pași. Răspunde DOAR cu JSON valid:
{"status":"rezolvat|partial|nerezolvat|neclar","constatare":"ce s-a găsit, 1-3 propoziții","recomandare":"ce trebuie făcut, 1-2 propoziții","pasi":["pas 1","pas 2"],"raspuns":"propoziția pentru contabil"}`

  type Raspuns = { status?: string; constatare?: string; recomandare?: string; pasi?: unknown[]; raspuns?: string }
  let a: Raspuns | null = null
  for (let incercare = 0; incercare < 2 && !a; incercare++) {
    const res = await client().messages.create({ model: MODEL_MAIL, max_tokens: 3000, messages: [{ role: 'user', content: prompt }] })
    a = jsonDin<Raspuns>(res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join(''))
  }
  if (!a) throw new Error('Analiza AI nu a întors un răspuns valid')
  const status = (['rezolvat', 'partial', 'nerezolvat', 'neclar'].includes(String(a.status)) ? a.status : 'neclar') as StatusPunct
  return {
    status,
    constatare: String(a.constatare || '').slice(0, 1200) || null,
    recomandare: String(a.recomandare || '').slice(0, 1200) || null,
    pasi: (Array.isArray(a.pasi) ? a.pasi : []).map(x => String(x).slice(0, 300)).slice(0, 6),
    raspuns: String(a.raspuns || '').slice(0, 600) || null,
  }
}

