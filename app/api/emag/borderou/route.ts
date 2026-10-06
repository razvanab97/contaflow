import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { getServiceSupabase } from '@/lib/supabase/server'
import { citesteBorderouEmag, ETICHETA_BORDEROU_EMAG, platformaDinTaskKey, RE_AVIZ_CASH, RE_AVIZ_CARD, type BorderouEmag, type TipBorderouEmag } from '@/lib/emag-borderou'
import { lunaAvizeAsteptata } from '@/lib/emag-aviz-clasificare'
import { esteLunaCalendaristica } from '@/lib/firma-config'
import { citesteAvizComplet } from '@/lib/emag-aviz-complet'
import { cursuriBnrSigur } from '@/lib/curs-bnr'

export const maxDuration = 60

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const lei = (n: number) => n.toFixed(2).replace('.', ',')
const zi = (d: string) => d.split('-').reverse().join('.')
const NUME_SCURT: Record<TipBorderouEmag, string> = { dp_cash: 'Desfasurator plata eMAG cash', dp_card: 'Desfasurator plata eMAG card', dc: 'Decont comision eMAG', extras_cont: 'Extras cont eMAG' }
type Sb = ReturnType<typeof getServiceSupabase>

// Borderourile eMAG = DOAR desfasuratoarele de plata (DP cash / card, pe fiecare jumatate de luna): se
// incarca toate odata, data borderoului = data platii (pentru eCap). Fiecare e verificat cu avizul lui:
// DP cash = „Incasari ramburs”, DP card = „Incasari card online” + notificarea Heyblu din aceeasi jumatate.
// (DC si extrasul de cont sunt recunoscute, dar refuzate aici.)
export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const files = fd.getAll('files') as File[]
  const firmaId = fd.get('firmaId') as string
  const lunaId = fd.get('lunaId') as string
  if (!files.length || !firmaId || !lunaId) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const [{ data: firma }, { data: luna }] = await Promise.all([
    sb.from('firme').select('nume,slug').eq('id', firmaId).single(),
    sb.from('luni_contabile').select('luna').eq('id', lunaId).single(),
  ])
  const numeFirma = String(firma?.nume || '').replace(/\s+S\.?R\.?L\.?$/i, '')
  const lunaPlati = luna?.luna ? lunaAvizeAsteptata(luna.luna, esteLunaCalendaristica(firma?.slug)) : null

  const rezultate: { fisier: string; ok: boolean; text: string }[] = []
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) { rezultate.push({ fisier: file.name, ok: false, text: 'nu e un fișier .xlsx' }); continue }
    let b: BorderouEmag
    try { b = await citesteBorderouEmag(bytes, file.name) } catch (e) { rezultate.push({ fisier: file.name, ok: false, text: e instanceof Error ? e.message : String(e) }); continue }
    // sectiunea tine DOAR desfasuratoarele de plata (DP cash / card)
    if (b.tip !== 'dp_cash' && b.tip !== 'dp_card') { rezultate.push({ fisier: file.name, ok: false, text: `${ETICHETA_BORDEROU_EMAG[b.tip]} — aici se adaugă doar desfășurătoarele de plată (…_dp_….xlsx)` }); continue }
    if ((b.tip === 'dp_cash' || b.tip === 'dp_card') && lunaPlati && b.data && b.data.slice(0, 7) !== lunaPlati) {
      rezultate.push({ fisier: file.name, ok: false, text: `plata din ${zi(b.data)} nu aparține acestei luni (plăți din ${lunaPlati.split('-').reverse().join('.')})` }); continue
    }
    const path = `${firmaId}/${lunaId}/emag-borderou/${b.tip}_${b.id}_${Date.now()}.xlsx`
    const { error: upErr } = await sb.storage.from('documente').upload(path, bytes, { contentType: XLSX_MIME })
    if (upErr) { rezultate.push({ fisier: file.name, ok: false, text: upErr.message }); continue }
    const val = b.valuta || 'RON'
    const fisierNume = `${numeFirma} - ${NUME_SCURT[b.tip]}${b.platforma ? ` ${b.platforma.replace('eMAG ', '')}` : ''} ${b.id}${b.data ? ` - ${zi(b.data)}` : ''} - ${lei(b.total)} ${val}.xlsx`
    const { data: doc, error } = await sb.from('documente').insert({
      firma_id: firmaId, luna_id: lunaId, modul: 'emag', tip_document: 'borderou',
      furnizor: b.tip, numar_document: b.id, data_document: b.data, suma: b.total, valuta: b.valuta || 'RON',
      fisier_path: path, fisier_nume: fisierNume, fisier_tip: XLSX_MIME, fisier_marime: bytes.length, in_zip: true,
    }).select('id').single()
    if (error || !doc) { await sb.storage.from('documente').remove([path]); rezultate.push({ fisier: file.name, ok: false, text: error?.message || 'Eroare salvare' }); continue }
    // acelasi borderou (tip + ID) incarcat din nou -> inlocuit
    const { data: vechi } = await sb.from('documente').select('id,fisier_path').eq('luna_id', lunaId).eq('modul', 'emag')
      .eq('tip_document', 'borderou').eq('furnizor', b.tip).eq('numar_document', b.id).neq('id', doc.id)
    if (vechi?.length) {
      await sb.from('documente').delete().in('id', vechi.map(v => v.id))
      await sb.storage.from('documente').remove(vechi.map(v => v.fisier_path).filter(Boolean))
    }
    rezultate.push({ fisier: file.name, ok: true, text: `${ETICHETA_BORDEROU_EMAG[b.tip]} · ${b.id}${b.data ? ` · ${zi(b.data)}` : ''} · ${b.platforma ? `${b.platforma} · ` : ''}total ${lei(b.total)} ${b.valuta || 'RON'}${b.incasari != null && b.incasari !== b.total ? ` (încasări ${lei(b.incasari)})` : ''}${vechi?.length ? ' (înlocuit)' : ''}` })
  }
  return NextResponse.json({ rezultate })
}

