import JSZip from 'jszip'

// Cititor minimal de .xlsx (fara dependinte noi): un .xlsx e un zip cu XML. Intoarce randurile unei foi
// ca valori text / numar. Suficient pentru rapoartele exportate de platforme (fara formule de evaluat).
export type Celula = string | number | null

const decode = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&')
const textDin = (xml: string) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => decode(m[1])).join('')
const colIndex = (ref: string) => {
  const litere = ref.match(/^[A-Z]+/)?.[0] || 'A'
  return [...litere].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1
}

export async function foiXlsx(bytes: Uint8Array | ArrayBuffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes)
  const wb = await zip.file('xl/workbook.xml')?.async('string')
  return wb ? [...wb.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map(m => decode(m[1])) : []
}

export async function citesteFoaieXlsx(bytes: Uint8Array | ArrayBuffer, numeFoaie?: string): Promise<Celula[][]> {
  const zip = await JSZip.loadAsync(bytes)
  const wb = await zip.file('xl/workbook.xml')?.async('string')
  const rels = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')
  if (!wb || !rels) throw new Error('Fișierul nu e un .xlsx valid')

  const foi = [...wb.matchAll(/<sheet\b([^>]*)\/?>/g)].map(m => ({
    nume: decode(m[1].match(/\bname="([^"]*)"/)?.[1] || ''),
    rid: m[1].match(/\br:id="([^"]*)"/)?.[1] || '',
  }))
  const foaie = (numeFoaie ? foi.find(f => f.nume === numeFoaie) : foi[0])
  if (!foaie) throw new Error(`Foaia „${numeFoaie}” lipsește`)
  const tinta = [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)]
    .map(m => ({ id: m[1].match(/\bId="([^"]*)"/)?.[1], target: m[1].match(/\bTarget="([^"]*)"/)?.[1] || '' }))
    .find(r => r.id === foaie.rid)?.target
  if (!tinta) throw new Error('Foaie negăsită în arhivă')
  const cale = tinta.startsWith('/') ? tinta.slice(1) : `xl/${tinta.replace(/^\.\//, '')}`
  const xml = await zip.file(cale)?.async('string')
  if (!xml) throw new Error('Foaie goală')

  const ssXml = await zip.file('xl/sharedStrings.xml')?.async('string')
  const shared = ssXml ? [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => textDin(m[1])) : []

  const randuri: Celula[][] = []
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const rand: Celula[] = []
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], corp = cm[2] || ''
      const idx = colIndex(attrs.match(/\br="([A-Z]+)\d+"/)?.[1] || String.fromCharCode(65 + rand.length))
      const tip = attrs.match(/\bt="([^"]*)"/)?.[1]
      const v = corp.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      let val: Celula = null
      if (tip === 's') val = v != null ? shared[Number(v)] ?? '' : null
      else if (tip === 'inlineStr') val = textDin(corp)
      else if (tip === 'str' || tip === 'b') val = v != null ? decode(v) : null
      else if (v != null) { const n = Number(v); val = Number.isFinite(n) ? n : decode(v) }
      while (rand.length < idx) rand.push(null)
      rand[idx] = val
    }
    randuri.push(rand)
  }
  return randuri
}
