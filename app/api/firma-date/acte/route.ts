import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Actele firmei (Date personale): certificat de înregistrare, act constitutiv, certificat constatator etc.
// Sunt randuri in `documente` cu modul 'acte_firma', fara luna (luna_id null), fisierele in <firmaId>/acte-firma/.
// Tipul actului sta in `furnizor` (apare asa si in cautare). Vechiul certificat unic (firme.certificat_path)
// se preia automat ca prim act, o singura data.

const TIPURI_ACTE = ['Certificat de înregistrare', 'Act constitutiv', 'Certificat constatator', 'Statut / Act adițional', 'Hotărâre AGA / decizie', 'Contract sediu / comodat', 'Împuternicire', 'Autorizație / aviz', 'Cazier fiscal', 'Altul'] as const
const COLOANE = 'id,fisier_nume,fisier_tip,fisier_marime,furnizor,data_document,fisier_path,created_at'
const TIPURI_FISIER = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'])

const tipValid = (t: unknown) => (TIPURI_ACTE as readonly string[]).includes(String(t)) ? String(t) : 'Altul'
// Tipul ghicit din numele fisierului, cand nu e ales explicit (se poate schimba apoi din lista)
const REGULI_TIP: [RegExp, string][] = [
  [/inmatricul|inregistrare|\bcui\b|\bcif\b/, 'Certificat de înregistrare'], [/constitutiv/, 'Act constitutiv'], [/constatator/, 'Certificat constatator'],
  [/statut|aditional/, 'Statut / Act adițional'], [/hotarare|decizi|\baga\b/, 'Hotărâre AGA / decizie'], [/contract|comodat|sediu|inchiriere/, 'Contract sediu / comodat'],
  [/imputernic|procura|mandat/, 'Împuternicire'], [/autorizat|aviz|licent/, 'Autorizație / aviz'], [/cazier/, 'Cazier fiscal'],
]
function tipDinNume(nume: string) {
  const n = nume.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_.-]+/g, ' ')
  return REGULI_TIP.find(([re]) => re.test(n))?.[1] || 'Altul'
}
const numeSigur = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-90)

function antet(nume: string, tip: string, inline: boolean) {
  const ascii = nume.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')
  return { 'Content-Type': tip || 'application/octet-stream', 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nume)}` }
}

export async function GET(req: NextRequest) {
  const sb = getServiceSupabase()
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const id = req.nextUrl.searchParams.get('download')
  if (id) {
    const { data: d } = await sb.from('documente').select('fisier_path,fisier_nume,fisier_tip').eq('id', id).eq('firma_id', firmaId).eq('modul', 'acte_firma').maybeSingle()
    if (!d?.fisier_path) return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })
    const { data: file, error } = await sb.storage.from('documente').download(d.fisier_path)
    if (error || !file) return NextResponse.json({ error: 'Fișierul nu a putut fi descărcat' }, { status: 500 })
    return new NextResponse(Buffer.from(await file.arrayBuffer()), { headers: antet(d.fisier_nume || 'document', d.fisier_tip || file.type, req.nextUrl.searchParams.get('preview') === '1') })
  }

  // Preluarea certificatului vechi (un singur fisier pe firma) in lista de acte
  const { data: firma } = await sb.from('firme').select('certificat_path,certificat_nume').eq('id', firmaId).maybeSingle()
  if (firma?.certificat_path) {
    const { count } = await sb.from('documente').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId).eq('modul', 'acte_firma').eq('fisier_path', firma.certificat_path)
    if (!count) {
      const nume = firma.certificat_nume || 'certificat-inregistrare.pdf'
      await sb.from('documente').insert({
        firma_id: firmaId, luna_id: null, modul: 'acte_firma', tip_document: 'act_firma', furnizor: 'Certificat de înregistrare',
        fisier_path: firma.certificat_path, fisier_nume: nume, fisier_tip: /\.pdf$/i.test(nume) ? 'application/pdf' : /\.png$/i.test(nume) ? 'image/png' : 'image/jpeg', in_zip: false,
      })
    }
  }

  const { data, error } = await sb.from('documente').select(COLOANE).eq('firma_id', firmaId).eq('modul', 'acte_firma').order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ acte: data || [], tipuri: TIPURI_ACTE })
}

// Unul sau mai multe fisiere odata; tipul se poate da pentru toate (campul `tip`), altfel se ghiceste din nume.
export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const firmaId = String(fd.get('firmaId') || '')
  const tipAles = fd.get('tip') ? tipValid(fd.get('tip')) : null
  const files = fd.getAll('file').filter((f): f is File => f instanceof File && f.size > 0)
  if (!firmaId || !files.length) return NextResponse.json({ error: 'Alege cel puțin un fișier' }, { status: 400 })
  const sb = getServiceSupabase()
  const adaugate = [], erori: string[] = []
  for (const file of files.slice(0, 30)) {
    if (!TIPURI_FISIER.has(file.type)) { erori.push(`${file.name}: doar PDF, imagini sau Word`); continue }
    if (file.size > 20 * 1024 * 1024) { erori.push(`${file.name}: mai mare de 20 MB`); continue }
    const path = `${firmaId}/acte-firma/${Date.now()}_${numeSigur(file.name)}`
    const { error: upErr } = await sb.storage.from('documente').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type })
    if (upErr) { erori.push(`${file.name}: ${upErr.message}`); continue }
    const { data, error } = await sb.from('documente').insert({
      firma_id: firmaId, luna_id: null, modul: 'acte_firma', tip_document: 'act_firma', furnizor: tipAles || tipDinNume(file.name),
      fisier_path: path, fisier_nume: file.name, fisier_tip: file.type, fisier_marime: file.size, in_zip: false,
    }).select(COLOANE).single()
    if (error) { await sb.storage.from('documente').remove([path]); erori.push(`${file.name}: ${error.message}`); continue }
    adaugate.push(data)
  }
  return NextResponse.json({ acte: adaugate, erori }, { status: adaugate.length ? 200 : 400 })
}

// Redenumire, tip, data actului
export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as Record<string, string | null>
  if (!b.firmaId || !b.id) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const patch: Record<string, string | null> = {}
  if (typeof b.fisier_nume === 'string' && b.fisier_nume.trim()) patch.fisier_nume = b.fisier_nume.trim().slice(0, 200)
  if (b.tip !== undefined) patch.furnizor = tipValid(b.tip)
  if (b.data_document !== undefined) patch.data_document = /^\d{4}-\d{2}-\d{2}$/.test(String(b.data_document)) ? b.data_document : null
  const { data, error } = await getServiceSupabase().from('documente').update(patch).eq('id', b.id).eq('firma_id', b.firmaId).eq('modul', 'acte_firma').select(COLOANE).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ act: data })
}

export async function DELETE(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId'), id = req.nextUrl.searchParams.get('id')
  if (!firmaId || !id) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: d } = await sb.from('documente').select('fisier_path').eq('id', id).eq('firma_id', firmaId).eq('modul', 'acte_firma').maybeSingle()
  if (!d) return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })
  const { error } = await sb.from('documente').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await sb.storage.from('documente').remove([d.fisier_path])
  // Daca era vechiul certificat, se goleste si referinta din firme (altfel s-ar prelua din nou la urmatoarea citire)
  await sb.from('firme').update({ certificat_path: null, certificat_nume: null }).eq('id', firmaId).eq('certificat_path', d.fisier_path)
  return NextResponse.json({ ok: true })
}