interface LinieCache { tip: string; serie: string | null; valoare: number; descriere: string }
interface AvizLuna { id: string; taskKey: string; numar: string; data: string | null; total: number | null; linii: LinieCache[] }

async function avizeLuna(sb: Sb, lunaId: string): Promise<AvizLuna[]> {
  const { data: docs } = await sb.from('documente').select('id,furnizor,numar_document,suma')
    .eq('luna_id', lunaId).eq('modul', 'emag').eq('tip_document', 'aviz_plata')
  const ids = (docs || []).map(d => d.id)
  const { data: cache } = ids.length ? await sb.from('emag_aviz_rezumat').select('document_id,linii,total_plata,data_aviz').in('document_id', ids) : { data: [] }
  const c = new Map((cache || []).map(x => [x.document_id, x]))
  // avizele inca necitite (ex. Concluzia eMAG nu s-a deschis inca luna asta) se citesc acum si se salveaza
  const { data: cuCale } = await sb.from('documente').select('id,fisier_path').in('id', ids.filter(id => !c.has(id)))
  await Promise.all((cuCale || []).map(async d => {
    const { data: f } = await sb.storage.from('documente').download(d.fisier_path)
    const citit = f ? await citesteAvizComplet(new Uint8Array(await f.arrayBuffer())).catch(() => null) : null
    if (!citit) return
    const rand = { document_id: d.id, valuta: citit.valuta, linii: citit.linii, total_plata: citit.totalPlata, data_aviz: citit.dataAviz }
    await sb.from('emag_aviz_rezumat').upsert(rand)
    c.set(d.id, rand as never)
  }))
  return (docs || []).map(d => ({
    id: d.id, taskKey: d.furnizor || '', numar: d.numar_document || '',
    data: c.get(d.id)?.data_aviz || null, total: c.get(d.id)?.total_plata != null ? Number(c.get(d.id)!.total_plata) : (d.suma != null ? Number(d.suma) : null),
    linii: (c.get(d.id)?.linii || []) as LinieCache[],
  }))
}

const zile = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000
// liniile de vanzare din aviz care se potrivesc (si nu se potrivesc cu „fara”, ex. card dar nu ramburs)
const suma = (l: LinieCache[], re: RegExp, fara?: RegExp) => Math.round(l.filter(x => x.tip === 'vanzare' && re.test(x.descriere) && !(fara && fara.test(x.descriere))).reduce((s, x) => s + x.valoare, 0) * 100) / 100

