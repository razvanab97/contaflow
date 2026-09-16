export type ModuleSlug =
  | 'extras' | 'angajati' | 'acte-contabile' | 'dispozitie-plata'
  | 'facturi-chitanta' | 'facturi-restante' | 'inbox-facturi' | 'raport-lunar'
  | 'emag' | 'trendyol'
  | 'booking-facturi' | 'booking-borderou'
  | 'airbnb-facturi' | 'airbnb-borderou'
  | '5stardesk'
  | 'impozite'
  | 'raport-lunar-proiect'

export interface TaskDef {
  key: string
  label: string
  descriere?: string
}

export interface ModuleDef {
  slug: ModuleSlug
  label: string
  description: string
  tasks: TaskDef[]
  linkDirect?: string
}

export interface FirmaLegal {
  nrRegCom: string
  cif: string
  adresa: string
  judet: string
  tara: string
}

export interface Proprietar {
  id?: string
  nume: string
  serieCi: string
  numarCi: string
}

export interface FirmaConfigDef {
  slug: string
  module: ModuleSlug[]
  legal: FirmaLegal
  proprietari?: Proprietar[]
}

// Ordinea reflectă fluxul logic de lucru al unei luni de contabilitate, nu ordinea în care au
// fost adăugate modulele în cod: întâi se adună documentele de venit (marketplace-urile, adăugate
// separat per firmă, înaintea acestei liste comune) și de cheltuială (Inbox Facturi/restante/
// chitanțe), apoi se emit dispozițiile de plată pe baza lor, apoi HR/acte (independente), abia
// apoi Extras de cont (are nevoie ca documentele de mai sus să existe deja, ca să aibă ce asocia
// pe tranzacții), apoi Impozite (calculate pe baza lunii deja complete) și, la final, Raportul
// lunar - rezumatul, ultimul pas. Ordinea asta e și ordinea afișată în lista de module (poate fi
// suprascrisă manual per-utilizator din "Setează ordinea", care rămâne neschimbată de asta).
const COMUNE: ModuleSlug[] = [
  'inbox-facturi', 'facturi-restante', 'facturi-chitanta', 'dispozitie-plata',
  'angajati', 'acte-contabile', 'extras', 'impozite', 'raport-lunar',
]

