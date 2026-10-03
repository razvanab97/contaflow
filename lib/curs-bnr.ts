// Cursul oficial BNR (lei pentru 1 unitate de valuta), din fisierele anuale publicate de BNR.
// Pentru o zi fara curs (weekend, sarbatoare) se foloseste ultimul curs publicat inainte.
type CursuriZi = Record<string, number>          // valuta -> lei
const cache = new Map<number, { la: number; zile: [string, CursuriZi][] }>()
const TTL = 6 * 3600_000

async function an(year: number): Promise<[string, CursuriZi][]> {
  const c = cache.get(year)
  if (c && Date.now() - c.la < TTL) return c.zile
  const res = await fetch(`https://curs.bnr.ro/files/xml/years/nbrfxrates${year}.xml`, { next: { revalidate: 21600 } })
  if (!res.ok) throw new Error(`Cursul BNR ${year} nu poate fi descărcat (${res.status})`)
  const xml = await res.text()
  const zile: [string, CursuriZi][] = []
  for (const m of xml.matchAll(/<Cube date="(\d{4}-\d{2}-\d{2})">([\s\S]*?)<\/Cube>/g)) {
    const r: CursuriZi = {}
    for (const x of m[2].matchAll(/<Rate currency="([A-Z]{3})"(?: multiplier="(\d+)")?>([\d.]+)<\/Rate>/g)) {
      r[x[1]] = Number(x[3]) / (x[2] ? Number(x[2]) : 1)
    }
    zile.push([m[1], r])
  }
  zile.sort((a, b) => a[0].localeCompare(b[0]))
  if (!zile.length) throw new Error(`Fișierul BNR ${year} nu conține cursuri`)
  cache.set(year, { la: Date.now(), zile })
  return zile
}

// Incarca o data cursurile pentru toti anii necesari; intoarce o functie sincrona de conversie.
export async function cursuriBnr(date: string[]): Promise<(data: string, valuta: string) => number | null> {
  const ani = new Set<number>()
  for (const d of date) { const y = Number(d.slice(0, 4)); if (y) { ani.add(y); ani.add(y - 1) } }
  const toate: [string, CursuriZi][] = []
  for (const y of [...ani].sort()) {
    try { toate.push(...await an(y)) } catch { /* anul precedent poate lipsi; anul cerut e verificat mai jos */ }
  }
  toate.sort((a, b) => a[0].localeCompare(b[0]))
  return (data: string, valuta: string) => {
    const v = (valuta || 'RON').toUpperCase()
    if (v === 'RON') return 1
    // ultimul curs publicat <= data tranzactiei (cautare binara)
    let lo = 0, hi = toate.length - 1, gasit = -1
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (toate[mid][0] <= data) { gasit = mid; lo = mid + 1 } else hi = mid - 1 }
    for (let i = gasit; i >= 0 && i > gasit - 10; i--) { const r = toate[i][1][v]; if (r) return r }
    return null
  }
}
