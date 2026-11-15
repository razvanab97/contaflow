import { extractText, getDocumentProxy } from 'unpdf'
import { MODULE_DEFS } from '@/lib/firma-config'

// Ordinea documentelor eMAG la export (ZIP / PDF pentru contabil): fiecare AVIZ DE PLATA urmat imediat de facturile
// din el, in ordinea din tabelul avizului, apoi urmatorul aviz (cerut direct: „aviz de plată - apoi facturile din acel
// aviz și tot așa la fiecare”). Facturile se recunosc dupa seria lor scrisa in textul avizului (ex. C-MKTP-5940318);
// cele negasite in niciun aviz merg la avizul din grupul lor (piata + perioada) cu data cea mai apropiata (>= data
// facturii), altfel la finalul grupului. Grupurile pastreaza ordinea task-urilor eMAG; facturile Dante (emag-calcul) la final.

export interface DocEmag { fisier_path: string; furnizor?: string | null; created_at?: string; numar_document?: string | null; data_document?: string | null }

const esteAviz = (d: DocEmag) => d.fisier_path.includes('/emag-avize/')
const esteFactura = (d: DocEmag) => d.fisier_path.includes('/emag-facturi/')
const dataDoc = (d: DocEmag) => String(d.data_document || d.created_at || '').slice(0, 10)
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export async function textPdf(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  try {
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes instanceof ArrayBuffer ? bytes.slice(0) : bytes.slice())), { mergePages: true })
    return String(text).replace(/\s+/g, ' ')
  } catch { return '' }
}

export async function ordoneazaEmag<T extends DocEmag>(items: T[], textAviz: (d: T) => Promise<string>): Promise<T[]> {
  const ordineTask = (MODULE_DEFS.emag?.tasks || []).filter(t => t.key.startsWith('emag.aviz_')).map(t => t.key)
  const avize = items.filter(esteAviz).sort((a, b) => dataDoc(a).localeCompare(dataDoc(b)) || String(a.created_at || '').localeCompare(String(b.created_at || '')))
  const facturi = items.filter(esteFactura)
  const altele = items.filter(d => !esteAviz(d) && !esteFactura(d)).sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))

  // 1) potrivire dupa seria facturii in textul avizului (pozitia = ordinea din tabel)
  const texte = await Promise.all(avize.map(a => textAviz(a).catch(() => '')))
  const laAviz = new Map<T, { aviz: T; poz: number }>()
  for (const f of facturi) {
    const nr = String(f.numar_document || '').trim()
    if (!nr) continue
    const re = new RegExp(`(?<![A-Za-z0-9-])${escRe(nr)}(?![A-Za-z0-9])`, 'i')
    for (let i = 0; i < avize.length; i++) {
      const m = re.exec(texte[i]); if (m) { laAviz.set(f, { aviz: avize[i], poz: m.index }); break }
    }
  }
  // 2) rezerva: avizul din acelasi grup cu prima data >= data facturii
  for (const f of facturi) {
    if (laAviz.has(f)) continue
    const dinGrup = avize.filter(a => (a.furnizor || '') === (f.furnizor || ''))
    const a = dinGrup.find(x => dataDoc(x) >= dataDoc(f))
    if (a) laAviz.set(f, { aviz: a, poz: Number.MAX_SAFE_INTEGER })
  }

  const grupuri = [...ordineTask, ...[...new Set(items.map(d => d.furnizor || ''))].filter(k => !ordineTask.includes(k))]
  const rezultat: T[] = []
  for (const g of grupuri) {
    for (const a of avize.filter(x => (x.furnizor || '') === g)) {
      rezultat.push(a)
      rezultat.push(...facturi.filter(f => laAviz.get(f)?.aviz === a)
        .sort((x, y) => (laAviz.get(x)!.poz - laAviz.get(y)!.poz) || dataDoc(x).localeCompare(dataDoc(y))))
    }
    rezultat.push(...facturi.filter(f => !laAviz.has(f) && (f.furnizor || '') === g).sort((x, y) => dataDoc(x).localeCompare(dataDoc(y))))
  }
  // orice a ramas (siguranta: nimic nu se pierde din export), apoi Dante
  const pus = new Set(rezultat)
  rezultat.push(...items.filter(d => (esteAviz(d) || esteFactura(d)) && !pus.has(d)))
  return [...rezultat, ...altele]
}
