export type ModuleSlug =
  | 'extras' | 'angajati' | 'acte-contabile' | 'dispozitie-plata'
  | 'facturi-chitanta' | 'facturi-restante' | 'inbox-facturi' | 'raport-lunar'
  | 'emag' | 'trendyol'
  | 'booking-facturi' | 'booking-borderou'
  | 'airbnb-facturi' | 'airbnb-borderou'
  | '5stardesk'
  | 'bonuri'
  | 'impozite'
  | 'raport-lunar-proiect'
  | 'obligatii-recurente'
  | 'achizitii'
  | 'mail-contabil'
  | 'plan-proiect'

export interface TaskDef {
  key: string
  label: string
  descriere?: string
  // Task scos in evidenta in lista (chenar + eticheta), ex. pasii ceruti de contabilitate
  important?: boolean
  // Doar pentru obligatii-recurente: cui se trimite si in ce zi a lunii URMATOARE perioadei
  // raportate e scadenta implicita (estimata din istoricul de corespondenta, ajustabila din UI
  // pe fiecare luna in parte - vezi obligatii_stari.scadenta).
  destinatar?: string
  ziScadentaLunaUrmatoare?: number
  // De unde vine efectiv documentul in fiecare luna (banca, Revisal, contabilitate etc.) - text fix,
  // afisat direct in UI, ca sa nu mai fie nevoie sa se tina minte din experienta.
  sursaInstructiuni?: string
  // true doar pentru obligatia care e un sablon completat de noi (azi doar Raportul de proiect,
  // care are deja propriul editor - vezi raport-lunar-proiect); restul sunt documente aduse de
  // altundeva (banca, Revisal, contabilitate), nu editate in ContaFlow.
  editabilLink?: string
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
  // true = luna e luna calendaristica (ex. "Octombrie 2026"), nu o luna contabila "1-30 Septembrie
  // (lucrat in Octombrie)". Pentru proiecte cu rutina lunara proprie, nu contabilitate.
  lunaCalendaristica?: boolean
  // Module valabile doar pe o perioada (luni de lucru AAAA-LL, inclusiv capetele): doar = modulul exista
  // numai in interval, fara = exista in afara lui. Lunile fara perioada au mereu modulul.
  perioadeModule?: Partial<Record<ModuleSlug, { doar?: [string, string]; fara?: [string, string] }>>
  // Facturile de cazare ale firmei se emit in Oblio (seria RH, din ApartPro), nu in 5StarDesk - in
  // „Airbnb · Rezervări” apare verificarea facturilor RH fata de rezervarile din CSV.
  facturiCazareOblio?: boolean
  // OP-urile (ordine de plata) platite din conturile firmei tin de proiect: nu intra in documentele extrasului
  // (pachetul pentru contabil, „Descarcă documentele”, PDF-ul Extras); raman in registrul OP-uri, pentru proiect
  opPentruProiect?: boolean
}

// Airbnb pe AB Textile pentru contabilitatea Octombrie-Decembrie 2026 = lunile de lucru Noiembrie 2026 -
// Ianuarie 2027 (cerut direct: „Airbnb va fi in firma AB Textile, nu in ABX ca pana acum”, „doar pana in
// ianuarie”). Booking ramane la ABXHomes. Din Februarie 2027 (contabilizarea lui Ianuarie) revine la ABXHomes.
const AIRBNB_LA_AB_TEXTILE: [string, string] = ['2026-11', '2027-01']

