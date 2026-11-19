// Modulul „Activități sociale" al proiectului AB Textile (întreprindere socială).
// Zonele (activitățile din planul de afaceri) sunt fixe aici, din catalogul cap-de-listă
// (docs/ab-textile-activitati-sociale.md). NU se inventează zone/indicatori — doar ce e în plan.
// Fiecare zonă = o linie în care se adaugă activități (AS-NNN/AN) și documente. Ciclul de viață al
// unei zone se ține pe an (deschisă / închisă pe an / închisă definitiv) în `zone_sociale_an`.

export const ANI_PROIECT = [2025, 2026, 2027, 2028] as const

// Pe ce se calculează indicatorul unei zone: numărul de beneficiari (persoane/familii) cumulat din
// activitățile validate, sau numărul de activități validate (evenimente: ateliere, campanii, donații…).
export type BazaIndicator = 'beneficiari' | 'activitati'

export interface ZonaSociala {
  cod: string          // ex. 'ZS-2.2'
  nr: string           // ex. '2.2' (numărul din plan)
  titlu: string
  tintaText: string    // formularea de lucru a țintei (din plan)
  tinta: number | null // ținta numerică anuală (null = activitate continuă, fără prag anual)
  unitate: string      // ex. 'tineri', 'familii', 'ateliere'
  baza: BazaIndicator
  indicator: string    // eticheta indicatorului
  continua?: boolean   // activitate permanentă (consiliere, participare la decizii, acces igienă)
}

// Cele 11 zone din plan (2.1 = Personal, 2.8 = raportul anual — nu sunt zone aici).
export const ZONE_SOCIALE: ZonaSociala[] = [
  { cod: 'ZS-2.2', nr: '2.2', titlu: 'Stagii de practică și voluntariat formativ', tintaText: 'min. 3 tineri în primele 12 luni, apoi ~4/an', tinta: 4, unitate: 'tineri', baza: 'beneficiari', indicator: 'Tineri în stagii / voluntariat' },
  { cod: 'ZS-2.3', nr: '2.3', titlu: 'Servicii gratuite sau reduse', tintaText: 'min. 6 familii/an', tinta: 6, unitate: 'familii', baza: 'beneficiari', indicator: 'Familii cu servicii gratuite / reduse' },
  { cod: 'ZS-2.4', nr: '2.4', titlu: 'Ateliere de dezvoltare personală și profesională', tintaText: '2 ateliere/an', tinta: 2, unitate: 'ateliere', baza: 'activitati', indicator: 'Ateliere organizate' },
  { cod: 'ZS-2.5', nr: '2.5', titlu: 'Campanii de incluziune și nediscriminare', tintaText: 'min. 1 campanie/an (2 în primii 2 ani)', tinta: 1, unitate: 'campanii', baza: 'activitati', indicator: 'Campanii de incluziune' },
  { cod: 'ZS-2.6', nr: '2.6', titlu: 'Ziua Curățeniei Comunei', tintaText: 'min. 1 activitate/an', tinta: 1, unitate: 'activități', baza: 'activitati', indicator: 'Ziua Curățeniei Comunei' },
  { cod: 'ZS-2.7', nr: '2.7', titlu: 'Donații de haine curățate', tintaText: 'min. 2 activități/an', tinta: 2, unitate: 'activități', baza: 'activitati', indicator: 'Acțiuni de donație' },
  { cod: 'ZS-2.9', nr: '2.9', titlu: 'Consiliere și acompaniament socioprofesional', tintaText: 'continuu, pentru angajați vulnerabili și voluntari', tinta: null, unitate: 'acțiuni', baza: 'activitati', indicator: 'Acțiuni de consiliere documentate', continua: true },
  { cod: 'ZS-2.10', nr: '2.10', titlu: 'Participarea la decizii', tintaText: 'mecanisme de consultare (feedback lunar, grupuri de discuții)', tinta: null, unitate: 'mecanisme', baza: 'activitati', indicator: 'Mecanisme de participare documentate', continua: true },
  { cod: 'ZS-2.11', nr: '2.11', titlu: 'Parteneriate pentru sprijin social', tintaText: 'min. 2 parteneriate active/an (AJOFM, DGASPC, asociații locale)', tinta: 2, unitate: 'parteneriate', baza: 'activitati', indicator: 'Parteneriate active' },
  { cod: 'ZS-2.12', nr: '2.12', titlu: 'Educație ecologică', tintaText: 'campanii anuale de informare (fizic + digital)', tinta: 1, unitate: 'campanii', baza: 'activitati', indicator: 'Campanii de educație ecologică' },
  { cod: 'ZS-2.13', nr: '2.13', titlu: 'Acces la igienă în comunități izolate', tintaText: 'servicii mobile / puncte de colectare, preluare-returnare prin site', tinta: null, unitate: 'acțiuni', baza: 'activitati', indicator: 'Acces la igienă în zone izolate', continua: true },
]

