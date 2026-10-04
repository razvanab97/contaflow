import Anthropic from '@anthropic-ai/sdk'

export interface LinieAviz { descriere: string; tip: 'vanzare' | 'comision' | 'voucher' | 'transport' | 'retur' | 'alte'; serie: string | null; valoare: number }
export interface AvizComplet { valuta: string | null; linii: LinieAviz[]; totalPlata: number | null; dataAviz: string | null }

const TIPURI = new Set(['vanzare', 'comision', 'voucher', 'transport', 'retur', 'alte'])

// Citeste TOT avizul de plata eMAG (nu doar facturile de descarcat): incasarile din vanzari
// (ramburs, card online - liniile fara serie de document), retinerile (comisioane, vouchere,
// transport/easybox, alte facturi) si suma totala virata. Baza "Concluziei eMAG".
export async function citesteAvizComplet(bytes: Uint8Array): Promise<AvizComplet | null> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(bytes).toString('base64') } },
        { type: 'text', text: `Acesta este un aviz de plata eMAG Marketplace (poate fi in romana, bulgara sau maghiara). Extrage TOATE liniile din tabelul avizului, inclusiv cele cu "Serie document" = n/a (incasari ramburs, incasari card online etc.).
Raspunde DOAR cu JSON:
{"valuta":"RON|EUR|HUF|BGN","dataAviz":"AAAA-LL-ZZ","linii":[{"descriere":"textul liniei/categoriei","tip":"vanzare|comision|voucher|transport|retur|alte","serie":"seria documentului sau null","valoare":123.45}],"totalPlata":1234.56}
Reguli: tip "vanzare" = incasari din vanzari catre clienti (ramburs, card, plata online); "comision" = facturi de comision; "voucher" = facturi voucher/cupoane; "transport" = easybox, curierat, livrare, retineri curier; "retur" = stornari/rambursari catre clienti; "alte" = orice altceva. valoare = exact ca in aviz, cu semnul din aviz (retinerile sunt negative). totalPlata = suma de pe randul Total/Общо/Összesen. valuta = moneda scrisa langa acel Total (moneda in care sunt exprimate valorile din tabel), NU moneda platii mentionata in notele de subsol. Nu inventa linii.` },
      ] }],
    })
    const raw = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return null
    const p = JSON.parse(m[0])
    const linii: LinieAviz[] = (Array.isArray(p.linii) ? p.linii : [])
      .filter((l: any) => Number.isFinite(Number(l?.valoare)))
      .map((l: any) => ({
        descriere: String(l.descriere || '').slice(0, 160),
        tip: TIPURI.has(l.tip) ? l.tip : 'alte',
        serie: typeof l.serie === 'string' && l.serie.trim() && !/^n\/?a$/i.test(l.serie.trim()) ? l.serie.trim() : null,
        valoare: Math.round(Number(l.valoare) * 100) / 100,
      }))
    return {
      valuta: typeof p.valuta === 'string' && /^[A-Z]{3}$/.test(p.valuta) ? p.valuta : null,
      linii,
      dataAviz: typeof p.dataAviz === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.dataAviz) ? p.dataAviz : null,
      totalPlata: Number.isFinite(Number(p.totalPlata)) && p.totalPlata !== null ? Math.round(Number(p.totalPlata) * 100) / 100 : null,
    }
  } catch {
    return null
  }
}
