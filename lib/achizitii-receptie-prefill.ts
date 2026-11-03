// Precompletarea Anexei 3 (proces-verbal de receptie) din documentele reale ale dosarului de
// achizitie: factura fiscala (sursa principala), comanda / avizul de plata (comanda online) si
// dovada platii. AI-ul doar CITESTE documentele (vezi api/achizitii/receptie/precompletare); aici
// propunerea se construieste determinist, iar tot ce nu reiese din documente (data reala a livrarii,
// starea bunurilor, garantia, fotografiile) apare explicit in lista "de verificat".
import type { Draft, Line } from './proiect-workflow'

export interface ProdusFactura { denumire: string; specificatii: string; um: string; cantitate: number; pretUnitarFaraTva: number; tip: 'produs' | 'serviciu' | 'transport' }
export interface ReceptieExtract {
  furnizor: string | null; cui: string | null; regCom: string | null; clientCui: string | null
  facturaNumar: string | null; facturaData: string | null
  comandaNumar: string | null; comandaData: string | null; online: boolean | null
  plataSuma: number | null; plataData: string | null; plataNumar: string | null
  garantie: string | null; livrareData: string | null
  produse: ProdusFactura[]; warnings: string[]
}
export interface DosarReceptie { garantie: boolean; poze: boolean; plata: boolean; comanda: boolean }
export interface PropunereReceptie { draft: Draft; verificari: string[]; surse: string[] }

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v !== 'string') return null
  // "2.247,87" (format romanesc) sau "2247.87"
  const s = v.replace(/\s|lei|ron/gi, '')
  const n = Number(/,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
// Datele vin ca ZZ.LL.AAAA (formatul formularelor); acceptam si ZZ/LL/AAAA sau AAAA-LL-ZZ.
export function dataRo(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (m) return `${m[1].padStart(2, '0')}.${m[2].padStart(2, '0')}.${m[3]}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : null
}
const lei = (n: number) => n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function parseReceptieExtract(raw: string): ReceptieExtract | null {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return null
  let p: any
  try { p = JSON.parse(m[0]) } catch { return null }
  const produse: ProdusFactura[] = (Array.isArray(p.produse) ? p.produse : []).map((x: any) => ({
    denumire: str(x?.denumire) || '',
    specificatii: str(x?.specificatii) || '',
    um: str(x?.um) || 'buc',
    cantitate: num(x?.cantitate) ?? 0,
    pretUnitarFaraTva: num(x?.pretUnitarFaraTva) ?? 0,
    tip: ['serviciu', 'transport'].includes(x?.tip) ? x.tip : 'produs',
  })).filter((x: ProdusFactura) => x.denumire && x.cantitate > 0 && x.pretUnitarFaraTva >= 0)
  return {
    furnizor: str(p.furnizor), cui: str(p.cui), regCom: str(p.regCom), clientCui: str(p.clientCui),
    facturaNumar: str(p.facturaNumar), facturaData: dataRo(p.facturaData),
    comandaNumar: str(p.comandaNumar), comandaData: dataRo(p.comandaData), online: typeof p.online === 'boolean' ? p.online : null,
    plataSuma: num(p.plataSuma), plataData: dataRo(p.plataData), plataNumar: str(p.plataNumar),
    garantie: str(p.garantie), livrareData: dataRo(p.livrareData),
    produse, warnings: (Array.isArray(p.warnings) ? p.warnings : []).map(str).filter(Boolean) as string[],
  }
}

// Specificatiile minime salvate la crearea achizitiei ("Caracteristici minime\n• Putere minima: ...").
function cerinteMinime(specsMinime: string) {
  return specsMinime.split('\n').map(l => l.replace(/^[•\-\s]+/, '').trim()).filter(l => l && !/^caracteristici minime/i.test(l))
}

export function buildReceptieDraft(current: Draft, ex: ReceptieExtract, ctx: { numarPropus: string; specsMinime: string; dosar: DosarReceptie; beneficiarCui?: string }): PropunereReceptie {
  const verificari: string[] = []
  const surse: string[] = []
  const produse = ex.produse.filter(p => p.tip === 'produs')
  const extra = ex.produse.filter(p => p.tip !== 'produs')
  if (!produse.length) throw new Error('Nu am găsit pe factură produse recepționabile. Verifică dacă factura încărcată aparține acestei achiziții.')

  const furnizor = [ex.furnizor, [ex.cui && `CUI ${ex.cui}`, ex.regCom].filter(Boolean).join(', ')].filter(Boolean).join(' (') + (ex.cui || ex.regCom ? ')' : '')
  const factura = ex.facturaNumar ? `factura fiscală ${ex.facturaNumar}${ex.facturaData ? ` din ${ex.facturaData}` : ''}` : null
  const facturii = ex.facturaNumar ? `facturii fiscale ${ex.facturaNumar}${ex.facturaData ? ` din ${ex.facturaData}` : ''}` : null
  const online = ex.online ?? !!ex.comandaNumar
  const comanda = ex.comandaNumar ? `comanda online nr. ${ex.comandaNumar}${ex.comandaData ? ` din ${ex.comandaData}` : ''}` : null

  // Data receptiei = data reala a livrarii; daca documentele nu o arata, propunem data facturii.
  const data = ex.livrareData || ex.facturaData || ''
  if (!ex.livrareData) verificari.push(`Data recepției: am propus data facturii (${ex.facturaData || 'necunoscută'}). Schimb-o cu data reală a livrării, dacă e alta.`)
  verificari.push(`Numărul procesului-verbal: am propus ${ctx.numarPropus}, următorul din registrul PV-urilor generate în proiect. Confirmă-l în registrul intern.`)

  const descriereProduse = produse.map(p => `${p.cantitate} ${p.um} ${p.denumire}${p.specificatii ? ` (${p.specificatii})` : ''}`).join('; ')
  const minime = cerinteMinime(ctx.specsMinime)
  const anexe = ['factura fiscală', ctx.dosar.comanda && 'comanda / avizul de plată', ctx.dosar.plata && 'dovada plății', 'certificatul de garanție', 'fotografii ale echipamentului'].filter(Boolean)
  if (!ctx.dosar.garantie) verificari.push(`Certificatul de garanție nu e încărcat în dosar${ex.garantie ? ` (pe factură: ${ex.garantie})` : ''}. Încarcă-l sau scoate-l din anexe.`)
  if (!ctx.dosar.poze) verificari.push('Fotografiile echipamentului nu sunt încărcate în dosar. Încarcă-le sau scoate-le din anexe.')
  verificari.push('Confirmă că produsul a fost livrat complet și fără deteriorări, așa cum scrie la constatări. Dacă nu, corectează textul.')

  const constatari = [
    `Au fost recepționate: ${descriereProduse}${facturii ? `, conform ${facturii}${ex.furnizor ? ` emise de ${ex.furnizor}` : ''}` : ''}.`,
    `Produsele au fost livrate complet, în cantitatea comandată, fără deteriorări vizibile${minime.length ? `, și corespund specificațiilor tehnice minime din cererea de ofertă (${minime.join('; ')})` : ''}.`,
    extra.length ? `Pe aceeași factură: ${extra.map(p => `${p.denumire} - ${lei(p.cantitate * p.pretUnitarFaraTva)} lei fără TVA`).join('; ')}.` : null,
    [comanda && `Achiziția s-a făcut prin ${comanda}`, ex.plataSuma != null && `plătită integral: ${lei(ex.plataSuma)} lei${ex.plataNumar ? `, OP nr. ${ex.plataNumar}` : ''}${ex.plataData ? ` din ${ex.plataData}` : ''}`].filter(Boolean).join(', ') || null,
    `Anexe: ${anexe.join(', ')}.`,
  ].filter(Boolean).map(s => s!.endsWith('.') ? s : s + '.').join(' ')
  if (extra.length) verificari.push(`Pe factură apar și ${extra.map(p => p.denumire).join(', ')}. Le-am trecut la constatări, nu în tabelul produselor recepționate; adaugă-le în tabel dacă intră în achiziție.`)

  const lines: Line[] = produse.map(p => ({
    supplier: ex.furnizor || '', product: p.denumire, specs: p.specificatii || minime.join('; '),
    unit: p.um, qty: String(p.cantitate), price: p.pretUnitarFaraTva.toFixed(2), priceMode: 'net',
    currency: 'RON', rate: '1', source: factura ? `Factura ${ex.facturaNumar}` : 'Factura din dosar', date: ex.facturaData || '',
  }))

  const fields: Record<string, string> = {
    ...current.fields,
    comanda_online: online ? 'da' : 'nu',
    numar: ctx.numarPropus,
    data,
    furnizor,
    // in sablon: "Prestator/Furnizor: X, reprezentat prin %%reprezentant_furnizor%%"
    reprezentant_furnizor: online ? `— (${comanda || 'comandă online'}; recepție fără reprezentant al furnizorului)` : (current.fields.reprezentant_furnizor || ''),
    referinta: [factura && factura[0].toUpperCase() + factura.slice(1), comanda].filter(Boolean).join('; '),
    constatari,
  }
  if (!online) verificari.push('Comandă clasică (nu online): completează numele reprezentantului furnizorului prezent la recepție.')
  // Factura trebuie emisa pe firma proiectului - altfel nu poate sta la baza receptiei.
  const cifre = (v: string | null | undefined) => String(v || '').replace(/\D/g, '')
  if (ctx.beneficiarCui && ex.clientCui && cifre(ex.clientCui) !== cifre(ctx.beneficiarCui)) verificari.unshift(`Atenție: factura e emisă pe CUI ${ex.clientCui}, nu pe beneficiarul proiectului (CUI ${ctx.beneficiarCui}).`)
  // Avertismentele AI care repeta verificarile de mai sus (data livrarii, garantia, clientul) nu mai adauga nimic.
  for (const w of ex.warnings) if (!/livr|garan|client|beneficiar|cod fiscal|cui/i.test(w)) verificari.push(`Din documente: ${w}`)

  if (factura) surse.push(`Factura ${ex.facturaNumar}`)
  if (comanda) surse.push(`Comanda ${ex.comandaNumar}`)
  if (ex.plataSuma != null) surse.push('Dovada plății')
  return { draft: { fields, lines }, verificari, surse }
}

// Clasificarea documentelor din dosar dupa nume / categorie (fara AI).
export function clasificaDocument(d: { fisier_nume: string; tip_document: string | null }) {
  const n = d.fisier_nume.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (['oferta', 'nota', 'receptie'].includes(d.tip_document || '')) return null
  if (/factur|invoice/.test(n)) return 'factura'
  if (/garant/.test(n)) return 'garantie'
  if (/proforma|aviz|comand|order/.test(n)) return 'comanda'
  if (/dovad|plat|payment|confirmare|\bop\b/.test(n)) return 'plata'
  if (d.tip_document === 'poza' || /poz|foto|\.(jpe?g|png|heic)$/.test(n)) return 'poza'
  return null
}