export const MODULE_DEFS: Record<ModuleSlug, ModuleDef> = {
  extras: {
    slug: 'extras',
    label: 'Extras de cont',
    description: 'Extrase bancare procesate și tranzacții documentate',
    tasks: [
      { key: 'extras.incarcat', label: 'Extras de cont încărcat' },
      { key: 'extras.tranzactii_documentate', label: 'Tranzacții documentate' },
    ],
    linkDirect: 'extras',
  },
  angajati: {
    slug: 'angajati',
    label: 'Documente angajați',
    description: 'Pontaj, stat de plată și documente HR',
    tasks: [
      { key: 'angajati.pontaj', label: 'Pontaj lunar semnat' },
      { key: 'angajati.stat_plata', label: 'Stat de plată' },
      { key: 'angajati.documente_ok', label: 'Documente angajați la zi' },
    ],
  },
  'acte-contabile': {
    slug: 'acte-contabile',
    label: 'Acte contabile',
    description: 'Acte și documente pentru dosar contabil',
    tasks: [
      { key: 'acte.pregatite', label: 'Acte contabile pregătite' },
    ],
  },
  'dispozitie-plata': {
    slug: 'dispozitie-plata',
    label: 'Dispoziție de plată',
    description: 'Generator numerotat de dispoziții de plată',
    tasks: [
      { key: 'dispozitie.emise', label: 'Dispoziții de plată emise' },
    ],
  },
  'facturi-chitanta': {
    slug: 'facturi-chitanta',
    label: 'Facturi + chitanță',
    description: 'Facturi asociate cu chitanța pentru plăți cash',
    tasks: [
      { key: 'facturi_chitanta.asociate', label: 'Facturi asociate cu chitanțe' },
    ],
  },
  'facturi-restante': {
    slug: 'facturi-restante',
    label: 'Facturi restante',
    description: 'Facturi neachitate din luna curentă',
    tasks: [
      { key: 'facturi_restante.verificate', label: 'Facturi restante verificate' },
    ],
  },
  'inbox-facturi': {
    slug: 'inbox-facturi',
    label: 'Inbox Facturi',
    description: 'Facturi preluate din email/Oblio și repartizate automat pe firmă',
    tasks: [
      { key: 'inbox_facturi.verificate', label: 'Facturi din inbox verificate' },
    ],
  },
  'raport-lunar': {
    slug: 'raport-lunar',
    label: 'Raport Lunar',
    description: 'Analiză automată încasări, cheltuieli și sold net',
    tasks: [],
  },
  impozite: {
    slug: 'impozite',
    label: 'Plată impozite',
    description: 'Sume datorate și status plată pentru impozitele lunare',
    tasks: [
      { key: 'impozite.impozit_venit', label: 'Impozit pe veniturile microîntreprinderii' },
      { key: 'impozite.tva', label: 'TVA' },
      { key: 'impozite.cas_cass', label: 'CAS + CASS angajați' },
      { key: 'impozite.cladiri_terenuri', label: 'Impozit clădiri/terenuri' },
    ],
  },
  emag: {
    slug: 'emag',
    label: 'eMAG Facturi',
    description: 'Avize de plată și facturi Dante International',
    tasks: [
      { key: 'emag.aviz_ro_inceput', label: 'Aviz plată Emag RO — început lună', descriere: 'Financiar → Plăți: descarcă avizul de plată (prima jumătate)' },
      { key: 'emag.aviz_ro_jumatate', label: 'Aviz plată Emag RO — jumătate lună', descriere: 'Financiar → Plăți: descarcă avizul de plată (a doua jumătate)' },
      { key: 'emag.facturi_ro', label: 'Facturi Emag RO descărcate', descriere: 'Deschide avizul de plată → în secțiunea Facturi pune numărul facturii + caută → descarcă documentul, pentru fiecare factură din aviz' },
      { key: 'emag.aviz_bg_inceput', label: 'Aviz plată Emag BG — început lună', descriere: 'Financiar → Plăți: descarcă avizul de plată (prima jumătate) — Bulgaria' },
      { key: 'emag.aviz_bg_jumatate', label: 'Aviz plată Emag BG — jumătate lună', descriere: 'Financiar → Plăți: descarcă avizul de plată (a doua jumătate) — Bulgaria' },
      { key: 'emag.facturi_bg', label: 'Facturi Emag BG descărcate', descriere: 'Deschide avizul de plată → în secțiunea Facturi pune numărul facturii + caută → descarcă documentul, pentru fiecare factură din aviz' },
      { key: 'emag.aviz_hu_inceput', label: 'Aviz plată Emag HU — început lună', descriere: 'Financiar → Soldul meu: selectează luna precedentă (ex: pe 02 ale lunii → luna anterioară; pe 17 → luna curentă), apoi descarcă avizul de plată (prima jumătate)' },
      { key: 'emag.aviz_hu_jumatate', label: 'Aviz plată Emag HU — jumătate lună', descriere: 'Financiar → Soldul meu: selectează luna precedentă (ex: pe 02 ale lunii → luna anterioară; pe 17 → luna curentă), apoi descarcă avizul de plată (a doua jumătate)' },
      { key: 'emag.facturi_hu', label: 'Facturi Emag HU descărcate', descriere: 'Deschide avizul de plată → în secțiunea Facturi pune numărul facturii + caută → descarcă documentul, pentru fiecare factură din aviz' },
    ],
  },
  trendyol: {
    slug: 'trendyol',
    label: 'Trendyol',
    description: 'Documente și facturi Trendyol',
    tasks: [
      { key: 'trendyol.factura_incarcata', label: 'Factură Trendyol încărcată' },
      { key: 'trendyol.borderou_incarcat', label: 'Borderou Trendyol încărcat' },
    ],
  },
  'booking-facturi': {
    slug: 'booking-facturi',
    label: 'Booking · Facturi',
    description: 'Facturi individuale din platforma Booking.com',
    tasks: [
      { key: 'booking_facturi.incarcate', label: 'Facturi Booking încărcate' },
    ],
  },
  'booking-borderou': {
    slug: 'booking-borderou',
    label: 'Booking · Borderou',
    description: 'Centralizator lunar descărcat din Booking.com',
    tasks: [
      { key: 'booking_borderou.incarcat', label: 'Borderou Booking încărcat' },
    ],
  },
  'airbnb-facturi': {
    slug: 'airbnb-facturi',
    label: 'Airbnb · Facturi',
    description: 'Facturi individuale din platforma Airbnb',
    tasks: [
      { key: 'airbnb_facturi.incarcate', label: 'Facturi Airbnb încărcate' },
    ],
  },
  'airbnb-borderou': {
    slug: 'airbnb-borderou',
    label: 'Airbnb · Borderou',
    description: 'Centralizator lunar descărcat din Airbnb',
    tasks: [
      { key: 'airbnb_borderou.incarcat', label: 'Borderou Airbnb încărcat' },
    ],
  },
  '5stardesk': {
    slug: '5stardesk',
    label: '5StarDesk',
    description: 'Facturi din platforma 5StarDesk',
    tasks: [
      { key: '5stardesk.factura_incarcata', label: 'Factură 5StarDesk încărcată' },
    ],
  },
  'raport-lunar-proiect': {
    slug: 'raport-lunar-proiect',
    label: 'Raport lunar',
    description: 'Documentul Word de raportare lunară pentru proiectul european — un singur fișier, actualizat în fiecare lună (nu se acumulează versiuni vechi)',
    tasks: [
      { key: 'raport_lunar_proiect.actualizat', label: 'Raport lunar actualizat' },
    ],
  },
}

