import JSZip from 'jszip'

// Umple un șablon .docx (cu marcaje %%CAMP%%) cu valorile date și întoarce documentul final (.docx).
// Marcajele sunt scrise de noi ca text contiguu într-un singur run, deci simpla substituție pe
// textul XML e sigură (vezi templates/ab-next). Valorile se escapează pentru XML.
// Marcajele necompletate devin o linie de completat „____________" (document tot utilizabil).

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const LINIE = '____________'

export async function umpleSablon(bytes: Uint8Array | ArrayBuffer | Buffer, valori: Record<string, string>): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes)
  // marcajele pot fi și în antet/subsol, dar la șabloanele noastre sunt doar în corp; procesăm orice XML din word/
  const fisiere = Object.keys(zip.files).filter(n => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n))
  for (const nume of fisiere) {
    let xml = await zip.file(nume)!.async('string')
    for (const [k, v] of Object.entries(valori)) {
      if (v == null || v === '') continue
      xml = xml.split(`%%${k}%%`).join(esc(v))
    }
    xml = xml.replace(/%%[A-Z0-9_]+%%/g, LINIE) // marcaje rămase necompletate -> linie de completat
    zip.file(nume, xml)
  }
  return zip.generateAsync({ type: 'uint8array' })
}

// Ce marcaje conține un șablon (pentru validare / listarea câmpurilor).
export async function marcajeSablon(bytes: Uint8Array | ArrayBuffer | Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes)
  const set = new Set<string>()
  for (const nume of Object.keys(zip.files).filter(n => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n))) {
    const xml = await zip.file(nume)!.async('string')
    for (const m of xml.match(/%%[A-Z0-9_]+%%/g) || []) set.add(m.replace(/%/g, ''))
  }
  return [...set]
}