function verifica(b: { tip: TipBorderouEmag; id: string; data: string | null; total: number; incasari?: number; peAviz?: Record<string, number>; platforma?: string | null }, avize: AvizLuna[]) {
  const inc = b.incasari ?? b.total
  // doar avizele aceleiasi platforme (RO cu RO, BG cu BG, HU cu HU) - sumele sunt in moneda platformei
  const cod = b.platforma?.replace('eMAG ', '').toLowerCase()
  if (cod) avize = avize.filter(a => a.taskKey.includes(`_${cod}_`) || (cod === 'ro' && /heyblu/.test(a.taskKey)))
  const egal = (x: number, y: number) => Math.abs(x - y) < 0.05
  if (b.tip === 'dp_cash' || b.tip === 'dp_card') {
    const aproape = avize.filter(a => !/heyblu/.test(a.taskKey) && a.data && b.data && zile(a.data, b.data) <= 3 && a.linii.length)
    if (!aproape.length) return { stare: 'fara_aviz' as const, text: 'niciun aviz citit cu aceeași dată — încarcă avizul / deschide Concluzia eMAG' }
    for (const a of aproape) {
      if (b.tip === 'dp_cash') {
        const r = suma(a.linii, RE_AVIZ_CASH)
        if (egal(r, inc)) return { stare: 'ok' as const, platforma: platformaDinTaskKey(a.taskKey), text: `= Încasări ramburs din avizul ${a.numar}` }
      } else {
        const card = suma(a.linii, RE_AVIZ_CARD, RE_AVIZ_CASH)
        const jum = a.taskKey.endsWith('_inceput') ? 'inceput' : 'jumatate'
        const hey = avize.find(x => x.taskKey === `emag.aviz_heyblu_${jum}`)
        const h = /_ro_/.test(a.taskKey) && hey?.total ? hey.total : 0
        if (egal(card + h, inc)) return { stare: 'ok' as const, platforma: platformaDinTaskKey(a.taskKey), text: `= card ${lei(card)} din avizul ${a.numar}${h ? ` + Heyblu ${lei(h)}` : ''}` }
      }
    }
    const a = aproape.find(x => /_ro_/.test(x.taskKey)) || aproape[0]
    const asteptat = b.tip === 'dp_cash' ? suma(a.linii, RE_AVIZ_CASH) : suma(a.linii, RE_AVIZ_CARD, RE_AVIZ_CASH)
    // RO card fara notificarea Heyblu din aceeasi jumatate: diferenta e (de obicei) chiar plata Heyblu
    const jum = a.taskKey.endsWith('_inceput') ? 'inceput' : 'jumatate'
    const faraHeyblu = b.tip === 'dp_card' && /_ro_/.test(a.taskKey) && !avize.some(x => x.taskKey === `emag.aviz_heyblu_${jum}`) && inc - asteptat > 0
    return {
      stare: 'diferenta' as const, platforma: platformaDinTaskKey(a.taskKey),
      text: faraHeyblu
        ? `lipsește notificarea Heyblu (${jum === 'inceput' ? 'început' : 'jumătate'} de lună) — avizul ${a.numar} are card ${lei(asteptat)}, diferența de ${lei(inc - asteptat)} ar trebui să fie Heyblu`
        : `avizul ${a.numar} are ${lei(asteptat)} — diferență ${lei(inc - asteptat)}`,
    }
  }
  if (b.tip === 'dc') {
    for (const a of avize) {
      const l = a.linii.find(x => x.tip === 'comision' && egal(Math.abs(x.valoare), b.total))
      if (l) return { stare: 'ok' as const, platforma: platformaDinTaskKey(a.taskKey), text: `= factura de comision ${l.serie || ''} din avizul ${a.numar} (net + TVA 21%)` }
    }
    return { stare: avize.some(a => a.linii.length) ? 'diferenta' as const : 'fara_aviz' as const, text: 'nicio factură de comision cu această sumă în avizele lunii' }
  }
  const pe = Object.entries(b.peAviz || {})
  if (!pe.length) return { stare: 'fara_aviz' as const, text: 'nicio compensare pe aviz în extras' }
  const parti = pe.map(([nr, v]) => {
    const a = avize.find(x => x.numar.endsWith(nr))
    return { nr, ok: !!a && a.total != null && egal(a.total, v), lipsa: !a }
  })
  const toate = parti.every(p => p.ok)
  return {
    stare: toate ? 'ok' as const : 'diferenta' as const,
    text: parti.map(p => `aviz ${p.nr} ${p.ok ? '✓' : p.lipsa ? '— nu e în luna asta' : '≠ totalul avizului'}`).join(' · '),
  }
}

