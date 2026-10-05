// Recunoaste un aviz de plata eMAG din textul PDF-ului si alege singur categoria (task-ul) in care intra:
// piata (RO / BG / HU), Heyblu („Incasari Revolving”, fara facturi) si jumatatea de luna (inceput / jumatate).
// Fara AI: avizele eMAG au acelasi format in toate cele 3 limbi (antet bilingv cu „Payment notice”).

export type PiataAviz = 'ro' | 'bg' | 'hu' | 'heyblu'

export interface AvizClasificat {
  numar: string            // ex. 2027-4100179446
  data: string             // AAAA-LL-ZZ
  piata: PiataAviz
  jumatate: 'inceput' | 'jumatate'
  taskKey: string          // ex. emag.aviz_ro_inceput
}

export const ETICHETA_PIATA: Record<PiataAviz, string> = { ro: 'eMAG RO', bg: 'eMAG BG', hu: 'eMAG HU', heyblu: 'Heyblu' }

export function esteAvizPlata(text: string) {
  return /payment notice/i.test(text) && /payment notification/i.test(text)
}

export function clasificaAviz(text: string): AvizClasificat | null {
  if (!esteAvizPlata(text)) return null
  const numar = text.match(/\b(\d{4}-41\d{8})\b/)?.[1]
  const d = text.match(/from\s+(\d{2})\.(\d{2})\.(\d{4})/i)
  if (!numar || !d) return null
  const data = `${d[3]}-${d[2]}-${d[1]}`

  // Moneda de pe randul Total decide piata (BG = EUR, HU = HUF); textul in bulgara / maghiara confirma
  let piata: PiataAviz
  if (/\bHUF\b/.test(text) || /Utalási részletező/i.test(text)) piata = 'hu'
  else if (/[А-Яа-я]{3,}/.test(text) && /\bEUR\b/.test(text)) piata = 'bg'
  else piata = 'ro'
  // Notificarea Heyblu: aviz RO doar cu „Incasari Revolving”, fara nicio factura eMAG (serii *-MKTP-*)
  if (piata === 'ro' && /revolving/i.test(text) && !/\b[A-Z]{1,2}-MKTP-\d+/.test(text)) piata = 'heyblu'

  // Platile vin pe 2-3 ale lunii (inceput) si pe 17-18 (jumatate)
  const jumatate = Number(d[1]) < 15 ? 'inceput' : 'jumatate'
  return { numar, data, piata, jumatate, taskKey: `emag.aviz_${piata}_${jumatate}` }
}

// Luna (AAAA-LL) in care trebuie sa cada avizele pentru luna de lucru: luna precedenta, sau aceeasi luna
// la firmele cu luna calendaristica
export function lunaAvizeAsteptata(lunaLucru: string, calendaristica: boolean) {
  const [y, m] = lunaLucru.slice(0, 7).split('-').map(Number)
  if (calendaristica) return `${y}-${String(m).padStart(2, '0')}`
  const p = new Date(Date.UTC(y, m - 2, 1))
  return p.toISOString().slice(0, 7)
}