// Ordinea reflectă fluxul logic de lucru al unei luni de contabilitate, nu ordinea în care au
// fost adăugate modulele în cod: întâi platformele (marketplace / rezervări, adăugate separat per
// firmă, înaintea acestei liste comune), apoi Extrasul de cont - importat din CSV, el asociază singur
// facturile deja sosite în Inbox (folder local / Gmail) cu plățile, iar PDF-ul băncii se atașează
// separat, pentru contabil; documentele adăugate ulterior se asociază la redeschiderea Extrasului.
// Apoi ce n-are plată (Inbox, restante, chitanțe), dispozițiile, HR/acte, Impozite și, la final,
// Raportul lunar și mailul contabilului. Ordinea asta e și ordinea afișată în lista de module (poate
// fi suprascrisă manual per-utilizator din "Setează ordinea", care rămâne neschimbată de asta).
const COMUNE: ModuleSlug[] = [
  'extras', 'inbox-facturi', 'facturi-restante', 'facturi-chitanta', 'dispozitie-plata',
  'angajati', 'acte-contabile', 'bonuri', 'impozite', 'raport-lunar',
  // Mailurile contabilului (ce lipseste / e neclar) - verificate cu AI fata de datele din platforma.
  'mail-contabil',
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
  bonuri: {
    slug: 'bonuri',
    label: 'Bonuri',
    description: 'Bonuri fiscale (combustibil și altele) de asociat cu tranzacțiile din extras',
    tasks: [
      { key: 'bonuri.verificate', label: 'Bonuri verificate/atribuite' },
    ],
  },
  'raport-lunar': {
    slug: 'raport-lunar',
    label: 'Raport Lunar',
    description: 'Analiză automată a încasărilor, plăților și fluxului net bancar',
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
      { key: 'emag.aviz_heyblu_inceput', label: 'Notificare plată Heyblu — început lună', descriere: 'Financiar → Plăți: descarcă notificarea de plată „Încasări Revolving” (Heyblu) — prima jumătate' },
      { key: 'emag.aviz_heyblu_jumatate', label: 'Notificare plată Heyblu — jumătate lună', descriere: 'Financiar → Plăți: descarcă notificarea de plată „Încasări Revolving” (Heyblu) — a doua jumătate' },
      { key: 'emag.aviz_bg_inceput', label: 'Aviz plată Emag BG — început lună', descriere: 'Financiar → Plăți: descarcă avizul de plată (prima jumătate) — Bulgaria' },
      { key: 'emag.aviz_bg_jumatate', label: 'Aviz plată Emag BG — jumătate lună', descriere: 'Financiar → Plăți: descarcă avizul de plată (a doua jumătate) — Bulgaria' },
      { key: 'emag.facturi_bg', label: 'Facturi Emag BG descărcate', descriere: 'Deschide avizul de plată → în secțiunea Facturi pune numărul facturii + caută → descarcă documentul, pentru fiecare factură din aviz' },
      { key: 'emag.aviz_hu_inceput', label: 'Aviz plată Emag HU — început lună', descriere: 'Financiar → Soldul meu: selectează luna precedentă (ex: pe 02 ale lunii → luna anterioară; pe 17 → luna curentă), apoi descarcă avizul de plată (prima jumătate)' },
      { key: 'emag.aviz_hu_jumatate', label: 'Aviz plată Emag HU — jumătate lună', descriere: 'Financiar → Soldul meu: selectează luna precedentă (ex: pe 02 ale lunii → luna anterioară; pe 17 → luna curentă), apoi descarcă avizul de plată (a doua jumătate)' },
      { key: 'emag.facturi_hu', label: 'Facturi Emag HU descărcate', descriere: 'Deschide avizul de plată → în secțiunea Facturi pune numărul facturii + caută → descarcă documentul, pentru fiecare factură din aviz' },
      { key: 'emag.ecap_desfasuratoare', label: 'Desfășurătoare de încasare încărcate în eCap', important: true, descriere: 'Pentru contabilitate: încarcă în eCap desfășurătoarele de încasare ale lunii — avizele de plată eMAG RO / BG / HU și notificările Heyblu (început + jumătate de lună)' },
    ],
  },
  trendyol: {
    slug: 'trendyol',
    label: 'Trendyol',
    description: 'Documente și facturi Trendyol',
    tasks: [
      { key: 'trendyol.factura_incarcata', label: 'Factură Trendyol încărcată' },
      { key: 'trendyol.borderou_incarcat', label: 'Borderou Trendyol încărcat' },
      { key: 'trendyol.ecap_desfasuratoare', label: 'Desfășurătoare de încasare încărcate în eCap', important: true, descriere: 'Pentru contabilitate: încarcă în eCap desfășurătoarele de încasare Trendyol ale lunii (borderourile / rapoartele de plată)' },
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
    label: 'Airbnb · Facturi comision',
    description: 'Facturile de comision emise de Airbnb către tine, câte una pe rezervare',
    tasks: [
      { key: 'airbnb_facturi.incarcate', label: 'Facturi de comision Airbnb încărcate' },
    ],
  },
  'airbnb-borderou': {
    slug: 'airbnb-borderou',
    label: 'Airbnb · Rezervări',
    description: 'Rezervările lunii, din CSV-ul Airbnb (borderou) - plus facturile de vânzare emise clienților, unde e cazul',
    tasks: [
      { key: 'airbnb_borderou.incarcat', label: 'Borderou CSV Airbnb încărcat (rezervările lunii)' },
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
    description: 'Formular Word precompletat, separat pentru fiecare lună, cu versiuni păstrate la fiecare generare',
    tasks: [
      { key: 'raport_lunar_proiect.actualizat', label: 'Raport lunar actualizat' },
    ],
  },
  'obligatii-recurente': {
    slug: 'obligatii-recurente',
    label: 'Obligații recurente',
    description: 'Ce trebuie trimis lunar și către cine — scadențe estimate din istoricul de corespondență, ajustabile aici',
    tasks: [
      { key: 'obligatie.salarii_op', label: 'Salarii + OP-uri + dovadă creditare', destinatar: 'Prosocial', ziScadentaLunaUrmatoare: 20,
        sursaInstructiuni: 'Inițiezi plata salariilor + OP-uri din Internet Banking, apoi trimiți dovada creditării contului de grant + poza tranzacțiilor inițiate.' },
      { key: 'obligatie.reges', label: 'Reges + stat + pontaj + centralizator contribuții', destinatar: 'Prosocial', ziScadentaLunaUrmatoare: 8,
        sursaInstructiuni: 'Extras Reges din Revisal (export PDF), plus stat de plată + pontaj + centralizator contribuții — cerute de la contabilitate (Orieda), dacă nu le ai deja.' },
      { key: 'obligatie.acte_contabile', label: 'Acte contabile (balanță + registru jurnal)', destinatar: 'Prosocial', ziScadentaLunaUrmatoare: 18,
        sursaInstructiuni: 'Balanța de verificare și registrul jurnal ale lunii — se cer de la Orieda Office.' },
      { key: 'obligatie.extras_cont', label: 'Extras de cont al perioadei', destinatar: 'Prosocial', ziScadentaLunaUrmatoare: 18,
        sursaInstructiuni: 'Descarcă din Internet Banking (Banca Transilvania) → Extrase de cont, pentru intervalul lunii raportate.' },
      { key: 'obligatie.raport_proiect', label: 'Raport de proiect lunar', destinatar: 'Prosocial', ziScadentaLunaUrmatoare: 18,
        sursaInstructiuni: 'Se completează direct în modulul „Raport lunar" al proiectului — nu se încarcă manual aici.', editabilLink: 'raport-lunar-proiect' },
      { key: 'obligatie.acte_orieda', label: 'Acte proiect pentru contabilitate', destinatar: 'Orieda Office', ziScadentaLunaUrmatoare: 15,
        sursaInstructiuni: 'Trimiți către Orieda documentele lunii (facturi, extrase, acte) necesare pentru înregistrarea contabilă a proiectului.' },

    ],
  },
  achizitii: {
    slug: 'achizitii',
    label: 'Achiziții',
    description: 'Aparate, materiale și servicii cumpărate din proiect — ofertă → notă semnată → plată → dovadă',
    tasks: [],
  },
  'plan-proiect': {
    slug: 'plan-proiect',
    label: 'Plan & AI proiect',
    description: 'Întreabă proiectul (AI pe planul de afaceri și bugetul în vigoare), activitățile și obligațiile din plan, indicatori și tranșe',
    tasks: [],
  },
  'mail-contabil': {
    slug: 'mail-contabil',
    label: 'Mail contabil',
    description: 'Mailurile contabilului, verificate cu AI: ce e deja rezolvat în platformă și ce mai e de făcut',
    tasks: [],
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
    // 5StarDesk -> Airbnb (intai Borderoul - din el se creeaza rezervarile -, apoi Facturile de comision
    // potrivite pe ele) -> Booking: ordinea platformelor de rezervare, fiecare genereaza
    // facturile de vânzare ale lunii, utile deja adunate până se ajunge la Extras de cont.
    module: ['5stardesk', 'airbnb-borderou', 'airbnb-facturi', 'booking-facturi', ...COMUNE],
    perioadeModule: { 'airbnb-borderou': { fara: AIRBNB_LA_AB_TEXTILE }, 'airbnb-facturi': { fara: AIRBNB_LA_AB_TEXTILE } },
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
    module: ['airbnb-borderou', 'airbnb-facturi', ...COMUNE],
    perioadeModule: { 'airbnb-borderou': { doar: AIRBNB_LA_AB_TEXTILE }, 'airbnb-facturi': { doar: AIRBNB_LA_AB_TEXTILE } },
    facturiCazareOblio: true,
    opPentruProiect: true,
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
    module: ['plan-proiect', 'raport-lunar-proiect', 'obligatii-recurente', 'achizitii'],
    lunaCalendaristica: true,
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

// luna = luna de lucru (AAAA-LL sau AAAA-LL-ZZ). Fara luna: toate modulele firmei, indiferent de perioada.
export function modulInLuna(slug: string, modul: string, luna?: string | null): boolean {
  const config = FIRMA_CONFIGS[slug]
  if (!config?.module.includes(modul as ModuleSlug)) return false
  const p = config.perioadeModule?.[modul as ModuleSlug], l = String(luna || '').slice(0, 7)
  if (!p || !/^\d{4}-\d{2}$/.test(l)) return true
  const inInterval = (i: [string, string]) => l >= i[0] && l <= i[1]
  return (!p.doar || inInterval(p.doar)) && (!p.fara || !inInterval(p.fara))
}

export function getFirmaModuleSlugs(slug: string, luna?: string | null): ModuleSlug[] {
  return (FIRMA_CONFIGS[slug]?.module || []).filter(m => modulInLuna(slug, m, luna))
}

export function getFirmaModules(slug: string, luna?: string | null): ModuleDef[] {
  return getFirmaModuleSlugs(slug, luna).map(m => MODULE_DEFS[m]).filter(Boolean)
}

export function getFirmaTotalTasks(slug: string, luna?: string | null): number {
  return getFirmaModules(slug, luna).reduce((sum, mod) => sum + mod.tasks.length, 0)
}

// getLegal/getProprietari au fost migrate în DB (tabelele firme + proprietari) —
// FIRMA_CONFIGS.legal/.proprietari de mai sus rămân doar ca valori inițiale de seed.

export function esteLunaCalendaristica(slug: string | null | undefined): boolean {
  return !!(slug && FIRMA_CONFIGS[slug]?.lunaCalendaristica)
}
