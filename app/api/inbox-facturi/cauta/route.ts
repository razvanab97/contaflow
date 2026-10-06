import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { cursuriBnrSigur, inLei } from '@/lib/curs-bnr'

type Sursa = 'local' | 'gmail' | 'oblio' | 'bonuri' | 'altele' | 'module' | 'deasociat'

// Sursa e scrisa ca text in furnizor ("... | Sursa: Gmail 1 (x@gmail.com)" / "Sursa: Folder local
// (Personal Computer)" / "Sursa: Fișiere locale") - nu exista coloana dedicata, deci o deducem de
// aici ca sa putem filtra pe categorii in UI.
function detecteazaSursa(furnizor: string | null): Sursa {
  const linie = (furnizor || '').split('|').find(p => p.trim().toLowerCase().startsWith('sursa:')) || ''
  const v = linie.toLowerCase()
  if (v.includes('gmail') || v.includes('icloud')) return 'gmail'
  if (v.includes('folder local') || v.includes('fișiere locale') || v.includes('fisiere locale')) return 'local'
  if (v.includes('oblio')) return 'oblio'
  return 'altele'
}

function furnizorCurat(furnizor: string | null): string {
  const p = (furnizor || '').split('|')[0]?.trim() || ''
  return /^(DP_DATA:|Ata(ș|s)ament |Sursa:|Categorie:|\{)/i.test(p) ? '' : p
}

const SECTIUNI: [string, string][] = [
  ['/inbox-facturi/', 'Inbox Facturi'], ['/facturi-restante/', 'Facturi restante'], ['/facturi-chitanta/', 'Facturi + chitanță'],
  ['/dispozitii-plata/', 'Dispoziție de plată'], ['/airbnb-facturi/', 'Airbnb · Facturi'], ['/booking-facturi/', 'Booking · Facturi'],
  ['/emag', 'eMAG'], ['/trendyol/', 'Trendyol'], ['/acte-contabile/', 'Acte contabile'], ['/angajati/', 'Documente angajați'],
  ['/checklist/', 'Documente lună'], ['/achizitii/', 'Achiziții'], ['/tx/', 'Extras de cont'],
]
const sectiune = (path: string) => SECTIUNI.find(([k]) => path.includes(k))?.[1] || 'Documente'

// Numele comercial cautat de obicei -> firma care emite efectiv factura (ex. eMAG factureaza prin Dante).
const ALIAS: Record<string, string[]> = { emag: ['dante international', 'dante'], sameday: ['delivery solutions'], fan: ['fan courier'] }

function ascii(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ȘșŞş]/g, 's').replace(/[ȚțŢţ]/g, 't').toLowerCase()
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function toate(q: () => any, max = 4000): Promise<any[]> {
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

// Cautare manuala a documentului pentru o tranzactie din Extras: TOATE documentele firmei care pot
// justifica o plata/incasare (Inbox Facturi local/Gmail/Oblio, facturile din module - restante,
// chitante, dispozitii, eMAG, comisioane platforme -, facturile de asociat din folderul comun,
// bonurile), dupa furnizor/firma, numar document, nume fisier, suma (ex. "714" -> 714,00-714,99)
// sau data, fara diacritice. Fara text: doar cele inca neasociate, cele mai apropiate de suma
// tranzactiei primele. Cu text: si cele deja asociate altei tranzactii, marcate ca atare.
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const sumaParam = req.nextUrl.searchParams.get('suma')
  const suma = sumaParam !== null ? Number(sumaParam) : null
  const valutaTx = (req.nextUrl.searchParams.get('valutaTx') || 'RON').toUpperCase()
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  const sursaFiltru = req.nextUrl.searchParams.get('sursa') as Sursa | 'toate' | null
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  let docs: any[], bonuri: any[], asteptate: any[]
  try {
    [docs, bonuri, asteptate] = await Promise.all([
      toate(() => sb.from('documente')
        .select('id,fisier_nume,fisier_path,furnizor,suma,valuta,data_document,numar_document,tip_document,tranzactie_id,created_at')
        .eq('firma_id', firmaId)
        .or('tip_document.is.null,tip_document.neq.borderou')
        .not('fisier_path', 'like', '%/config/%')
        .not('fisier_path', 'like', '%/5stardesk/%')
        .not('fisier_path', 'like', '%/resetari/%')
        .order('created_at', { ascending: false })),
      toate(() => sb.from('bonuri').select('id,fisier_nume,comerciant,cui_client,suma,data_bon,status,tranzactie_id,created_at').eq('firma_id', firmaId).order('created_at', { ascending: false })),
      toate(() => sb.from('facturi_asteptate').select('id,fisier_nume,furnizor,numar_document,suma,data_factura,status,tranzactie_id,created_at').eq('firma_id', firmaId).order('created_at', { ascending: false })),
    ])
  } catch (e) {
    return NextResponse.json({ error: (e as { message?: string }).message || 'Căutarea a eșuat' }, { status: 500 })
  }

  // Tranzactiile deja legate de documente - ca sa spunem "asociat deja cu plata din dd.mm".
  const txIds = [...new Set([...docs, ...bonuri, ...asteptate].map(d => d.tranzactie_id).filter(Boolean))]
  const txMap = new Map<string, any>()
  for (let i = 0; i < txIds.length; i += 150) {
    const { data } = await sb.from('tranzactii').select('id,data_tranzactie,suma,valuta').in('id', txIds.slice(i, i + 150))
    for (const t of data || []) txMap.set(t.id, t)
  }
  const deja = (txId: string | null) => {
    const t = txId ? txMap.get(txId) : null
    return t ? { data: t.data_tranzactie as string, suma: Number(t.suma), valuta: t.valuta as string } : txId ? { data: null, suma: null, valuta: null } : null
  }

  const target = suma !== null && Number.isFinite(suma) ? Math.abs(suma) : null
  const curs = await cursuriBnrSigur(docs.filter(d => (d.valuta || 'RON').toUpperCase() !== 'RON').map(d => d.data_document))
  const comparare = (sumaDoc: number | null, valuta: string, data: string | null) => {
    const monedaDiferita = target !== null && valuta !== valutaTx
    const conv = valuta !== 'RON' ? inLei(curs, sumaDoc, valuta, data) : null
    return {
      monedaDiferita,
      // Factura in valuta vs. plata in lei: comparam prin echivalentul BNR din ziua facturii.
      diferentaSuma: target !== null && sumaDoc != null
        ? !monedaDiferita ? Math.abs(Number(sumaDoc) - target) : conv && valutaTx === 'RON' ? Math.abs(conv.sumaRon - target) : null
        : null,
      suma_ron: conv?.sumaRon ?? null,
      curs_bnr: conv?.curs ?? null,
      // Cursul real al platii (lei platiti / suma facturii in valuta): banca / curierul / marketplace-ul nu folosesc
      // cursul BNR, deci cursul din plata e cel care conteaza; BNR ramane doar referinta.
      curs_efectiv: monedaDiferita && valutaTx === 'RON' && target !== null && sumaDoc ? Math.round(target / Math.abs(Number(sumaDoc)) * 10000) / 10000 : null,
    }
  }

  let candidates = [
    ...docs.map(d => {
      const valuta = (d.valuta || 'RON').toUpperCase()
      const inbox = String(d.fisier_path).includes('/inbox-facturi/')
      return {
        id: d.id, tabel: 'documente', fisier_nume: d.fisier_nume, furnizor: furnizorCurat(d.furnizor), numar_document: d.numar_document || null,
        suma: d.suma != null ? Number(d.suma) : null, valuta, data_document: d.data_document, created_at: d.created_at,
        sursa: (inbox ? detecteazaSursa(d.furnizor) : 'module') as Sursa, sectiune: sectiune(d.fisier_path),
        deja: deja(d.tranzactie_id), docUrl: `/api/chitante/document?id=${d.id}`, cauta: '',
        ...comparare(d.suma != null ? Number(d.suma) : null, valuta, d.data_document),
      }
    }),
    ...bonuri.map(b => ({
      id: b.id, tabel: 'bonuri', fisier_nume: b.fisier_nume, furnizor: b.comerciant || '', numar_document: null,
      suma: b.suma != null ? Number(b.suma) : null, valuta: 'RON', data_document: b.data_bon, created_at: b.created_at,
      sursa: 'bonuri' as Sursa, sectiune: 'Bonuri', deja: b.status === 'asteptare' ? null : deja(b.tranzactie_id) || { data: null, suma: null, valuta: null },
      docUrl: `/api/bonuri/download?id=${b.id}`, cauta: b.cui_client || '',
      ...comparare(b.suma != null ? Number(b.suma) : null, 'RON', b.data_bon),
    })),
    ...asteptate.map(f => ({
      id: f.id, tabel: 'facturi_asteptate', fisier_nume: f.fisier_nume, furnizor: f.furnizor || '', numar_document: f.numar_document || null,
      suma: f.suma != null ? Number(f.suma) : null, valuta: 'RON', data_document: f.data_factura, created_at: f.created_at,
      sursa: 'deasociat' as Sursa, sectiune: 'Facturi de asociat', deja: f.status === 'asociata' ? deja(f.tranzactie_id) || { data: null, suma: null, valuta: null } : null,
      docUrl: `/api/facturi-asteptate/download?id=${f.id}`, cauta: '',
      ...comparare(f.suma != null ? Number(f.suma) : null, 'RON', f.data_factura),
    })),
  ]

  // Text: furnizor/firma, numar, nume fisier (fara diacritice). Numar: suma (intreg -> intervalul
  // n,00-n,99; cu zecimale -> exact) sau parte din numarul documentului. Data: DD.MM.YYYY / ISO.
  if (q.length >= 2) {
    const qn = ascii(q)
    const variante = [qn, ...(ALIAS[qn] || [])]
    const num = Number(q.replace(/\s/g, '').replace(',', '.'))
    const esteSuma = Number.isFinite(num) && /^[\d\s.,]+$/.test(q) && q.replace(/\D/g, '').length < 8
    const [min, max] = esteSuma ? (/[.,]\d/.test(q) ? [num - 0.01, num + 0.01] : [num, num + 0.999]) : [0, -1]
    const dm = q.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
    const data = dm ? `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` : /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : null
    candidates = candidates.filter(c =>
      variante.some(v => ascii(`${c.furnizor} ${c.numar_document || ''} ${c.fisier_nume || ''} ${c.cauta}`).includes(v)) ||
      (esteSuma && c.suma != null && ((Math.abs(c.suma) >= min && Math.abs(c.suma) <= max) || (c.suma_ron != null && c.suma_ron >= min && c.suma_ron <= max))) ||
      (!!data && c.data_document === data))
  } else {
    candidates = candidates.filter(c => !c.deja)
  }

  const counts: Record<Sursa, number> = { local: 0, gmail: 0, oblio: 0, bonuri: 0, altele: 0, module: 0, deasociat: 0 }
  for (const c of candidates) counts[c.sursa]++

  if (sursaFiltru && sursaFiltru !== 'toate') candidates = candidates.filter(c => c.sursa === sursaFiltru)
  candidates.sort((a, b) => {
    if (!!a.deja !== !!b.deja) return a.deja ? 1 : -1  // cele libere intai
    if (a.diferentaSuma !== null && b.diferentaSuma !== null) return a.diferentaSuma - b.diferentaSuma
    if (a.diferentaSuma !== null) return -1
    if (b.diferentaSuma !== null) return 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return NextResponse.json({ candidates: candidates.slice(0, 100).map(({ cauta, ...c }) => c), counts, total: candidates.length })
}
/* eslint-enable @typescript-eslint/no-explicit-any */
