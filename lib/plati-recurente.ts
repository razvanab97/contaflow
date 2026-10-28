// Calendarul platilor recurente ale unei firme: ce se plateste, intre ce zile ale lunii, si unde se face. Alimenteaza
// „De facut” (Dashboard si asistentul AI) - un reminder pe fiecare plata, cu termen, pana e bifata ca platita.
// Se schimba aici (zilele, textele), nu din interfata.
export interface PlataRecurenta {
  key: string                  // cheia din task_stari (bifa „platit” a lunii in care incepe fereastra): „plati.<key>”
  titlu: string
  detaliu: string
  deLaZi: number               // ziua din luna calendaristica de la care apare reminderul
  termenZi: number             // ziua termenului
  termenLunaUrmatoare?: boolean // termenul cade in luna urmatoare celei in care incepe fereastra (ex. 25 -> 1)
  modul: string                // pagina din luna catre care duce reminderul (linkDirect / slug)
  icon: string
  // se bifeaza singura cand toate task-urile modulului respectiv sunt gata (ex. Plata impozite)
  gataCandModul?: string
}

export const PLATI_RECURENTE: Record<string, PlataRecurenta[]> = {
  'ab-textile': [
    { key: 'salarii', titlu: 'Plată salarii', detaliu: 'Salariile se plătesc până pe 15 ale lunii', deLaZi: 8, termenZi: 15, modul: 'angajati', icon: 'users' },
    { key: 'taxe_stat', titlu: 'Plată taxe și impozite la stat', detaliu: 'Între 25 și 1 ale lunii următoare', deLaZi: 25, termenZi: 1, termenLunaUrmatoare: true, modul: 'impozite', icon: 'percent', gataCandModul: 'impozite' },
    { key: 'chirie', titlu: 'Plată chirie', detaliu: 'Între 25 și 1 ale lunii următoare', deLaZi: 25, termenZi: 1, termenLunaUrmatoare: true, modul: 'facturi-restante', icon: 'home' },
    { key: 'contabilitate', titlu: 'Plată factură contabilitate', detaliu: 'Între 25 și 1 ale lunii următoare', deLaZi: 25, termenZi: 1, termenLunaUrmatoare: true, modul: 'facturi-restante', icon: 'fileText' },
  ],
}

const MS_ZI = 86400000
const zi = (an: number, luna0: number, d: number) => {
  // luna0 poate iesi din 0..11 (Date.UTC o normalizeaza); ziua se taie la ultima zi a lunii
  const ultima = new Date(Date.UTC(an, luna0 + 1, 0)).getUTCDate()
  return Date.UTC(an, luna0, Math.min(d, ultima))
}

export interface AparitiePlata { luna: string; start: number; termen: number }

// Aparitia care conteaza azi pentru o plata: cea mai noua care a inceput deja; daca cea din luna curenta n-a
// inceput inca, ramane cea din luna trecuta (cat timp nu e bifata, e depasita). `azi` = {an, luna (1-12), zi}.
export function aparitiiPlata(r: PlataRecurenta, azi: { an: number; luna: number; zi: number }): AparitiePlata[] {
  const astazi = Date.UTC(azi.an, azi.luna - 1, azi.zi)
  const out: AparitiePlata[] = []
  for (const decalaj of [0, -1]) {
    const m0 = azi.luna - 1 + decalaj
    const start = zi(azi.an, m0, r.deLaZi)
    const termen = zi(azi.an, m0 + (r.termenLunaUrmatoare ? 1 : 0), r.termenZi)
    const d = new Date(Date.UTC(azi.an, m0, 1))
    out.push({ luna: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, start, termen })
  }
  return out.filter(a => a.start <= astazi || a === out[1]).slice(0, 2)
}

export const zilePanaLa = (termen: number, azi: { an: number; luna: number; zi: number }) =>
  Math.round((termen - Date.UTC(azi.an, azi.luna - 1, azi.zi)) / MS_ZI)