export function getZona(cod: string | null | undefined): ZonaSociala | undefined {
  return cod ? ZONE_SOCIALE.find(z => z.cod === cod) : undefined
}
export function zonaValida(cod: string | null | undefined): boolean {
  return !!getZona(cod)
}
const idxCatalog = (cod: string) => { const i = ZONE_SOCIALE.findIndex(z => z.cod === cod); return i < 0 ? 999 : i }

// Ordinea (prioritatea) zonelor pentru o firmă: rândurile din `zone_sociale` dau ordinea custom;
// zonele fără rând păstrează ordinea din catalog. Întoarce zonele sortate.
export interface OrdineRow { zona: string; ordine: number }
export function zoneOrdonate(ordine: OrdineRow[]): ZonaSociala[] {
  const map = new Map(ordine.map(o => [o.zona, o.ordine]))
  const cheie = (z: ZonaSociala) => map.has(z.cod) ? (map.get(z.cod) as number) : 1000 + idxCatalog(z.cod)
  return [...ZONE_SOCIALE].sort((a, b) => cheie(a) - cheie(b) || idxCatalog(a.cod) - idxCatalog(b.cod))
}
// Lista de coduri în ordinea curentă, cu o zonă mutată „sus" sau „jos" (schimb cu vecinul).
export function reordoneaza(coduriInOrdine: string[], cod: string, directie: 'sus' | 'jos'): string[] {
  const a = [...coduriInOrdine]
  const i = a.indexOf(cod)
  if (i < 0) return a
  const j = directie === 'sus' ? i - 1 : i + 1
  if (j < 0 || j >= a.length) return a
  ;[a[i], a[j]] = [a[j], a[i]]
  return a
}

// --- Statusul unei activități ---------------------------------------------------------------
export const STATUSURI_ACT = ['planificata', 'in_desfasurare', 'finalizata', 'validata'] as const
export type StatusAct = typeof STATUSURI_ACT[number]
export const ETICHETA_STATUS: Record<StatusAct, string> = {
  planificata: 'Planificată', in_desfasurare: 'În desfășurare', finalizata: 'Finalizată', validata: 'Validată',
}
export function statusActValid(s: unknown): StatusAct {
  return (STATUSURI_ACT as readonly string[]).includes(String(s)) ? s as StatusAct : 'planificata'
}
// Doar activitatea VALIDATĂ contribuie la indicator (nu crearea deciziei / adăugarea unui participant).
export const CONTRIBUIE_LA_INDICATOR = (s: StatusAct) => s === 'validata'

// --- Starea (ciclul de viață al) unei zone pe un an -----------------------------------------
export const STARI_ZONA = ['deschisa', 'inchisa_pe_an', 'inchisa_definitiv'] as const
export type StareZona = typeof STARI_ZONA[number]
export const ETICHETA_STARE: Record<StareZona, string> = {
  deschisa: 'Deschisă', inchisa_pe_an: 'Închisă pe an (realizată)', inchisa_definitiv: 'Închisă definitiv',
}
export function stareZonaValida(s: unknown): StareZona {
  return (STARI_ZONA as readonly string[]).includes(String(s)) ? s as StareZona : 'deschisa'
}

export interface StareZonaRow { zona: string; an: number; status: StareZona }