export const FIRMA_CONFIGS: Record<string, FirmaConfigDef> = {
  'ab-homes-invest': {
    slug: 'ab-homes-invest',
    // eMAG/Trendyol întâi - genereaza facturile de vânzare ale lunii, utile deja adunate până se
    // ajunge la Extras de cont.
    module: ['emag', 'trendyol', ...COMUNE],
    legal: {
      nrRegCom: 'J22/3035/2023',
      cif: 'RO48872594',
      adresa: 'Sat Erbiceni Com. Erbiceni, Vol. 7, Poz. 051',
      judet: 'IS',
      tara: 'RO',
    },
  },
  abxhomes: {
    slug: 'abxhomes',
    // 5StarDesk -> Airbnb -> Booking: ordinea platformelor de rezervare, fiecare genereaza
    // facturile de vânzare ale lunii, utile deja adunate până se ajunge la Extras de cont.
    module: ['5stardesk', 'airbnb-facturi', 'airbnb-borderou', 'booking-facturi', ...COMUNE],
    legal: {
      nrRegCom: 'J2025022705009',
      cif: '51540013',
      adresa: 'Str. Aleea Nicolina, Nr. 164U, Et. 5, Ap. 65, Iași',
      judet: 'IS',
      tara: 'RO',
    },
    proprietari: [
      { nume: 'Grumăzescu Angela', serieCi: 'MX', numarCi: '864860' },
      { nume: 'Bucșa Radu', serieCi: 'ZC', numarCi: '553054' },
      { nume: 'Bordeanu Dănuț', serieCi: 'MZ', numarCi: '699302' },
    ],
  },
  'ab-textile': {
    slug: 'ab-textile',
    module: [...COMUNE],
    legal: {
      nrRegCom: 'J2025073349009',
      cif: '52575850',
      adresa: 'Sat Erbiceni Com. Erbiceni, Vol. 7, Poz. 051',
      judet: 'IS',
      tara: 'RO',
    },
  },
  'proiect-ab-textile': {
    slug: 'proiect-ab-textile',
    // Nu e o firmă reală (fără CUI/ONRC) - e un proiect european derulat de AB Textile SRL,
    // cu propriile documente lunare de raportat, distincte de contabilitatea firmei.
    module: ['raport-lunar-proiect'],
    legal: {
      nrRegCom: '',
      cif: '',
      adresa: '',
      judet: '',
      tara: '',
    },
  },
}

export function getFirmaConfig(slug: string): FirmaConfigDef | undefined {
  return FIRMA_CONFIGS[slug]
}

export function getFirmaModules(slug: string): ModuleDef[] {
  const config = FIRMA_CONFIGS[slug]
  if (!config) return []
  return config.module.map(m => MODULE_DEFS[m]).filter(Boolean)
}

export function getFirmaTotalTasks(slug: string): number {
  return getFirmaModules(slug).reduce((sum, mod) => sum + mod.tasks.length, 0)
}

// getLegal/getProprietari au fost migrate în DB (tabelele firme + proprietari) —
// FIRMA_CONFIGS.legal/.proprietari de mai sus rămân doar ca valori inițiale de seed.
