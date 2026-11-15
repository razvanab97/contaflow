// Citirea FARA AI a facturilor in formatul vizual e-Factura generat de Oblio (exportul
// Oblio → Import/Export → „e-Facturi Furnizori (XML+PDF)” = un singur PDF cu toate facturile primite
// prin SPV, una dupa alta; acelasi format il are si o factura SPV descarcata individual din Oblio).
//
// Structura paginii (pozitii pdf.js, origine jos-stanga):
//   - factura noua = pagina cu „Furnizor:” si „Client:” (paginile fara ele continua factura anterioara);
//   - antet dreapta-sus: „Factura” + numarul (x ≥ 400) - numarul lung se rupe pe 2 randuri
//     („F25641061926018” + „408”, „K-MKTP-” + „37064862”) si se lipeste la loc;
//   - „Data emiterii: dd.mm.yyyy” (uneori rupt: „Data” / „emiterii: dd.mm.yyyy”);
//   - coloana stanga (x < 290) = furnizorul, coloana dreapta (x ≥ 290) = clientul (firma noastra),
//     fiecare cu „CIF:” pe randul lui;
//   - „Total plata 1189.75 RON” pe ultima pagina a facturii; „Index incarcare: …” = indexul SPV.
import { getDocumentProxy } from 'unpdf'
import type { ExtractieInbox } from '@/lib/inbox-facturi'

export interface FacturaEfactura {
  pageStart: number
  pageEnd: number
  numar: string
  data: string | null          // ISO yyyy-mm-dd
  furnizor: string | null
  furnizorCif: string | null
  client: string | null
  clientCif: string | null
  total: number | null
  moneda: string
  indexSpv: string | null
}

type Item = { s: string; x: number; y: number }

async function paginiItems(bytes: Uint8Array): Promise<Item[][]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const pagini: Item[][] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    pagini.push((tc.items as { str?: string; transform?: number[] }[])
      .filter(i => typeof i.str === 'string' && i.str.trim() && Array.isArray(i.transform))
      .map(i => ({ s: i.str!, x: Math.round(i.transform![4]), y: Math.round(i.transform![5]) })))
  }
  return pagini
}

// Textul unui rand: bucatile cu acelasi y (±2), in ordinea x. Literele cu diacritice vin separat
// („BUCURE” „Ş” „TI”) - se lipesc fara spatiu cand sunt alaturate.
function rand(items: Item[], y: number, xMin: number, xMax: number) {
  return items.filter(i => Math.abs(i.y - y) <= 2 && i.x >= xMin && i.x < xMax)
    .sort((a, b) => a.x - b.x).map(i => i.s).join('').replace(/\s+/g, ' ').trim()
}

const eticheta = (items: Item[], re: RegExp, xMin: number, xMax: number) =>
  items.find(i => re.test(i.s.trim()) && i.x >= xMin && i.x < xMax)

function parteaFirmei(items: Item[], xMin: number, xMax: number, cap: RegExp) {
  const head = eticheta(items, cap, xMin, xMax)
  if (!head) return { nume: null, cif: null }
  // numele = randul (randurile) de sub „Furnizor:” / „Client:”, pana la primul camp etichetat
  const etichete = items.filter(i => i.x >= xMin && i.x < xMin + 40 && /:$/.test(i.s.trim()) && i.y < head.y)
  const primaEticheta = Math.max(...etichete.map(i => i.y), -1)
  const ys = [...new Set(items.filter(i => i.x >= xMin && i.x < xMax && i.y < head.y - 2 && i.y > primaEticheta + 2).map(i => i.y))].sort((a, b) => b - a)
  const nume = ys.map(y => rand(items, y, xMin, xMax)).filter(Boolean).join(' ').trim() || null
  const cifEt = items.find(i => /^CIF:?$/i.test(i.s.trim()) && i.x >= xMin && i.x < xMin + 40 && i.y < head.y)
  const cif = cifEt ? rand(items, cifEt.y, xMin + 41, xMax).replace(/\s+/g, '') || null : null
  return { nume, cif }
}

