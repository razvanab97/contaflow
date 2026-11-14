// Verificarea facturilor de cazare RH (Oblio, AB Textile, emise din ApartPro) fata de rezervarile din CSV-ul
// Airbnb al lunii - echivalentul verificarii 5StarDesk de la ABXHomes. Factura RH are suma BRUTA a rezervarii
// (incasarea + comisionul Airbnb = „castiguri_brute” din CSV); clientul e oaspetele (sau firma, la facturi pe PJ).
// Lista facturilor din Oblio nu contine codul rezervarii, deci potrivirea e dupa suma + numele clientului.

export interface RezervareRh { id: string; cod_confirmare: string; oaspete: string | null; suma: number | null; taxa_servicii: number | null; castiguri_brute: number | null; data_start?: string | null; data_sfarsit?: string | null }
export interface FacturaRhLista { numar: string; data: string; total: number | null; moneda: string; client: string; anulata: boolean; link: string | null }
// ok = suma + numele; nume = aceeasi suma, alt client (ex. factura pe firma); suma = acelasi client, alta suma; lipsa = nicio factura
export type StareRh = 'ok' | 'nume' | 'suma' | 'lipsa'
export interface RandRh { rezervare: RezervareRh; brut: number | null; factura: FacturaRhLista | null; stare: StareRh; diferenta: number | null }

const r2 = (n: number) => Math.round(n * 100) / 100
export const brutRezervare = (r: RezervareRh) => r.castiguri_brute != null ? Number(r.castiguri_brute) : r.suma != null ? r2(Number(r.suma) + Number(r.taxa_servicii || 0)) : null
const cuvinte = (s: unknown) => new Set(String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2))
// cate din cuvintele numelui mai scurt apar in celalalt („Vlad Tudor Tabacaru” ~ „TABACARU VLAD” = 1)
export function asemanareNume(a: unknown, b: unknown) {
  const x = cuvinte(a), y = cuvinte(b)
  if (!x.size || !y.size) return 0
  let c = 0; x.forEach(w => { if (y.has(w)) c++ })
  return c / Math.min(x.size, y.size)
}

export function potrivesteFacturiRh(rezervari: RezervareRh[], facturi: FacturaRhLista[]): RandRh[] {
  const valide = facturi.filter(f => !f.anulata && f.total != null)
  const brute = new Map(rezervari.map(r => [r.id, brutRezervare(r)]))
  const sumaEgala = (r: RezervareRh, f: FacturaRhLista) => { const b = brute.get(r.id); return b != null && Math.abs(Number(f.total) - b) <= 0.05 }
  const scor = (r: RezervareRh, f: FacturaRhLista) => {
    const nume = asemanareNume(r.oaspete, f.client), suma = sumaEgala(r, f)
    if (suma && nume >= 0.5) return 4 + nume
    // aceeasi suma, alt nume: doar daca suma e unica intre rezervari si intre facturi (altfel ar fi o ghicire)
    if (suma && rezervari.filter(x => sumaEgala(x, f)).length === 1 && valide.filter(y => sumaEgala(r, y)).length === 1) return 2
    if (nume >= 0.8) return 1 + nume / 10
    return 0
  }
  const perechi = rezervari.flatMap(r => valide.map(f => ({ r, f, s: scor(r, f) }))).filter(p => p.s > 0).sort((a, b) => b.s - a.s)
  const alese = new Map<string, { f: FacturaRhLista; s: number }>(), folosite = new Set<string>()
  for (const p of perechi) {
    if (alese.has(p.r.id) || folosite.has(p.f.numar)) continue
    alese.set(p.r.id, { f: p.f, s: p.s }); folosite.add(p.f.numar)
  }
  return rezervari.map(r => {
    const a = alese.get(r.id), brut = brute.get(r.id) ?? null
    if (!a) return { rezervare: r, brut, factura: null, stare: 'lipsa' as const, diferenta: null }
    const stare: StareRh = a.s >= 4 ? 'ok' : a.s >= 2 ? 'nume' : 'suma'
    return { rezervare: r, brut, factura: a.f, stare, diferenta: brut != null ? r2(Number(a.f.total) - brut) : null }
  })
}

// Facturile RH emise in perioada (AAAA-LL-ZZ, inclusiv) care nu s-au potrivit cu nicio rezervare a lunii
export function faraRezervare(randuri: RandRh[], facturi: FacturaRhLista[], de: string, pana: string) {
  const folosite = new Set(randuri.map(r => r.factura?.numar).filter(Boolean))
  return facturi.filter(f => !f.anulata && !folosite.has(f.numar) && f.data >= de && f.data <= pana)
}
