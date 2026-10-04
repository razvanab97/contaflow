import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Cautare in limbaj natural prin facturi ("ce facturi sunt de la VMD in folderul local?",
// "facturile Orange neplatite din septembrie la ABXHomes"). AI-ul doar traduce intrebarea in filtre;
// cautarea propriu-zisa e facuta in cod, pe baza - deci rezultatele sunt exacte, nu inventate.

type Sursa = 'local' | 'gmail' | 'oblio' | 'module' | 'altele'
interface Filtre {
  furnizor: string | null; termeni: string[]; firma: string | null; sursa: Sursa | 'toate'
  dataDe: string | null; dataPana: string | null; sumaMin: number | null; sumaMax: number | null
  stare: 'toate' | 'neasociate' | 'asociate'
}

const SECTIUNI: [string, string][] = [
  ['/inbox-facturi/', 'Inbox Facturi'], ['/facturi-restante/', 'Facturi restante'], ['/facturi-chitanta/', 'Facturi + chitanță'],
  ['/dispozitii-plata/', 'Dispoziție de plată'], ['/airbnb-facturi/', 'Airbnb · Facturi'], ['/booking-facturi/', 'Booking · Facturi'],
  ['/emag', 'eMAG'], ['/acte-contabile/', 'Acte contabile'], ['/angajati/', 'Documente angajați'], ['/tx/', 'Extras de cont'],
]
const MODUL_PAGINA: [string, string][] = [
  ['/inbox-facturi/', 'inbox-facturi'], ['/facturi-restante/', 'facturi-restante'], ['/facturi-chitanta/', 'facturi-chitanta'],
  ['/dispozitii-plata/', 'dispozitie-plata'], ['/airbnb-facturi/', 'airbnb-facturi'], ['/booking-facturi/', 'booking-facturi'],
  ['/emag', 'emag'], ['/acte-contabile/', 'acte-contabile'], ['/tx/', 'extras'],
]

function ascii(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ȘșŞş]/g, 's').replace(/[ȚțŢţ]/g, 't').toLowerCase()
}
function sursaDin(furnizor: string | null, path: string): Sursa {
  const linie = (furnizor || '').split('|').find(p => p.trim().toLowerCase().startsWith('sursa:'))?.toLowerCase() || ''
  if (linie.includes('folder local') || linie.includes('fisiere locale') || linie.includes('fișiere locale')) return 'local'
  if (linie.includes('gmail') || linie.includes('icloud')) return 'gmail'
  if (linie.includes('oblio')) return 'oblio'
  return path.includes('/inbox-facturi/') ? 'altele' : 'module'
}
function furnizorCurat(f: string | null) {
  const p = (f || '').split('|')[0].trim()
  return /^(DP_DATA:|Ata(ș|s)ament |Sursa:|Categorie:|\{)/i.test(p) ? '' : p
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function toate(q: () => any, max = 6000): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await q().range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

async function filtreDinIntrebare(intrebare: string, firme: { slug: string; nume: string }[]): Promise<Filtre> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: `Transforma intrebarea utilizatorului despre facturi in filtre de cautare. Azi: ${new Date().toISOString().slice(0, 10)}.
Firmele noastre (beneficiarii facturilor): ${JSON.stringify(firme)}.
Surse: "local" = folderul local / Personal Computer / desktop, "gmail" = e-mail, "oblio" = e-Factura/Oblio/SPV, "toate" = nespecificat.
Raspunde DOAR cu JSON:
{"furnizor":"numele/fragmentul furnizorului cautat (ex. VMD, Orange, Jumbo) sau null","termeni":["alte cuvinte cheie obligatorii: numar factura, produs - de obicei gol"],"firma":"slug-ul firmei noastre daca e mentionata, altfel null","sursa":"local|gmail|oblio|toate","dataDe":"AAAA-LL-ZZ sau null","dataPana":"AAAA-LL-ZZ sau null","sumaMin":null,"sumaMax":null,"stare":"toate|neasociate|asociate"}
"neasociate" = neplatite / fara plata in extras / nelegate; "asociate" = platite / legate de o plata. O luna (ex. "din septembrie") = prima si ultima zi a lunii, anul curent daca nu e spus.

Intrebarea: ${intrebare.slice(0, 500)}` }],
  })
  const raw = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
  let p: any = {}
  try { p = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}') } catch {}
  const data = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null
  return {
    furnizor: p.furnizor && p.furnizor !== 'null' ? String(p.furnizor).slice(0, 80) : null,
    termeni: Array.isArray(p.termeni) ? p.termeni.map((t: unknown) => String(t)).filter((t: string) => t.trim().length >= 2).slice(0, 5) : [],
    firma: firme.some(f => f.slug === p.firma) ? p.firma : null,
    sursa: ['local', 'gmail', 'oblio', 'toate'].includes(p.sursa) ? p.sursa : 'toate',
    dataDe: data(p.dataDe), dataPana: data(p.dataPana), sumaMin: num(p.sumaMin), sumaMax: num(p.sumaMax),
    stare: ['neasociate', 'asociate'].includes(p.stare) ? p.stare : 'toate',
  }
}

