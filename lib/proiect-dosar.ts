// Dosarul proiectului AB Textile (PROSOCIAL) - sectiunile de documente pe tot proiectul (nu pe luna),
// pentru controlul documentelor si vizita de monitorizare. Fiecare sectiune e un repository de fisiere in
// `documente` (modul 'dosar_*', luna_id null, firma = proiectul), cu un tip pe fiecare document; lista de
// tipuri e si lista „ce cere vizita” (cele cu `cerut`), bifata automat dupa ce s-a incarcat.
// Achizitiile raman modulul existent (ofertă → notă → recepție → dovadă) - aici doar le facem punte in meniu.

export type DosarSectiune = 'angajati' | 'activitate' | 'social'

export interface DosarTip {
  tip: string
  label: string
  // Cerut la vizita de monitorizare (24.11.2026) - intra in bifa „ce avem / ce lipseste”.
  cerut?: boolean
  hint?: string
}

export interface DosarConfig {
  sectiune: DosarSectiune
  modul: string
  label: string
  icon: string
  descriere: string
  // Eticheta campului text salvat pe `furnizor` (ex. numele angajatului sau titlul documentului).
  numeLabel: string
  numePlaceholder: string
  tipuri: DosarTip[]
  // Doar la Activitate: se pot aduce copii ale balantelor/extraselor din firma AB Textile (cerute si ele la vizita).
  copiazaDinFirma?: { slugFirma: string; mapari: { modul: string; tip: string; eticheta: string }[] }
}

export const DOSAR_CONFIGS: Record<DosarSectiune, DosarConfig> = {
  angajati: {
    sectiune: 'angajati',
    modul: 'dosar_angajati',
    label: 'Angajați',
    icon: 'users',
    descriere: 'Contracte de muncă, acte adiționale, Revisal și statele de plată — documentele de personal ale proiectului',
    numeLabel: 'Angajat',
    numePlaceholder: 'Nume angajat (ex. Popescu Ion)',
    tipuri: [
      { tip: 'contract_munca', label: 'Contract de muncă', cerut: true },
      { tip: 'act_aditional', label: 'Act adițional la contract', cerut: true },
      { tip: 'registru_salariati', label: 'Registru salariați (REGES / Revisal)', cerut: true, hint: 'Export PDF din Revisal' },
      { tip: 'raport_revisal', label: 'Raport per salariat (Revisal)', cerut: true },
      { tip: 'stat_plata', label: 'Stat de plată lunar', cerut: true },
      { tip: 'pontaj', label: 'Pontaj lunar' },
      { tip: 'alt_angajati', label: 'Alt document de personal' },
    ],
  },
  activitate: {
    sectiune: 'activitate',
    modul: 'dosar_activitate',
    label: 'Activitate',
    icon: 'briefcase',
    descriere: 'Autorizarea activității pe codul CAEN finanțat, balanțe contabile, extrase și dovezi ale obiectului de activitate',
    numeLabel: 'Document',
    numePlaceholder: 'Titlu document (ex. Balanță Octombrie 2026)',
    tipuri: [
      { tip: 'autorizare_caen', label: 'Autorizare / cod CAEN finanțat', cerut: true, hint: 'Dovada autorizării pe codul CAEN din planul de afaceri' },
      { tip: 'autorizatie_functionare', label: 'Autorizație de funcționare (ISU / DSP / mediu)' },
      { tip: 'balanta_contabila', label: 'Balanță contabilă lunară', cerut: true },
      { tip: 'extras_cont', label: 'Extras de cont', cerut: true },
      { tip: 'obiect_activitate', label: 'Dovadă obiect de activitate / plan de afaceri' },
      { tip: 'alt_activitate', label: 'Alt document de activitate' },
    ],
    copiazaDinFirma: {
      slugFirma: 'ab-textile',
      mapari: [
        { modul: 'acte_contabile', tip: 'balanta_contabila', eticheta: 'Balanță contabilă' },
        { modul: 'extras', tip: 'extras_cont', eticheta: 'Extras de cont' },
      ],
    },
  },
  social: {
    sectiune: 'social',
    modul: 'dosar_social',
    label: 'Social',
    icon: 'star',
    descriere: 'Misiunea socială asumată pentru 2026, dovezile realizării ei și activitățile/contractele cu caracter social',
    numeLabel: 'Document',
    numePlaceholder: 'Titlu document (ex. Raport misiune socială 2026)',
    tipuri: [
      { tip: 'misiune_sociala', label: 'Misiunea socială asumată 2026', cerut: true },
      { tip: 'dovada_misiune', label: 'Dovadă realizare misiune socială', cerut: true },
      { tip: 'activitate_sociala', label: 'Activitate cu caracter social (dovezi)' },
      { tip: 'contract_social', label: 'Contract cu caracter social' },
      { tip: 'alt_social', label: 'Alt document social' },
    ],
  },
}

export const DOSAR_SECTIUNI = Object.values(DOSAR_CONFIGS)

export function getDosarConfig(sectiune: string | null | undefined): DosarConfig | undefined {
  return sectiune ? DOSAR_CONFIGS[sectiune as DosarSectiune] : undefined
}

// Tipul implicit (primul din lista) si validarea unui tip pentru o sectiune.
export function tipValid(cfg: DosarConfig, tip: string | null | undefined): string {
  return cfg.tipuri.some(t => t.tip === tip) ? String(tip) : cfg.tipuri[0].tip
}

export function etichetaTip(cfg: DosarConfig, tip: string | null | undefined): string {
  return cfg.tipuri.find(t => t.tip === tip)?.label || cfg.tipuri[cfg.tipuri.length - 1].label
}
