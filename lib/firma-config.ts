export type ModuleSlug =
  | 'extras' | 'angajati' | 'acte-contabile' | 'dispozitie-plata'
  | 'facturi-chitanta' | 'facturi-restante' | 'raport-lunar'
  | 'emag' | 'trendyol'
  | 'booking-facturi' | 'booking-borderou'
  | 'airbnb-facturi' | 'airbnb-borderou'
  | '5stardesk'

export interface TaskDef {
  key: string
  label: string
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

export interface FirmaConfigDef {
  slug: string
  module: ModuleSlug[]
  legal: FirmaLegal
}

const COMUNE: ModuleSlug[] = [
  'extras', 'angajati', 'acte-contabile', 'dispozitie-plata',
  'facturi-chitanta', 'facturi-restante', 'raport-lunar',
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
  'raport-lunar': {
    slug: 'raport-lunar',
    label: 'Raport Lunar',
    description: 'Analiză automată încasări, cheltuieli și sold net',
    tasks: [],
  },
  emag: {
    slug: 'emag',
    label: 'eMAG Facturi',
    description: 'Avize de plată și facturi Dante International',
    tasks: [
      { key: 'emag.aviz_ro_inceput', label: 'Aviz plată Emag RO — început lună' },
      { key: 'emag.aviz_ro_jumatate', label: 'Aviz plată Emag RO — jumătate lună' },
      { key: 'emag.aviz_bg_inceput', label: 'Aviz plată Emag BG — început lună' },
      { key: 'emag.aviz_bg_jumatate', label: 'Aviz plată Emag BG — jumătate lună' },
      { key: 'emag.aviz_hu_sold', label: 'Aviz plată Emag HU — verificare Soldul meu' },
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
}

export const FIRMA_CONFIGS: Record<string, FirmaConfigDef> = {
  'ab-homes-invest': {
    slug: 'ab-homes-invest',
    module: [...COMUNE, 'emag', 'trendyol'],
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
    module: [...COMUNE, 'booking-facturi', 'booking-borderou', 'airbnb-facturi', 'airbnb-borderou', '5stardesk'],
    legal: {
      nrRegCom: 'J2025022705009',
      cif: '51540013',
      adresa: 'Str. Aleea Nicolina, Nr. 164U, Et. 5, Ap. 65, Iași',
      judet: 'IS',
      tara: 'RO',
    },
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

export function getLegal(slug: string): FirmaLegal | undefined {
  return FIRMA_CONFIGS[slug]?.legal
}
