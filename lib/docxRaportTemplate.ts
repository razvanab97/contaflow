// Transforma raportul lunar (.docx) intr-un "sablon" cu marcaje curate (%%CAMP%%) in locul
// sectiunilor care se schimba lunar, apoi genereaza un document nou din sablon + valorile
// curente ale campurilor - fara editor Word in browser, doar substitutie de text in XML.
//
// De ce nu string-replace direct pe textul original: Word imparte des o fraza pe mai multe
// <w:r> (formatare, spell-check etc.), deci cautarea unei fraze exacte in XML e nesigura.
// In schimb, gasim paragraful intreg (dupa text-ancora, nu pozitie fixa) si il inlocuim cu UN
// singur paragraf nou, construit de noi, cu un singur run - garantat nesplitat, deci gasibil
// sigur mai tarziu cand generam documentul final.

export interface DetectedFields {
  perioada: { value: string }
  autorizatii: { values: string[] }
  obiective: { values: string[] }
  activitati: { values: string[] }
}

const MARKERS = {
  perioada: '%%PERIOADA%%',
  autorizatii: '%%AUTORIZATII%%',
  obiective: '%%OBIECTIVE%%',
  activitati: '%%ACTIVITATI%%',
} as const

function getParagraphs(xml: string): string[] {
  return xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || []
}
function paraText(p: string): string {
  return p.replace(/<[^>]+>/g, '').trim()
}
function xmlEscape(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function getParaPr(p: string): string {
  return p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] || ''
}
function getParaOpenTag(p: string): string {
  return p.match(/^<w:p\b[^>]*>/)?.[0] || '<w:p>'
}
function getFirstRunPr(p: string): string {
  const run = p.match(/<w:r>[\s\S]*?<w:rPr>[\s\S]*?<\/w:rPr>/)
  if (!run) return ''
  return run[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || ''
}
function buildParagraph(shapeFrom: string, text: string): string {
  return `${getParaOpenTag(shapeFrom)}${getParaPr(shapeFrom)}<w:r>${getFirstRunPr(shapeFrom)}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`
}

const isHeadingOrStop = (t: string) => /^\d+\.\s/.test(t) || /reprezentant legal/i.test(t)

function findParaIndex(paras: string[], startsWith: string): number {
  const i = paras.findIndex(p => paraText(p).toLowerCase().startsWith(startsWith.toLowerCase()))
  if (i === -1) throw new Error(`Ancora "${startsWith}" nu a fost găsită în document — structura șablonului s-a schimbat?`)
  return i
}

function collectUntilStop(paras: string[], afterIdx: number): number[] {
  const items: number[] = []
  for (let i = afterIdx + 1; i < paras.length; i++) {
    const t = paraText(paras[i])
    if (!t) continue
    if (isHeadingOrStop(t)) break
    items.push(i)
  }
  if (!items.length) throw new Error('Nicio linie găsită pentru secțiune — structura șablonului s-a schimbat?')
  return items
}

interface Ranges {
  perioada: { paraIdx: number; value: string }
  autorizatii: { range: [number, number]; values: string[] }
  obiective: { range: [number, number]; values: string[] }
  activitati: { range: [number, number]; values: string[] }
}

function detect(xml: string): Ranges {
  const paras = getParagraphs(xml)
  const pPerioada = findParaIndex(paras, 'Perioada de raportare:')
  const pAutoriz = findParaIndex(paras, 'Autorizatiile necesare')
  const autorizIdx = collectUntilStop(paras, pAutoriz)
  const pObiective = findParaIndex(paras, '2.')
  const obiectiveIdx = collectUntilStop(paras, pObiective)
  const pActivitati = findParaIndex(paras, '4.')
  const activitatiIdx = collectUntilStop(paras, pActivitati)

  return {
    perioada: { paraIdx: pPerioada, value: paraText(paras[pPerioada]).replace(/^Perioada de raportare:\s*/i, '') },
    autorizatii: { range: [autorizIdx[0], autorizIdx[autorizIdx.length - 1]], values: autorizIdx.map(i => paraText(paras[i])) },
    obiective: { range: [obiectiveIdx[0], obiectiveIdx[obiectiveIdx.length - 1]], values: obiectiveIdx.map(i => paraText(paras[i])) },
    activitati: { range: [activitatiIdx[0], activitatiIdx[activitatiIdx.length - 1]], values: activitatiIdx.map(i => paraText(paras[i])) },
  }
}

/** Detecteaza campurile editabile si valorile lor curente, fara sa modifice XML-ul. */
export function detectCurrentFields(documentXml: string): DetectedFields {
  const r = detect(documentXml)
  return {
    perioada: { value: r.perioada.value },
    autorizatii: { values: r.autorizatii.values },
    obiective: { values: r.obiective.values },
    activitati: { values: r.activitati.values },
  }
}

/** Inlocuieste sectiunile care se schimba lunar cu marcaje curate — rezultatul e "sablonul". */
export function buildTemplate(documentXml: string): string {
  const fields = detect(documentXml)
  let xml = documentXml
  let paras = getParagraphs(xml)

  function replaceRange(startIdx: number, endIdx: number, text: string) {
    const target = paras.slice(startIdx, endIdx + 1).join('')
    const newPara = buildParagraph(paras[startIdx], text)
    const at = xml.indexOf(target)
    if (at === -1) throw new Error('Interval de paragrafe negăsit la consolidare')
    xml = xml.slice(0, at) + newPara + xml.slice(at + target.length)
    paras = getParagraphs(xml)
  }

  const ordered = [
    { r: fields.activitati.range, marker: MARKERS.activitati },
    { r: fields.obiective.range, marker: MARKERS.obiective },
    { r: fields.autorizatii.range, marker: MARKERS.autorizatii },
    { r: [fields.perioada.paraIdx, fields.perioada.paraIdx] as [number, number], marker: `Perioada de raportare: ${MARKERS.perioada}` },
  ].sort((a, b) => b.r[0] - a.r[0]) // de jos in sus, ca indecsii inca neatinsi sa nu se deplaseze

  for (const { r, marker } of ordered) replaceRange(r[0], r[1], marker)
  return xml
}

export interface RaportFieldValues {
  perioada: string
  autorizatii: string[]
  obiective: string[]
  activitati: string[]
}

/** Genereaza document.xml final dintr-un sablon (produs de buildTemplate) + valorile curente. */
export function generateFromTemplate(templateXml: string, values: RaportFieldValues): string {
  function expandMarker(xml: string, marker: string, lines: string[]): string {
    const target = getParagraphs(xml).find(p => p.includes(`>${marker}<`))
    if (!target) throw new Error(`Marcaj ${marker} negăsit în șablon`)
    const safeLines = lines.filter(l => l.trim())
    if (!safeLines.length) throw new Error('Cel puțin o linie e obligatorie pentru fiecare secțiune')
    return xml.replace(target, safeLines.map(l => buildParagraph(target, l)).join(''))
  }

  let xml = templateXml.replace(MARKERS.perioada, xmlEscape(values.perioada))
  xml = expandMarker(xml, MARKERS.autorizatii, values.autorizatii)
  xml = expandMarker(xml, MARKERS.obiective, values.obiective)
  xml = expandMarker(xml, MARKERS.activitati, values.activitati)
  return xml
}
