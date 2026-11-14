import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { oblioToken, tokenRefuzat } from '@/lib/oblio'

export const dynamic = 'force-dynamic'

// Emite in Oblio factura pentru una sau MAI MULTE comenzi ale aceluiasi client din aplicatia spalatoriei AB Textile
// (butonul „Factură Oblio” din Comenzi). Acelasi drum ca factura de cazare din ApartPro (factura-cazare), dar cu seria ABT.
// Apelat DOAR server-to-server de aplicatia spalatoriei, cu secretul comun ABTEXTILE_FACTURARE_SECRET - fara UI aici.
// AB Textile SRL (neplatitoare de TVA), seria ABT, trimisa automat in SPV, data emiterii cel mult azi si nu inaintea
// ultimei facturi ABT (numerotare cronologica). Fiecare articol din comanda = un rand pe factura, cu „Comanda #N” in descriere.
const SETARI = {
  cif: '52575850',      // AB TEXTILE S.R.L. (neplatitoare de TVA)
  serie: 'ABT',
  spvExtern: 1,
}

type Articol = { name?: string; tip?: string; qty?: number; price?: number; total?: number }
type Comanda = { id?: string; nr?: number | string; dataIn?: string; items?: Articol[]; reducere?: number }
type Cerere = {
  cheie?: string
  numeClient?: string
  telefon?: string | null
  email?: string | null
  dataEmitere?: string
  comenzi?: Comanda[]
  client?: { tara?: string; judet?: string; localitate?: string; adresa?: string; pj?: boolean; cui?: string; firma?: string; regCom?: string; platitorTva?: boolean }
}

function autorizat(req: NextRequest) {
  const secret = process.env.ABTEXTILE_FACTURARE_SECRET || ''
  const primit = req.headers.get('x-abtextile-secret') || ''
  if (!secret || primit.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(primit), Buffer.from(secret))
}

class TokenExpirat extends Error {}
async function cuToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
  try { return await fn(await oblioToken(SETARI.cif)) } catch (e) {
    if (!(e instanceof TokenExpirat)) throw e
    return await fn(await oblioToken(SETARI.cif, true))
  }
}
type FacturaOblio = { seriesName?: string; number?: string | number; issueDate?: string; draft?: number | string | boolean }
const da = (v: unknown) => !!v && String(v) !== '0' && String(v).toLowerCase() !== 'false'
// ultima factura (ne-ciorna) din seria ABT: data cea mai noua, la aceeasi data numarul cel mai mare
async function ultimaFactura(token: string): Promise<{ data: string; numar: string } | null> {
  let ultima: { data: string; numar: string; nr: number } | null = null
  for (let offset = 0, pagini = 0; pagini < 100; offset += 100, pagini++) {
    const q = new URLSearchParams({ cif: SETARI.cif, seriesName: SETARI.serie, limitPerPage: '100', offset: String(offset), orderBy: 'issueDate', orderDir: 'DESC' })
    const res = await fetch(`https://www.oblio.eu/api/docs/invoice/list?${q}`, { headers: { Authorization: `Bearer ${token}` } })
    const out = await res.json().catch(() => ({})) as { status?: number; statusMessage?: string; data?: FacturaOblio[] }
    if (tokenRefuzat(res.status, out.statusMessage)) throw new TokenExpirat(out.statusMessage || 'token expirat')
    if (!res.ok || out.status !== 200 || !Array.isArray(out.data)) throw new Error(`Oblio (lista facturilor ${SETARI.serie}): ${out.statusMessage || `eroare ${res.status}`}`)
    for (const f of out.data) {
      if (da(f.draft)) continue
      const d = String(f.issueDate || '').slice(0, 10)
      const nr = Number(String(f.number ?? '').replace(/\D/g, '')) || 0
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && (!ultima || d > ultima.data || (d === ultima.data && nr > ultima.nr))) ultima = { data: d, nr, numar: `${f.seriesName || SETARI.serie} ${f.number ?? ''}`.trim() }
    }
    if (out.data.length < 100) break
  }
  return ultima && { data: ultima.data, numar: ultima.numar }
}

