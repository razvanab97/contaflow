import JSZip from 'jszip'

// Completarea „spațiilor de completat" (liniile „______") dintr-un .docx care NU are marcaje %%CAMP%%,
// ci doar linii goale de completat (ex. rapoarte scrise de mână). Le numerotăm în ordinea din document
// (stânga→dreapta), AI-ul decide pentru fiecare ce valoare internă se potrivește, iar noi le înlocuim.
// Numerotarea e identică la „citire context" și la „umplere", pentru că ambele folosesc același parcurs.

const RE_WT = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g // noduri de text Word
const RE_BLANK = /_{3,}/g                                // un „spațiu de completat" = 3+ liniuțe de subliniere
// Unele șabloane nu folosesc liniuțe, ci textul-indiciu „De completat" / „Data de completat" / „Durata: De completat".
// Tratăm și asta ca spațiu de completat: tot nodul (sau partea de după „etichetă:") e locul de umplut.
// Prefix acceptat: gol, „Data", sau o etichetă scurtă care se termină cu „:". Astfel nu prindem text din proză
// de genul „documentele sunt de completat de către…".
const RE_PLACEHOLDER = /^(\s*(?:[^:：\n]{0,40}[:：]\s*)?)(?:data\s+)?de\s+completat\.?\s*$/i
const prefixPlaceholder = (text: string): string | null => { const m = String(text).match(RE_PLACEHOLDER); return m ? (m[1] ?? '') : null }
const escXml = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const unesc = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#10;/g, ' ')

// Parcurge nodurile de text în ordine și, pentru fiecare „spațiu de completat", cheamă onBlank(idx).
// Dacă onBlank întoarce un string, înlocuiește spațiul cu el; dacă întoarce null, îl lasă neatins.
function parcurge(xml: string, onBlank: (idx: number) => string | null): { xml: string; total: number } {
  let idx = 0
  const out = xml.replace(RE_WT, (_full, open, text, close) => {
    const pre = prefixPlaceholder(text) // tot nodul e un indiciu „(…: )(Data )de completat"
    if (pre !== null) {
      idx++
      const rep = onBlank(idx)
      return rep == null || rep === '' ? open + text + close : open + escXml(pre + String(rep)) + close
    }
    const nou = String(text).replace(RE_BLANK, (g: string) => {
      idx++
      const rep = onBlank(idx)
      return rep == null || rep === '' ? g : escXml(rep)
    })
    return open + nou + close
  })
  return { xml: out, total: idx }
}

// Doar document.xml (antet/subsol rar au astfel de linii; le putem adăuga ulterior dacă e nevoie).
async function incarca(bytes: Uint8Array | ArrayBuffer | Buffer) {
  const zip = await JSZip.loadAsync(bytes)
  const nume = Object.keys(zip.files).find(n => n === 'word/document.xml')
  if (!nume) throw new Error('document.xml lipsește')
  return { zip, nume, xml: await zip.file(nume)!.async('string') }
}

// Construiește o reprezentare citibilă a documentului, cu fiecare spațiu marcat ⟦k⟧,
// păstrând structura (rândurile de tabel devin „celulă | celulă | …", paragrafele devin linii).
function citibil(xmlCuTokeni: string): string {
  const body = xmlCuTokeni.match(/<w:body[\s\S]*?<\/w:body>/)?.[0] || xmlCuTokeni
  let s = body
    .replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, (_m, t) => '\u0000' + t + '\u0000') // protejează textul
    .replace(/<w:tab\b[^>]*\/>/g, ' ')
    .replace(/<\/w:tc>/g, '\u0001') // separator de celulă
    .replace(/<\/w:tr>/g, '\u0002') // sfârșit de rând
    .replace(/<\/w:p>/g, '\u0003')  // sfârșit de paragraf
    .replace(/<[^>]+>/g, '')        // scoate restul etichetelor (textul protejat rămâne)
    .replace(/\u0000/g, '')         // scoate marcajele de protecție
  s = unesc(s)
    .replace(/[ \t]*\u0001[ \t]*/g, ' | ')
    .replace(/\u0002/g, '\n')
    .replace(/\u0003/g, '\n')
  return s.split('\n').map(l => l.replace(/\s+\|\s+$/, '').replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, 14000)
}

export interface ContextBlanks { context: string; total: number }

// Citește documentul, numerotează spațiile și întoarce contextul citibil + numărul total de spații.
export async function extrageContextBlanks(bytes: Uint8Array | ArrayBuffer | Buffer): Promise<ContextBlanks> {
  const { xml } = await incarca(bytes)
  // înlocuiește fiecare spațiu cu tokenul ⟦k⟧ într-o copie, doar ca să construim textul citibil
  const { xml: cuTokeni, total } = parcurge(xml, idx => `⟦${idx}⟧`)
  return { context: citibil(cuTokeni), total }
}

// Umple spațiile cu valorile date (cheie = numărul spațiului). Cele fără valoare rămân linii de completat.
// `remap` = numărul vechi al unui spațiu rămas (necompletat) -> numărul lui în documentul rezultat (renumerotat),
// ca să putem adresa aceleași spații și după o completare parțială.
export async function umpleBlanks(bytes: Uint8Array | ArrayBuffer | Buffer, valori: Record<string, string>): Promise<{ bytes: Uint8Array; completate: number; total: number; remap: Record<string, number> }> {
  const { zip, nume, xml } = await incarca(bytes)
  let completate = 0, ramase = 0
  const remap: Record<string, number> = {}
  const { xml: nou, total } = parcurge(xml, idx => {
    const v = valori[String(idx)]
    if (v != null && String(v).trim() !== '') { completate++; return String(v) }
    ramase++; remap[String(idx)] = ramase; return null
  })
  zip.file(nume, nou)
  return { bytes: await zip.generateAsync({ type: 'uint8array' }), completate, total, remap }
}