// GET ?lunaId=… -> lista + verificarea cu avizele · ?download=<id> -> un .xlsx · ?zip=<lunaId> -> toate
export async function GET(req: NextRequest) {
  const sb = getServiceSupabase()
  const lunaLista = req.nextUrl.searchParams.get('lunaId')
  if (lunaLista) {
    const { data } = await sb.from('documente').select('id,furnizor,numar_document,data_document,suma,fisier_nume,fisier_path')
      .eq('luna_id', lunaLista).eq('modul', 'emag').eq('tip_document', 'borderou').in('furnizor', ['dp_cash', 'dp_card']).order('data_document')
    const avize = await avizeLuna(sb, lunaLista)
    const borderouri = await Promise.all((data || []).map(async d => {
      const tip = d.furnizor as TipBorderouEmag
      // fisierul se citeste din nou: totalul borderoului (toate liniile), incasarile comparate cu avizul, detaliile
      const { data: f } = await sb.storage.from('documente').download(d.fisier_path)
      const citit = f ? await citesteBorderouEmag(new Uint8Array(await f.arrayBuffer()), d.fisier_nume).catch(() => null) : null
      const total = citit?.total ?? (Number(d.suma) || 0)
      const v = verifica({ tip, id: d.numar_document || '', data: d.data_document, total, incasari: citit?.incasari, peAviz: citit?.peAviz, platforma: citit?.platforma }, avize)
      const platforma = citit?.platforma || ('platforma' in v ? v.platforma : null) || null
      return { id: d.id, tip, eticheta: ETICHETA_BORDEROU_EMAG[tip] || tip, platforma, nr: tip === 'extras_cont' ? null : d.numar_document, data: d.data_document, suma: total, valuta: citit?.valuta || 'RON', incasari: citit?.incasari ?? null, detalii: citit?.detalii || {}, fisier: d.fisier_nume, verificare: v }
    }))
    // BG (EUR) / HU (HUF): echivalent in lei la cursul BNR din ziua platii
    const curs = await cursuriBnrSigur(borderouri.filter(b => b.valuta !== 'RON').map(b => b.data))
    const cuLei = borderouri.map(b => {
      const k = b.valuta === 'RON' ? 1 : (b.data && curs ? curs(b.data, b.valuta) : null)
      return { ...b, curs: b.valuta === 'RON' ? null : k, sumaLei: b.suma != null && k ? Math.round(b.suma * k * 100) / 100 : null, incasariLei: b.incasari != null && k ? Math.round(b.incasari * k * 100) / 100 : null }
    })
    // grupat pe platforma (RO, apoi BG, apoi HU), apoi data, cash inaintea cardului
    const ordine: Record<string, number> = { dp_cash: 0, dp_card: 1, dc: 2, extras_cont: 3 }
    const ordinePl: Record<string, number> = { 'eMAG RO': 0, 'eMAG BG': 1, 'eMAG HU': 2 }
    cuLei.sort((a, b) => (ordinePl[a.platforma || ''] ?? 9) - (ordinePl[b.platforma || ''] ?? 9) || String(a.data).localeCompare(String(b.data)) || (ordine[a.tip] ?? 9) - (ordine[b.tip] ?? 9))
    const borderouriSortate = cuLei
    return NextResponse.json({ borderouri: borderouriSortate })
  }
  const lunaZip = req.nextUrl.searchParams.get('zip')
  if (lunaZip) {
    const { data: docs } = await sb.from('documente').select('fisier_path,fisier_nume')
      .eq('luna_id', lunaZip).eq('modul', 'emag').eq('tip_document', 'borderou').in('furnizor', ['dp_cash', 'dp_card']).order('data_document')
    if (!docs?.length) return NextResponse.json({ error: 'Niciun borderou încărcat' }, { status: 404 })
    const zip = new JSZip()
    for (const d of docs) {
      const { data: f } = await sb.storage.from('documente').download(d.fisier_path)
      if (f) zip.file(d.fisier_nume, new Uint8Array(await f.arrayBuffer()))
    }
    const buf = await zip.generateAsync({ type: 'uint8array' })
    return new NextResponse(buf as unknown as BodyInit, { headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('Borderouri eMAG.zip')}`,
    } })
  }
  const id = req.nextUrl.searchParams.get('download')
  if (!id) return NextResponse.json({ error: 'Borderoul lipsește' }, { status: 400 })
  const { data: d } = await sb.from('documente').select('fisier_path,fisier_nume').eq('id', id).eq('modul', 'emag').eq('tip_document', 'borderou').single()
  if (!d) return NextResponse.json({ error: 'Borderoul nu a fost găsit' }, { status: 404 })
  const { data: file } = await sb.storage.from('documente').download(d.fisier_path)
  if (!file) return NextResponse.json({ error: 'Fișierul lipsește din stocare' }, { status: 404 })
  return new NextResponse(file, { headers: {
    'Content-Type': XLSX_MIME,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(d.fisier_nume)}`,
  } })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Borderoul lipsește' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: d } = await sb.from('documente').select('id,fisier_path').eq('id', id).eq('modul', 'emag').eq('tip_document', 'borderou').single()
  if (!d) return NextResponse.json({ error: 'Borderoul nu a fost găsit' }, { status: 404 })
  const { error } = await sb.from('documente').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await sb.storage.from('documente').remove([d.fisier_path])
  return NextResponse.json({ ok: true })
}
