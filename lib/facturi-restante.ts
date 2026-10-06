import { getServiceSupabase } from '@/lib/supabase/server'
import { collectPaged } from '@/lib/raport-lunar'
import { daysBetween, furnizorInDescriere } from '@/lib/tranzactii-potrivire'
import { FURNIZORI_PRODUSE } from '@/lib/achizitii-produse'

// "Facturi restante" se raporteaza la Extras de cont: o factura pentru care exista deja plata in extras
// nu mai e restanta. Doua semne in documente.asociere_detalii (nu cer migrare):
//   - PREFIX_AUTO   = marcata platita automat, cu explicatia (de unde stim ca e platita);
//   - MARCAJ_RESPINS = omul a anulat o plata marcata automat -> nu se mai marcheaza singura.
export const PREFIX_AUTO = 'Plătită automat din Extras de cont'
export const MARCAJ_RESPINS = 'Plata automată din Extras a fost respinsă manual'

type Sb = ReturnType<typeof getServiceSupabase>
interface Tx { id: string; data_tranzactie: string; tip: string; suma: number | string; valuta: string | null; descriere: string | null; descriere_curatata: string | null; referinta: string | null; document_id: string | null }
interface Doc { id: string; furnizor: string | null; numar_document: string | null; suma: number | string | null; valuta: string | null; data_document: string | null; platit: boolean | null; tranzactie_id: string | null; asociere_detalii: string | null; fisier_nume?: string | null }
export interface FacturaMarcata { id: string; numar: string | null; suma: number; valuta: string; motiv: string; plata: { data: string; suma: number; valuta: string; descriere: string } }