export async function POST(req: NextRequest) {
  const { intrebare } = await req.json().catch(() => ({}))
  const q = String(intrebare || '').trim()
  if (q.length < 3) return NextResponse.json({ error: 'Scrie o întrebare, ex. „ce facturi sunt de la VMD în folderul local?”' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: firmeRows } = await sb.from('firme').select('id,slug,nume,culoare').eq('activa', true)
  const firme = (firmeRows || []).filter(f => f.slug !== 'proiect-ab-textile')
  let filtre: Filtre
  try { filtre = await filtreDinIntrebare(q, firme.map(f => ({ slug: f.slug, nume: f.nume }))) }
  catch { return NextResponse.json({ error: 'AI-ul nu a putut înțelege întrebarea' }, { status: 502 }) }
  if (!filtre.furnizor && !filtre.termeni.length && !filtre.dataDe && filtre.sumaMin == null && !filtre.firma && filtre.stare === 'toate')
    return NextResponse.json({ filtre, rezultate: [], alteSurse: [], neprocesate: [], rezumat: 'Spune-mi ce cauți: un furnizor, o perioadă, o sumă sau o firmă.' })

  const firmaId = filtre.firma ? firme.find(f => f.slug === filtre.firma)?.id : null
  const [docs, watch, luni] = await Promise.all([
    toate(() => {
      let x = sb.from('documente').select('id,firma_id,luna_id,fisier_path,fisier_nume,furnizor,numar_document,suma,valuta,data_document,tranzactie_id,tip_document')
        .or('tip_document.is.null,tip_document.neq.borderou').not('fisier_path', 'like', '%/config/%').not('fisier_path', 'like', '%/5stardesk/%')
      if (firmaId) x = x.eq('firma_id', firmaId)
      return x.order('data_document', { ascending: false, nullsFirst: false })
    }),
    toate(() => sb.from('inbox_watch_files').select('id,fisier_nume,status,error_message,document_id,firma_id,created_at').order('created_at', { ascending: false })),
    toate(() => sb.from('luni_contabile').select('id,luna')),
  ])
  const dinFolderLocal = new Set(watch.map(w => w.document_id).filter(Boolean))
  const lunaKey = new Map(luni.map(l => [l.id, String(l.luna).slice(0, 7)]))

  const furn = filtre.furnizor ? ascii(filtre.furnizor) : null
  const termeni = filtre.termeni.map(ascii)
  const potriveste = (d: any) => {
    const text = ascii(`${furnizorCurat(d.furnizor)} ${d.fisier_nume || ''} ${d.numar_document || ''}`)
    if (furn && !text.includes(furn) && !text.replace(/\s/g, '').includes(furn.replace(/\s/g, ''))) return false
    if (termeni.some(t => !text.includes(t))) return false
    if (filtre.dataDe && (!d.data_document || d.data_document < filtre.dataDe)) return false
    if (filtre.dataPana && (!d.data_document || d.data_document > filtre.dataPana)) return false
    if (filtre.sumaMin != null && (d.suma == null || Math.abs(d.suma) < filtre.sumaMin)) return false
    if (filtre.sumaMax != null && (d.suma == null || Math.abs(d.suma) > filtre.sumaMax)) return false
    if (filtre.stare === 'neasociate' && d.tranzactie_id) return false
    if (filtre.stare === 'asociate' && !d.tranzactie_id) return false
    return true
  }
  const gasite = docs.filter(potriveste)

  // Data platii pentru cele asociate.
  const txMap = new Map<string, any>()
  const ids = gasite.map(d => d.tranzactie_id).filter(Boolean)
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await sb.from('tranzactii').select('id,data_tranzactie,suma').in('id', ids.slice(i, i + 150))
    for (const t of data || []) txMap.set(t.id, t)
  }

  const firmaById = new Map(firme.map(f => [f.id, f]))
  const forma = (d: any) => {
    const f = firmaById.get(d.firma_id)
    const sursa: Sursa = dinFolderLocal.has(d.id) ? 'local' : sursaDin(d.furnizor, d.fisier_path)
    const modul = MODUL_PAGINA.find(([k]) => d.fisier_path.includes(k))?.[1] || null
    const lk = lunaKey.get(d.luna_id)
    const tx = d.tranzactie_id ? txMap.get(d.tranzactie_id) : null
    return {
      id: d.id, fisierNume: d.fisier_nume, furnizor: furnizorCurat(d.furnizor), numar: d.numar_document || null,
      suma: d.suma != null ? Number(d.suma) : null, valuta: d.valuta || 'RON', data: d.data_document,
      firma: f ? { nume: f.nume, culoare: f.culoare, slug: f.slug } : null, sursa,
      sectiune: SECTIUNI.find(([k]) => d.fisier_path.includes(k))?.[1] || 'Documente',
      platita: tx ? { data: tx.data_tranzactie, suma: Number(tx.suma) } : d.tranzactie_id ? { data: null, suma: null } : null,
      docUrl: `/api/chitante/document?id=${d.id}`,
      href: f && lk && modul ? `/${f.slug}/${lk}/${modul}` : null,
    }
  }
  const toateRez = gasite.map(forma)
  // Sursa ceruta -> rezultatele principale; restul (acelasi furnizor, alta sursa / mutate in alt modul) separat.
  const rezultate = filtre.sursa === 'toate' ? toateRez : toateRez.filter(r => r.sursa === filtre.sursa)
  const alteSurse = filtre.sursa === 'toate' ? [] : toateRez.filter(r => r.sursa !== filtre.sursa)

  // Fisiere din folderul local inca neprocesate / neatribuite care se potrivesc dupa nume.
  const neprocesate = (filtre.sursa === 'toate' || filtre.sursa === 'local')
    ? watch.filter(w => !w.document_id && ['pending', 'nedetectat', 'eroare'].includes(w.status) && (!furn || ascii(w.fisier_nume).replace(/\s/g, '').includes(furn.replace(/\s/g, ''))))
        .map(w => ({ id: w.id, fisierNume: w.fisier_nume, status: w.status, motiv: w.error_message }))
    : []

  const total = rezultate.reduce((s, r) => s + (r.valuta === 'RON' && r.suma != null ? r.suma : 0), 0)
  const neplatite = rezultate.filter(r => !r.platita).length
  const descriere = [filtre.furnizor && `de la „${filtre.furnizor}”`, filtre.sursa !== 'toate' && `din ${({ local: 'folderul local', gmail: 'Gmail', oblio: 'e-Factură (Oblio)' } as Record<string, string>)[filtre.sursa]}`,
    filtre.firma && `pentru ${firme.find(f => f.slug === filtre.firma)?.nume}`].filter(Boolean).join(' ')
  const rezumat = rezultate.length
    ? `Am găsit ${rezultate.length} ${rezultate.length === 1 ? 'factură' : 'facturi'} ${descriere}, total ${total.toFixed(2).replace('.', ',')} lei · ${neplatite ? `${neplatite} neasociate unei plăți` : 'toate asociate unei plăți'}.`
    : filtre.stare !== 'toate' && (n => n > 0)(docs.filter(d => potriveste({ ...d, tranzactie_id: filtre.stare === 'neasociate' ? null : 'x' })).length)
      ? `Nicio factură ${filtre.stare === 'neasociate' ? 'neasociată' : 'asociată'} ${descriere} — toate cele găsite sunt ${filtre.stare === 'neasociate' ? 'deja asociate unei plăți' : 'încă neasociate'}.`
      : `Nicio factură ${descriere}${alteSurse.length ? ` — dar am găsit ${alteSurse.length} în alte locuri (mai jos)` : ''}.`
  return NextResponse.json({ filtre, rezumat, rezultate: rezultate.slice(0, 100), alteSurse: alteSurse.slice(0, 50), neprocesate })
}
/* eslint-enable @typescript-eslint/no-explicit-any */
