import { oblioToken, tokenRefuzat } from '@/lib/oblio'

// Seria RH (regim hotelier) a AB Textile in Oblio: facturile de cazare emise din ApartPro. Folosit de ruta pentru
// ApartPro (/api/oblio/factura-cazare: ultima factura, lista) si de verificarea din „Airbnb · Borderou” (AB Textile).
export const SETARI_RH = { cif: '52575850', serie: 'RH' }
const SETARI = SETARI_RH

export class TokenExpirat extends Error {}
// apel cu tokenul salvat; daca Oblio il refuza ca expirat, inca o data cu un token nou
export async function cuToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
  try { return await fn(await oblioToken(SETARI.cif)) } catch (e) {
    if (!(e instanceof TokenExpirat)) throw e
    return await fn(await oblioToken(SETARI.cif, true))
  }
}
export type FacturaOblio = { seriesName?: string; number?: string | number; issueDate?: string; draft?: number | string | boolean; total?: number | string; currency?: string; canceled?: number | string | boolean; link?: string; client?: { name?: string; cif?: string } }
// toate facturile din seria RH (pagini de 100)
export async function toateFacturile(token: string): Promise<FacturaOblio[]> {
  const toate: FacturaOblio[] = []
  for (let offset = 0, pagini = 0; pagini < 100; offset += 100, pagini++) {
    const q = new URLSearchParams({ cif: SETARI.cif, seriesName: SETARI.serie, limitPerPage: '100', offset: String(offset), orderBy: 'issueDate', orderDir: 'DESC' })
    const res = await fetch(`https://www.oblio.eu/api/docs/invoice/list?${q}`, { headers: { Authorization: `Bearer ${token}` } })
    const out = await res.json().catch(() => ({})) as { status?: number; statusMessage?: string; data?: FacturaOblio[] }
    if (tokenRefuzat(res.status, out.statusMessage)) throw new TokenExpirat(out.statusMessage || 'token expirat')
    if (!res.ok || out.status !== 200 || !Array.isArray(out.data)) throw new Error(`Oblio (lista facturilor ${SETARI.serie}): ${out.statusMessage || `eroare ${res.status}`}`)
    toate.push(...out.data)
    if (out.data.length < 100) break
  }
  return toate
}
export const da = (v: unknown) => !!v && String(v) !== '0' && String(v).toLowerCase() !== 'false'

export interface FacturaRh { numar: string; data: string; total: number | null; moneda: string; client: string; anulata: boolean; link: string | null }
// toate facturile RH emise (fara ciorne), sortate dupa numar
export async function listaFacturiRh(): Promise<FacturaRh[]> {
  return (await cuToken(toateFacturile)).filter(f => !da(f.draft)).map(f => ({
    numar: `${f.seriesName || SETARI.serie} ${f.number ?? ''}`.trim(), data: String(f.issueDate || '').slice(0, 10),
    total: f.total == null || f.total === '' ? null : Number(f.total), moneda: f.currency || 'RON', client: f.client?.name || '', anulata: da(f.canceled), link: f.link || null,
  })).sort((a, b) => a.numar.localeCompare(b.numar, 'ro', { numeric: true }))
}