function numarFactura(items: Item[]) {
  const f = items.find(i => /^Factura$/i.test(i.s.trim()) && i.x > 250)
  if (!f) return null
  return items.filter(i => i.x >= 400 && i.y >= f.y - 15 && !/^cota/i.test(i.s.trim()))
    .sort((a, b) => b.y - a.y || a.x - b.x).map(i => i.s.trim()).join('').trim() || null
}

function suma(v: string) {
  const s = v.replace(/\s/g, '')
  // 1,189.75 / 1.189,75 / 1189.75
  const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

// null = fisierul nu e in formatul e-Factura Oblio (se trece la citirea cu AI).
export async function citesteEfacturiPdf(bytes: Uint8Array): Promise<FacturaEfactura[] | null> {
  let pagini: Item[][]
  try { pagini = await paginiItems(bytes) } catch { return null }
  const facturi: (FacturaEfactura & { _text: string })[] = []
  pagini.forEach((items, idx) => {
    const p = idx + 1
    const text = items.map(i => i.s).join(' ')
    const stanga = eticheta(items, /^Furnizor:$/, 0, 290)
    const dreapta = eticheta(items, /^Client:$/, 290, 1000)
    if (stanga && dreapta) {
      const furn = parteaFirmei(items, 0, 290, /^Furnizor:$/)
      const cl = parteaFirmei(items, 290, 1000, /^Client:$/)
      facturi.push({
        pageStart: p, pageEnd: p, numar: numarFactura(items) || '', data: null,
        furnizor: furn.nume, furnizorCif: furn.cif, client: cl.nume, clientCif: cl.cif,
        total: null, moneda: 'RON', indexSpv: null, _text: text,
      })
    } else if (facturi.length) {
      const ult = facturi[facturi.length - 1]
      ult.pageEnd = p
      ult._text += ' ' + text
    }
  })
  if (!facturi.length || pagini.length && !facturi.some(f => f.pageStart === 1)) return null
  for (const f of facturi) {
    const t = f._text.replace(/\s+/g, ' ')
    const d = t.match(/emiterii:\s*(\d{2})\.(\d{2})\.(\d{4})/i)
    if (d) f.data = `${d[3]}-${d[2]}-${d[1]}`
    const tot = [...t.matchAll(/Total plata\s+(-?[\d.,]+)\s*([A-Z]{3})?/gi)].pop()
    if (tot) { f.total = suma(tot[1]); if (tot[2]) f.moneda = tot[2].toUpperCase() }
    const idx = t.match(/Index incarcare:\s*(\d+)/i)
    if (idx) f.indexSpv = idx[1]
  }
  // fara numar, fara total sau client fara CIF (ex. facturile noastre RH catre persoane fizice), citirea
  // nu e sigura pentru Inbox (facturi primite) -> lasam AI-ul
  if (facturi.some(f => !f.numar || f.total == null || !/\d{4,}/.test(f.clientCif || ''))) return null
  return facturi.map(({ _text, ...f }) => f)
}

// Extragerea in forma asteptata de importInboxDocument (firma = dupa CIF-ul clientului).
export function extractieDinEfactura(f: FacturaEfactura): ExtractieInbox {
  return {
    firmaSlug: null,
    firmaCui: f.clientCif,
    incredereFirma: 'sigur',
    esteFactura: true,
    furnizor: f.furnizor,
    numarDocument: f.numar,
    suma: f.total,
    moneda: f.moneda,
    dataDocument: f.data,
    locatie: null,
    tipDocument: 'factura',
    motiv: `e-Factura SPV (export Oblio)${f.indexSpv ? ` · index ${f.indexSpv}` : ''} · ${f.client || ''} CIF ${f.clientCif || '-'}`,
  }
}

// Un singur document e-Factura in fisier -> extragerea lui; altfel null (citire cu AI).
export async function extractieEfacturaUnica(bytes: Uint8Array, mediaType: string): Promise<ExtractieInbox | null> {
  if (mediaType !== 'application/pdf') return null
  const r = await citesteEfacturiPdf(bytes).catch(() => null)
  return r?.length === 1 ? extractieDinEfactura(r[0]) : null
}
