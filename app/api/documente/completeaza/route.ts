import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { extrageCampuriDocument } from '@/lib/ai/campuri-document'
import { finalizeazaDocument } from '@/lib/denumire-document'

export const maxDuration = 60
const TIP_ELIGIBIL = ['factura', 'bon', 'chitanta', 'aviz_plata', 'invoice']
const LOT = 6

function mediaTypeDin(nume: string, tip: string | null) {
  const n = nume.toLowerCase()
  if (tip === 'application/pdf' || n.endsWith('.pdf')) return 'application/pdf'
  if (tip?.startsWith('image/png') || n.endsWith('.png')) return 'image/png'
  if (tip?.startsWith('image/') || /\.(jpe?g)$/.test(n)) return 'image/jpeg'
  return null
}

// GET: cate documente (facturi/bonuri/chitante/avize PDF sau imagine) nu au suma. POST: completeaza
// un lot mic (sub limita de 60s), doar campurile GOALE - nimic existent nu se suprascrie. Clientul
// apeleaza repetat pana `ramase` ajunge la 0. Fiecare document incercat e marcat
// (extractie_incercata_at) ca sa nu se reia la nesfarsit; fara migrare, clientul trimite `exclude`.
function baza(sb: ReturnType<typeof getServiceSupabase>, firmaId: string | null, cuMarcaj: boolean, select: string, head = false) {
  let q = sb.from('documente').select(select, head ? { count: 'exact', head: true } : undefined)
    .is('suma', null).in('tip_document', TIP_ELIGIBIL)
    .or('fisier_tip.eq.application/pdf,fisier_tip.like.image/*,fisier_nume.ilike.*.pdf,fisier_nume.ilike.*.jpg,fisier_nume.ilike.*.jpeg,fisier_nume.ilike.*.png')
  if (firmaId) q = q.eq('firma_id', firmaId)
  if (cuMarcaj) q = q.is('extractie_incercata_at', null)
  return q
}

async function numara(sb: ReturnType<typeof getServiceSupabase>, firmaId: string | null) {
  let cuMarcaj = true
  let r = await baza(sb, firmaId, true, 'id', true)
  if (r.error) { cuMarcaj = false; r = await baza(sb, firmaId, false, 'id', true) }
  return { ramase: r.count || 0, cuMarcaj }
}

export async function GET(req: NextRequest) {
  const sb = getServiceSupabase()
  const { ramase, cuMarcaj } = await numara(sb, req.nextUrl.searchParams.get('firmaId'))
  return NextResponse.json({ ramase, cuMarcaj })
}

export async function POST(req: NextRequest) {
  const { firmaId = null, exclude = [], dryRun = false, limit } = await req.json().catch(() => ({}))
  const sb = getServiceSupabase()
  const { cuMarcaj } = await numara(sb, firmaId)
  let q = baza(sb, firmaId, cuMarcaj, 'id,fisier_path,fisier_nume,fisier_tip,furnizor,numar_document,data_document,valuta').order('created_at', { ascending: false }).limit(LOT + (Array.isArray(exclude) ? exclude.length : 0))
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const excl = new Set<string>(Array.isArray(exclude) ? exclude : [])
  const lot = (data as any[] || []).filter(d => !excl.has(d.id)).slice(0, Math.min(LOT, Number(limit) || LOT))

  const rezultate = await Promise.all(lot.map(async d => {
    const mt = mediaTypeDin(d.fisier_nume || '', d.fisier_tip)
    let campuri = null
    if (mt) {
      const { data: file } = await sb.storage.from('documente').download(d.fisier_path)
      if (file) campuri = await extrageCampuriDocument(new Uint8Array(await file.arrayBuffer()), mt)
    }
    if (dryRun) return { id: d.id, completat: campuri?.suma != null, campuri, fisier: d.fisier_nume }
    const patch: Record<string, unknown> = {}
    if (campuri?.suma != null) {
      patch.suma = campuri.suma
      if (campuri.moneda && (!d.valuta || (d.valuta === 'RON' && campuri.moneda !== 'RON'))) patch.valuta = campuri.moneda
    }
    if (campuri?.furnizor && !String(d.furnizor || '').trim()) patch.furnizor = campuri.furnizor
    if (campuri?.numarDocument && !String(d.numar_document || '').trim()) patch.numar_document = campuri.numarDocument
    if (campuri?.dataDocument && !d.data_document) patch.data_document = campuri.dataDocument
    if (cuMarcaj) patch.extractie_incercata_at = new Date().toISOString()
    if (Object.keys(patch).length) await sb.from('documente').update(patch).eq('id', d.id).is('suma', null)
    // Cu datele noi, documentul primeste si numele descriptiv (firma, numar, furnizor, data, suma).
    if (campuri?.suma != null || patch.numar_document || patch.furnizor) await finalizeazaDocument(sb, d.id, { extrage: false })
    return { id: d.id, completat: campuri?.suma != null }
  }))

  if (dryRun) return NextResponse.json({ dryRun: true, rezultate })
  const { ramase } = await numara(sb, firmaId)
  return NextResponse.json({
    procesate: rezultate.length,
    completate: rezultate.filter(r => r.completat).length,
    incercate: rezultate.map(r => r.id),
    ramase: cuMarcaj ? ramase : Math.max(0, ramase - excl.size - rezultate.filter(r => !r.completat).length),
    cuMarcaj,
  })
}
