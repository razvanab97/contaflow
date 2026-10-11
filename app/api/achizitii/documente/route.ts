import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import {randomUUID} from 'node:crypto'
import {nextOfferNumber,supplierKey as normalizeSupplier} from '@/lib/achizitii-offer-number'
import { offerPrice } from '@/lib/achizitii-offer-price'

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])

export async function GET(req: NextRequest) {
  const achizitieId = req.nextUrl.searchParams.get('achizitieId')
  if (!achizitieId) return NextResponse.json({ error: 'achizitieId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('documente')
    .select('id,fisier_nume,fisier_tip,tip_document,created_at,furnizor,suma,valuta')
    .eq('achizitie_id', achizitieId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get('file') as File | null
  const achizitieId = String(fd.get('achizitieId') || '')
  const tipDosar = String(fd.get('tipDosar') || '')
  const supplier = String(fd.get('furnizorOferta') || '').trim()
  const supplierKey = normalizeSupplier(supplier)
  let price: { suma: number; valuta: string } | null = null
  if (fd.get('pretOferta')) {
    if (tipDosar !== 'oferta') return NextResponse.json({ error: 'Prețul se aplică doar ofertelor.' }, { status: 400 })
    try { price = offerPrice(String(fd.get('pretOferta')), String(fd.get('valutaOferta') || 'RON')) }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Preț invalid.' }, { status: 400 }) }
  }
  if(supplier && (tipDosar!=='oferta'||supplier.length>120||!supplierKey))return NextResponse.json({error:'Furnizorul ofertei este invalid.'},{status:400})
  // Tipul ales la incarcare decide etapa si prefixul din nume (recunoscut de verificarea dosarului).
  const TIP: Record<string, { eticheta: string; etapa: string }> = {
    cerere: { eticheta: 'Cerere de oferta (Anexa 2)', etapa: 'oferta' }, oferta: { eticheta: 'Oferta', etapa: 'oferta' },
    nota: { eticheta: 'Nota privind determinarea valorii (Anexa 1)', etapa: 'nota_semnata' }, contract: { eticheta: 'Contract', etapa: 'nota_semnata' },
    proforma: { eticheta: 'Proforma', etapa: 'plata_initiata' }, factura: { eticheta: 'Factura fiscala', etapa: 'plata_initiata' },
    plata: { eticheta: 'Dovada plata', etapa: 'plata_initiata' }, pv: { eticheta: 'PV receptie (Anexa 3)', etapa: 'dovada_trimisa' }, poza: { eticheta: 'Poza echipament', etapa: 'dovada_trimisa' },
  }
  const tip = TIP[tipDosar]
  const etapa = tip?.etapa || String(fd.get('etapa') || 'document')
  if (!file || !achizitieId) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Sunt acceptate doar fișiere PDF, JPG și PNG' }, { status: 400 })
  if(!file.size||file.size>4*1024*1024)return NextResponse.json({error:'Fișierul trebuie să aibă între 1 octet și 4 MB.'},{status:400})

  const sb = getServiceSupabase()
  const { data: achizitie } = await sb.from('proiect_achizitii').select('id,firma_id,luna_id,denumire').eq('id', achizitieId).single()
  if (!achizitie) return NextResponse.json({ error: 'Achiziția nu a fost găsită' }, { status: 404 })
  let offerNumber: number | null = null
  if(supplier){
    if(file.type!=='application/pdf')return NextResponse.json({error:'Pozele acestei oferte trebuie reunite într-un PDF înainte de salvare.'},{status:400})
    const {data:existing,error}=await sb.from('documente').select('fisier_nume,furnizor').eq('achizitie_id',achizitieId).order('created_at',{ascending:true})
    if(error)return NextResponse.json({error:'Nu pot verifica numerotarea ofertelor.'},{status:503})
    try{offerNumber=nextOfferNumber(existing||[],supplier)}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Numerotare invalidă.'},{status:409})}
  }

  const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
  const bytes = new Uint8Array(await file.arrayBuffer())
  const safeName = (achizitie.denumire || 'achizitie').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40)
  const path = offerNumber ? `${achizitie.firma_id}/${achizitie.luna_id || 'fara-luna'}/achizitii/${achizitieId}_oferta_${offerNumber}.pdf` : `${achizitie.firma_id}/${achizitie.luna_id || 'fara-luna'}/achizitii/${achizitieId}_${randomUUID()}_${safeName}_${etapa}.${extension}`

  const { error: uploadError } = await sb.storage.from('documente').upload(path, bytes, { contentType: file.type, upsert:false })
  if (uploadError) return NextResponse.json({ error: offerNumber ? 'Oferta nu a putut fi salvată; dacă altă fereastră a salvat simultan, încearcă din nou. Niciun PDF existent nu a fost suprascris.' : uploadError.message }, { status: offerNumber ? 409 : 500 })

  const { data: doc, error: docError } = await sb.from('documente').insert({
    firma_id: achizitie.firma_id,
    luna_id: achizitie.luna_id,
    achizitie_id: achizitieId,
    modul: 'achizitii',
    tip_document: etapa,
    furnizor: supplier || achizitie.denumire,
    ...(price || {}),
    fisier_path: path,
    // numele original al fisierului (cu tipul ales in fata), ca sa se vada si sa fie recunoscut in dosar
    fisier_nume: offerNumber ? `Oferta ${offerNumber}.pdf` : `${tip ? `${tip.eticheta} - ` : ''}${(file.name || `${safeName}_${etapa}.${extension}`).replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 150)}`,
    fisier_tip: file.type,
    fisier_marime: bytes.length,
    in_zip: true,
  }).select('id,fisier_nume,fisier_tip,tip_document,created_at').single()
  if (docError || !doc) {
    await sb.storage.from('documente').remove([path])
    return NextResponse.json({ error: docError?.message || 'Eroare salvare document' }, { status: 500 })
  }

  return NextResponse.json(doc)
}
