import JSZip from 'jszip'

// Ștampilează numărul de înregistrare (+ data) ÎN documentul Word, sus-dreapta, ca prim paragraf.
// Idempotent: o ștampilă anterioară (același marcaj) e înlocuită, nu dublată. Marcajul vizibil:
// „Înregistrat: nr. X / DD.MM.AAAA" — distinct de data din corpul documentului (data evenimentului).

const MARCAJ = 'Înregistrat: nr.'
const roData = (iso?: string | null) => iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : ''
const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// elimină un paragraf <w:p> care conține marcajul (ștampila pusă anterior de noi)
const regexStampaVeche = /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?Înregistrat: nr\.(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g

// nr = număr → pune/actualizează ștampila; nr = null → o scoate (document fără număr).
export async function stampeazaInregistrare(bytes: Uint8Array, nr: number | null, dataIso?: string | null): Promise<Uint8Array> {
  try {
    const zip = await JSZip.loadAsync(bytes)
    const f = zip.file('word/document.xml')
    if (!f) return bytes
    let xml = await f.async('string')
    if (!/<w:body[^>]*>/.test(xml)) return bytes
    xml = xml.replace(regexStampaVeche, '') // scoate ștampila veche (idempotent)
    if (nr != null) {
      const data = roData(dataIso)
      const text = `${MARCAJ} ${nr}${data ? ` / ${data}` : ''}`
      const p = `<w:p><w:pPr><w:jc w:val="right"/><w:spacing w:before="0" w:after="120"/></w:pPr>`
        + `<w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="555555"/></w:rPr>`
        + `<w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p>`
      xml = xml.replace(/(<w:body[^>]*>)/, `$1${p}`) // inserează ca prim paragraf al corpului
    }
    zip.file('word/document.xml', xml)
    return await zip.generateAsync({ type: 'uint8array' })
  } catch {
    return bytes
  }
}