// O zonă e închisă definitiv dacă are, pe oricare an, status 'inchisa_definitiv'.
export function esteInchisaDefinitiv(stari: StareZonaRow[], cod: string): boolean {
  return stari.some(s => s.zona === cod && s.status === 'inchisa_definitiv')
}
// Starea efectivă a unei zone pe un an: definitiv > rândul anului > deschisă (implicit).
export function stareaZonei(stari: StareZonaRow[], cod: string, an: number): StareZona {
  if (esteInchisaDefinitiv(stari, cod)) return 'inchisa_definitiv'
  return stari.find(s => s.zona === cod && s.an === an)?.status || 'deschisa'
}

// Tipurile de documente care se atașează unei activități (Decizie / Anexă / Proces-verbal / Dovadă).
export const TIPURI_DOC_ACT = [
  { tip: 'decizie', label: 'Decizie de organizare' },
  { tip: 'anexa', label: 'Anexă (beneficiari / participanți)' },
  { tip: 'proces_verbal', label: 'Proces-verbal final' },
  { tip: 'dovada', label: 'Dovadă (foto, liste, confirmări)' },
  { tip: 'alt', label: 'Alt document' },
] as const
export function tipDocActValid(t: unknown): string {
  return TIPURI_DOC_ACT.some(x => x.tip === t) ? String(t) : 'dovada'
}
export function etichetaDocAct(t: string | null): string {
  return TIPURI_DOC_ACT.find(x => x.tip === t)?.label || 'Document'
}

// --- Activitatea ----------------------------------------------------------------------------
export interface Activitate {
  id: string; zona: string; cod: string; denumire: string; an: number
  perioada: string | null; obiectiv: string | null
  beneficiari_estimat: number | null; beneficiari_realizat: number | null
  responsabil: string | null; parteneri: string | null
  status: StatusAct; rezultate: string | null; validat_la: string | null; created_at: string
}

// Următorul cod AS-NNN/AN pentru o firmă, pe anul dat (secvență per an, din codurile existente).
export function codNou(existente: { cod: string }[], an: number): string {
  let max = 0
  const re = new RegExp(`^AS-(\\d+)/${an}$`)
  for (const a of existente) { const m = re.exec(a.cod || ''); if (m) max = Math.max(max, parseInt(m[1], 10)) }
  return `AS-${String(max + 1).padStart(3, '0')}/${an}`
}

export interface Indicator { realizat: number; tinta: number | null; procent: number | null; unitate: string }

// Indicatorul unei zone pe un an: din activitățile VALIDATE (fără cele planificate/în lucru).
// `beneficiari` → suma beneficiarilor realizați; `activitati` → numărul activităților validate.
export function indicatorZona(acts: Activitate[], zona: ZonaSociala, an: number): Indicator {
  const validate = acts.filter(a => a.zona === zona.cod && a.an === an && CONTRIBUIE_LA_INDICATOR(a.status))
  const realizat = zona.baza === 'beneficiari'
    ? validate.reduce((s, a) => s + (a.beneficiari_realizat || 0), 0)
    : validate.length
  const procent = zona.tinta ? Math.min(100, Math.round((realizat / zona.tinta) * 100)) : null
  return { realizat, tinta: zona.tinta, procent, unitate: zona.unitate }
}

// Rezumat pe un an: câte zone au ținta atinsă, câte activități (total / validate), nr. beneficiari.
export function rezumatAn(acts: Activitate[], stari: StareZonaRow[], an: number) {
  const aleAnului = acts.filter(a => a.an === an)
  const zoneActive = ZONE_SOCIALE.filter(z => stareaZonei(stari, z.cod, an) !== 'inchisa_definitiv')
  const cuTinta = zoneActive.filter(z => z.tinta != null)
  const atinse = cuTinta.filter(z => { const i = indicatorZona(acts, z, an); return (i.procent || 0) >= 100 }).length
  return {
    an,
    activitatiTotal: aleAnului.length,
    activitatiValidate: aleAnului.filter(a => CONTRIBUIE_LA_INDICATOR(a.status)).length,
    deValidat: aleAnului.filter(a => a.status === 'finalizata').length,
    zoneCuTinta: cuTinta.length,
    tinteAtinse: atinse,
  }
}