const norm = (s: string | null | undefined) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const alnum = (s: string | null | undefined) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const val = (v: string | null | undefined) => (v || 'RON').toUpperCase()
const furn = (d: { furnizor: string | null }) => String(d.furnizor || '').split('|')[0].trim()
const txText = (t: Tx) => [t.descriere_curatata, t.descriere, t.referinta].filter(Boolean).join(' ')
const dataRo = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`
const sumaEgala = (d: Doc, t: Tx) => val(d.valuta) === val(t.valuta) && Math.abs(Math.abs(Number(d.suma)) - Math.abs(Number(t.suma))) <= 0.01

// Acelasi furnizor: grupul de alias din lista de furnizori de marfa (Maxy = ISO TRADE in extras) sau un
// cuvant al numelui (>= 4 litere, ca in potrivirea din Extras). "Categorie: altul" nu e un nume.
function grup(text: string) { return FURNIZORI_PRODUSE.find(f => f.rx.test(norm(text)))?.nume }
function acelasiFurnizor(a: Doc, b: { furnizor: string | null }) {
  const ga = grup(furn(a)), gb = grup(furn(b))
  return (!!ga && ga === gb) || (furnizorInDescriere(furn(a), { descriere: furn(b) }) && !/^categorie/i.test(furn(a)))
}

// dryRun = doar simulare: intoarce ce ar marca, fara sa scrie nimic.
export async function reconciliazaFacturiRestante(sb: Sb, firmaId: string, opts: { dryRun?: boolean } = {}): Promise<{ marcate: FacturaMarcata[]; verificate: number }> {
  const docs = await collectPaged<Doc>((a, b) => sb.from('documente')
    .select('id,furnizor,numar_document,suma,valuta,data_document,platit,tranzactie_id,asociere_detalii,fisier_nume')
    .eq('firma_id', firmaId).or('fisier_path.like.%/facturi-restante/%,fisier_path.like.%/inbox-facturi/%')
    .order('id').range(a, b) as any)
  const candidate = docs.filter(d => !d.platit && d.suma != null && Number(d.suma) > 0 && !String(d.asociere_detalii || '').includes(MARCAJ_RESPINS))
  if (!candidate.length) return { marcate: [], verificate: 0 }

  const luni = await sb.from('luni_contabile').select('id').eq('firma_id', firmaId)
  if (luni.error) throw new Error(luni.error.message)
  const extrase = (luni.data || []).length ? await sb.from('extrase').select('id').in('luna_id', (luni.data || []).map(l => l.id)) : { data: [], error: null }
  if (extrase.error) throw new Error(extrase.error.message)
  const extrasIds = (extrase.data || []).map(e => e.id)
  if (!extrasIds.length) return { marcate: [], verificate: candidate.length }
  const txs = await collectPaged<Tx>((a, b) => sb.from('tranzactii')
    .select('id,data_tranzactie,tip,suma,valuta,descriere,descriere_curatata,referinta,document_id')
    .in('extras_id', extrasIds).order('id').range(a, b) as any)
  const txById = new Map(txs.map(t => [t.id, t]))
  const debit = txs.filter(t => t.tip === 'debit')

  // Documentele deja legate de fiecare plata: prin tranzactii.document_id (oricare modul) sau documente.tranzactie_id.
  const docById = new Map(docs.map(d => [d.id, d]))
  const lipsa = [...new Set(txs.map(t => t.document_id).filter((id): id is string => !!id && !docById.has(id)))]
  for (let i = 0; i < lipsa.length; i += 100) {
    const r = await sb.from('documente').select('id,furnizor,numar_document,suma,valuta,data_document,platit,tranzactie_id,asociere_detalii').in('id', lipsa.slice(i, i + 100))
    for (const d of (r.data || []) as Doc[]) docById.set(d.id, d)
  }
  const legate = new Map<string, Doc[]>()
  const leaga = (txId: string, d: Doc) => { const l = legate.get(txId) || []; if (!l.some(x => x.id === d.id)) l.push(d); legate.set(txId, l) }
  for (const t of txs) if (t.document_id && docById.get(t.document_id)) leaga(t.id, docById.get(t.document_id)!)
  for (const d of docs) if (d.tranzactie_id) leaga(d.tranzactie_id, d)

  const marcate: FacturaMarcata[] = []
  const rezolvate = new Set<string>()
  const platiLibereFolosite = new Set<string>()
  const marcheaza = async (d: Doc, t: Tx, motiv: string) => {
    if (!opts.dryRun) {
      const { error } = await sb.from('documente').update({ platit: true, data_platii: String(t.data_tranzactie).slice(0, 10), asociere_detalii: `${PREFIX_AUTO} · plata din ${dataRo(String(t.data_tranzactie))} · ${Math.abs(Number(t.suma)).toFixed(2)} ${val(t.valuta)} · ${motiv}` }).eq('id', d.id)
      if (error) return
    }
    rezolvate.add(d.id)
    marcate.push({ id: d.id, numar: d.numar_document, suma: Number(d.suma), valuta: val(d.valuta), motiv, plata: { data: String(t.data_tranzactie).slice(0, 10), suma: Math.abs(Number(t.suma)), valuta: val(t.valuta), descriere: String(t.descriere || t.descriere_curatata || '').replace(/\s+/g, ' ').trim().slice(0, 100) } })
  }

  // 1) Documentul e deja legat de o plata din extras (legatura exista, doar statusul nu era pus).
  for (const d of candidate) {
    const t = d.tranzactie_id ? txById.get(d.tranzactie_id) : null
    if (t) await marcheaza(d, t, 'documentul e legat de această plată')
  }

  // 2) Numarul facturii apare in descrierea platii, cu aceeasi suma si moneda (ex. „Proforma 4073;...PracticMagazin”).
  for (const d of candidate.filter(x => !rezolvate.has(x.id))) {
    const n = alnum(d.numar_document)
    if (n.length < 4) continue
    const gasite = debit.filter(t => sumaEgala(d, t) && alnum(txText(t)).includes(n))
      .sort((a, b) => (d.data_document ? daysBetween(d.data_document, a.data_tranzactie) - daysBetween(d.data_document, b.data_tranzactie) : 0))
    const t = gasite[0]
    if (t && (!d.data_document || (new Date(String(t.data_tranzactie).slice(0, 10)).getTime() - new Date(String(d.data_document).slice(0, 10)).getTime()) / 86400000 >= -30))
      await marcheaza(d, t, `numărul facturii ${d.numar_document} apare în descrierea plății`)
  }

  // 3) Plata e libera (nu e legata de niciun document) si se potriveste ca suma + furnizor + data; sau
  // 4) plata e legata de un document al ACELUIASI furnizor, cu aceeasi suma si data facturii la cel mult
  //    10 zile - aceeasi factura intrata de doua ori (alt numar). Facturile recurente cu aceeasi suma,
  //    dar la zeci de zile distanta, NU sunt duplicate.
  const perechi: { zile: number; d: Doc; t: Tx; duplicat: Doc | null; motiv: string }[] = []
  for (const d of candidate.filter(x => !rezolvate.has(x.id))) {
    for (const t of debit) {
      if (!sumaEgala(d, t)) continue
      const delta = d.data_document ? (new Date(String(t.data_tranzactie).slice(0, 10)).getTime() - new Date(String(d.data_document).slice(0, 10)).getTime()) / 86400000 : 0
      if (delta < -10 || delta > 120) continue
      const lk = legate.get(t.id) || []
      if (!lk.length) {
        const dovada = (grup(furn(d)) && grup(furn(d)) === grup(txText(t))) || (!/^categorie/i.test(furn(d)) && furnizorInDescriere(furn(d), t))
        if (dovada) perechi.push({ zile: Math.abs(delta), d, t, duplicat: null, motiv: 'aceeași sumă și același furnizor' })
      } else {
        const dup = lk.find(l => sumaEgala(l, t) && acelasiFurnizor(d, l) && d.data_document && l.data_document && daysBetween(d.data_document, l.data_document) <= 10)
        if (dup) perechi.push({ zile: Math.abs(delta), d, t, duplicat: dup, motiv: `aceeași plată ca documentul ${dup.numar_document || ''} (același furnizor, aceeași sumă)`.replace('  ', ' ') })
      }
    }
  }
  perechi.sort((a, b) => a.zile - b.zile)
  for (const p of perechi) {
    if (rezolvate.has(p.d.id)) continue
    if (!p.duplicat && platiLibereFolosite.has(p.t.id)) continue
    await marcheaza(p.d, p.t, p.motiv)
    if (rezolvate.has(p.d.id) && !p.duplicat) platiLibereFolosite.add(p.t.id)
  }
  return { marcate, verificate: candidate.length }
}
