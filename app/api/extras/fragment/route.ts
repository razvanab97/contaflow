import { NextRequest, NextResponse } from 'next/server'
import { extractText, getDocumentProxy } from 'unpdf'
import { getServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Fragmentul ORIGINAL al unei tranzactii din extrasul PDF (exact randurile din extras, inclusiv
// "REF:"), cu pagina pe care se afla - pentru "Vezi complet": uneori textul importat e prescurtat
// sau o informatie utila (referinta bancara, detaliile platii) se vede clar doar in extras.

const SUMA_RAND = /^-?[\d.,]+$/                       // rand doar cu suma (urmeaza dupa REF in extrasele BT)
const SEPARATOR = /^(REF:|RULAJ ZI|SOLD FINAL|SOLD ANTERIOR|SOLD INITIAL|\d{2}\/\d{2}\/\d{4} RULAJ)/i

// Bucati distinctive din descrierea salvata, in ordinea sigurantei: IBAN, RRN, TID, nr. ordin, apoi
// primul segment lung de text.
function repere(descriere: string, suma: number): string[] {
  const d = descriere || ''
  const out: string[] = []
  const iban = d.match(/\b[A-Z]{2}\d{2}[A-Z]{4}[A-Z0-9]{12,20}\b/); if (iban) out.push(iban[0])
  const rrn = d.match(/RRN:\s*(\d{6,})/); if (rrn) out.push(rrn[1])
  const tid = d.match(/TID:\s*(\S+)/); if (tid) out.push(tid[1])
  const ord = d.match(/Order\s+\d+/i); if (ord) out.push(ord[0])
  for (const cod of d.match(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{10,}\b/g) || []) out.push(cod)  // coduri unice (ROC, nr. comanda)
  const ref = d.match(/\b\d{10,}\b/); if (ref) out.push(ref[0])
  for (const seg of d.split(';').map(s => s.trim()).filter(s => s.length >= 12)) out.push(seg.slice(0, 40))
  out.push(Math.abs(suma).toFixed(2))
  return [...new Set(out)]
}

export async function GET(req: NextRequest) {
  const txId = req.nextUrl.searchParams.get('txId')
  if (!txId) return NextResponse.json({ error: 'txId lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: tx } = await sb.from('tranzactii').select('id,extras_id,descriere,suma,data_tranzactie').eq('id', txId).single()
  if (!tx) return NextResponse.json({ error: 'Tranzacția nu există' }, { status: 404 })
  const { data: extras } = await sb.from('extrase').select('id,pdf_path').eq('id', tx.extras_id).single()
  if (!extras?.pdf_path) return NextResponse.json({ error: 'Extrasul nu are PDF salvat' }, { status: 404 })
  const { data: blob, error } = await sb.storage.from('extrase-pdf').download(extras.pdf_path)
  if (error || !blob) return NextResponse.json({ error: 'PDF-ul extrasului nu a putut fi citit' }, { status: 500 })

  let pagini: string[]
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()))
    pagini = (await extractText(pdf, { mergePages: false })).text as string[]
  } catch {
    return NextResponse.json({ error: 'Textul extrasului nu poate fi citit (PDF scanat?)' }, { status: 422 })
  }

  // Fiecare aparitie a fiecarui reper -> blocul tranzactiei; acceptat doar daca suma blocului (randul
  // de dupa "REF:") e suma tranzactiei. La mai multe potriviri (ex. comisioane identice) - cea din
  // aceeasi zi; data se ia din ultimul rand cu data de dinaintea blocului.
  const sumaTx = Math.abs(Number(tx.suma))
  const sumaText = sumaTx.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const ziTx = String(tx.data_tranzactie).slice(0, 10)
  // Antetul/subsolul bancii se repeta pe fiecare pagina (ex. "BANCA TRANSILVANIA", "Tiparit: ...") -
  // scos, ca o tranzactie rupta intre doua pagini sa ramana un singur bloc.
  // Doar randurile din primele/ultimele 15 ale paginii, fara ";" (textul tranzactiilor are ";"), care
  // se repeta pe cel putin jumatate din pagini - altfel s-ar pierde tranzactii identice (ex. Airbnb).
  const MARGINE = 15
  const laMargine = (t: string) => { const l = t.split('\n').map(x => x.trim()).filter(Boolean); return new Set([...l.slice(0, MARGINE), ...l.slice(-MARGINE)].filter(x => !x.includes(';'))) }
  const frecventa = new Map<string, number>()
  for (const t of pagini) for (const l of laMargine(t)) frecventa.set(l, (frecventa.get(l) || 0) + 1)
  const antet = new Set([...frecventa].filter(([, n]) => pagini.length >= 3 && n >= Math.ceil(pagini.length / 2)).map(([l]) => l))
  const toateLiniile: { p: number; l: string }[] = pagini.flatMap((t, p) => {
    const l = t.split('\n').map(x => x.trim()).filter(Boolean)
    return l.map((x, i) => ({ p, l: x, margine: i < MARGINE || i >= l.length - MARGINE })).filter(x => !(x.margine && antet.has(x.l))).map(({ p, l }) => ({ p, l }))
  })
  const linii = toateLiniile.map(x => x.l)
  const dataLa = (i: number) => { for (let k = i; k >= 0; k--) { const m = linii[k].match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}` } return null }
  const sumaEgala = (v: string) => Math.abs(Math.abs(Number(v.replace(/,/g, ''))) - sumaTx) < 0.005
  const vazute = new Set<number>()
  let rezerva: { start: number; end: number } | null = null
  for (const reper of repere(tx.descriere || '', Number(tx.suma))) {
    for (let m = 0; m < linii.length; m++) {
      // si peste doua randuri: textul unei tranzactii e rupt pe randuri in PDF
      const doua = `${linii[m]} ${linii[m + 1] || ''}`
      if (!linii[m].includes(reper) && !(doua.includes(reper) && !(linii[m + 1] || '').includes(reper))) continue
      let start = m
      while (start > 0 && !SUMA_RAND.test(linii[start - 1]) && !SEPARATOR.test(linii[start - 1])) start--
      if (vazute.has(start)) continue
      vazute.add(start)
      let end = m
      while (end < linii.length - 1 && end - start < 25 && !/^REF:/i.test(linii[end])) end++
      if (!/^REF:/i.test(linii[end])) continue
      // Suma: randul de dupa REF, sau la finalul unui rand din bloc (cand tranzactia e rupta intre pagini).
      const inline = linii.slice(start, end).some(l => l.endsWith(` ${sumaText}`))
      if (end + 1 < linii.length && SUMA_RAND.test(linii[end + 1]) && sumaEgala(linii[end + 1])) end++
      else if (!inline) continue
      if (dataLa(start) === ziTx) { rezerva = { start, end }; break }
      rezerva ||= { start, end }
    }
    if (rezerva && dataLa(rezerva.start) === ziTx) break
  }
  if (rezerva) {
    const fragment = linii.slice(rezerva.start, rezerva.end + 1).filter(Boolean)
    const pagina = toateLiniile[rezerva.start].p + 1
    const refLinie = fragment.find(l => /^REF:/i.test(l))
    return NextResponse.json({
      pagina, totalPagini: pagini.length, fragment,
      referinta: refLinie ? refLinie.replace(/^REF:\s*/i, '').trim() : null,
      pdfUrl: `/api/extras/pdf-download?extrasId=${encodeURIComponent(extras.id)}&inline=1#page=${pagina}`,
    })
  }
  return NextResponse.json({ error: 'Tranzacția nu a fost găsită în textul extrasului', pdfUrl: `/api/extras/pdf-download?extrasId=${encodeURIComponent(extras.id)}&inline=1` }, { status: 404 })
}