// GET = ultima factura ABT (aplicatia o afiseaza si limiteaza data emiterii)
export async function GET(req: NextRequest) {
  if (!autorizat(req)) return NextResponse.json({ error: 'Neautorizat' }, { status: 401 })
  try {
    return NextResponse.json({ serie: SETARI.serie, ultima: await cuToken(ultimaFactura) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Nu am putut citi ultima factură' }, { status: 502 })
  }
}

const zi = (d: string) => { const [y, m, z] = d.split('-'); return `${z}.${m}.${y}` }
const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100
const SERVICIU: Record<string, string> = { sc: 'Spălat + călcat', c: 'Doar călcat' }
const unitate = (name: string) => (name.match(/\((ml|kg)\)/i)?.[1] || 'buc').toLowerCase()
const fmtQ = (q: number) => String(r2(q)).replace('.', ',')

// Randurile facturii pentru o comanda: un rand pe articol; reducerea comenzii = rand de discount valoric
// pus imediat dupa articolul cel mai scump (Oblio: discountAllAbove 0 = se aplica doar produsului de deasupra)
function randuriComanda(c: Comanda) {
  const nr = String(c.nr ?? '').trim()
  const desc = `Comanda #${nr}${c.dataIn && /^\d{4}-\d{2}-\d{2}$/.test(c.dataIn) ? ` din ${zi(c.dataIn)}` : ''}`
  const linii = (c.items || []).filter(it => r2(it.total) > 0 && String(it.name || '').trim()).map(it => {
    const name = String(it.name).trim(), qty = Number(it.qty) || 0, total = r2(it.total), price = r2(it.price)
    const serv = SERVICIU[String(it.tip || 'sc')] || SERVICIU.sc
    // pretul × cantitatea trebuie sa dea exact totalul randului; altfel (rotunjiri la kg / ml) un singur rand cu totalul
    const exact = qty > 0 && price > 0 && Math.abs(r2(price * qty) - total) < 0.005
    return {
      name: `${name} — ${serv}`,
      description: exact ? desc : `${desc} · ${fmtQ(qty)} ${unitate(name)}`,
      price: exact ? price : total,
      quantity: exact ? qty : 1,
      measuringUnit: exact ? unitate(name) : 'buc',
      productType: 'Serviciu', vatName: 'SFDD', vatPercentage: 0, vatIncluded: 1, save: 0,
      total,
    }
  })
  const reducere = r2(c.reducere)
  if (reducere > 0 && linii.length) {
    const i = linii.reduce((m, l, j) => (l.total > linii[m].total ? j : m), 0)
    if (reducere > linii[i].total) throw new Error(`Reducerea comenzii #${nr} (${reducere} lei) e mai mare decât cel mai scump articol — fă factura din Oblio sau împarte reducerea`)
    const [scump] = linii.splice(i, 1)
    linii.push(scump)
  }
  const produse: Record<string, unknown>[] = linii.map(({ total: _t, ...l }) => l)
  if (reducere > 0 && linii.length) produse.push({ name: `Reducere comanda #${nr}`, discount: reducere, discountType: 'valoric', discountAllAbove: 0 })
  return { produse, total: r2(linii.reduce((s, l) => s + l.total, 0) - reducere) }
}

export async function POST(req: NextRequest) {
  if (!autorizat(req)) return NextResponse.json({ error: 'Neautorizat' }, { status: 401 })
  const r = await req.json().catch(() => ({})) as Cerere

  const comenzi = Array.isArray(r.comenzi) ? r.comenzi : []
  const cheie = String(r.cheie || '').trim()
  const lipsa: string[] = [
    !cheie && 'cheia facturii',
    !String(r.numeClient || '').trim() && 'numele clientului',
    !comenzi.length && 'comenzile de facturat',
  ].filter(Boolean) as string[]
  const azi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })
  const dataEmitere = String(r.dataEmitere || '').trim() || azi
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEmitere) || isNaN(Date.parse(dataEmitere))) lipsa.push('data emiterii (format AAAA-LL-ZZ)')
  else if (dataEmitere > azi) lipsa.push('o dată de emitere care nu e în viitor')
  const tara = String(r.client?.tara || '').trim() || 'Romania'
  const judet = String(r.client?.judet || '').trim(), localitate = String(r.client?.localitate || '').trim(), adresa = String(r.client?.adresa || '').trim()
  const eRomania = /^rom[aâ]nia$/i.test(tara)
  if (eRomania && !judet) lipsa.push('județul clientului')
  if (!localitate) lipsa.push('localitatea clientului')
  const pj = !!r.client?.pj, cui = String(r.client?.cui || '').toUpperCase().replace(/^RO/, '').replace(/\s/g, ''), firma = String(r.client?.firma || '').trim()
  if (pj && !/^\d{2,10}$/.test(cui)) lipsa.push('CUI-ul firmei (doar cifre, cu sau fără RO)')
  if (pj && !firma) lipsa.push('denumirea firmei')
  if (lipsa.length) return NextResponse.json({ error: `Lipsește: ${lipsa.join(', ')}` }, { status: 400 })

  let produse: Record<string, unknown>[] = [], total = 0
  try {
    for (const c of comenzi) { const x = randuriComanda(c); produse.push(...x.produse); total += x.total }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Articole invalide' }, { status: 400 })
  }
  total = r2(total)
  if (!produse.length || !(total > 0)) return NextResponse.json({ error: 'Comenzile alese nu au articole cu preț' }, { status: 400 })
  const nrComenzi = comenzi.map(c => `#${c.nr}`).join(', ')

  try {
    // interzis: data emiterii inaintea ultimei facturi din serie (daca lista nu se poate citi, NU emitem)
    const ultima = await cuToken(ultimaFactura)
    if (ultima && dataEmitere < ultima.data) {
      return NextResponse.json({ error: `Data emiterii ${zi(dataEmitere)} e înaintea ultimei facturi ${ultima.numar} din ${zi(ultima.data)}. Nu se poate factura în urmă — alege ${zi(ultima.data)} sau o dată ulterioară.`, ultima }, { status: 400 })
    }
    const body = {
      cif: SETARI.cif,
      seriesName: SETARI.serie,
      issueDate: dataEmitere,
      language: 'RO',
      currency: 'RON',
      spvExtern: SETARI.spvExtern,
      // aceleasi comenzi nu pot fi facturate de doua ori, chiar daca butonul e apasat repetat
      idempotencyKey: `abtextile-${cheie}`.slice(0, 120),
      mentions: `${comenzi.length > 1 ? 'Comenzile' : 'Comanda'} ${nrComenzi} · Spălătoria AB Textile`,
      client: {
        ...(pj ? { name: firma, cif: `${r.client?.platitorTva ? 'RO' : ''}${cui}`, ...(r.client?.regCom ? { rc: String(r.client.regCom).trim() } : {}), vatPayer: r.client?.platitorTva ? 1 : 0 } : { name: String(r.numeClient).trim() }),
        country: eRomania ? 'Romania' : tara,
        ...(judet ? { state: judet } : {}),
        city: localitate,
        ...(adresa ? { address: adresa } : {}),
        ...(r.telefon ? { phone: r.telefon } : {}),
        ...(r.email ? { email: r.email } : {}),
        save: 0,
      },
      products: produse,
    }
    type Rasp = { status?: number; statusMessage?: string; data?: { seriesName?: string; number?: string; link?: string } }
    const { res, out } = await cuToken(async token => {
      const res = await fetch('https://www.oblio.eu/api/docs/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const out = await res.json().catch(() => ({})) as Rasp
      if (tokenRefuzat(res.status, out.statusMessage)) throw new TokenExpirat(out.statusMessage || 'token expirat')
      return { res, out }
    })
    if (!res.ok || out.status !== 200 || !out.data?.number) {
      return NextResponse.json({ error: `Oblio: ${out.statusMessage || `eroare ${res.status}`}` }, { status: 502 })
    }
    return NextResponse.json({ serie: out.data.seriesName, numar: out.data.number, link: out.data.link || null, total })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Emiterea facturii a eșuat' }, { status: 500 })
  }
}
