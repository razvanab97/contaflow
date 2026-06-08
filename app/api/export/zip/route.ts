import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import JSZip from 'jszip'

export async function POST(req: NextRequest) {
  const { firmaId, firmaNume, lunaId, luna } = await req.json()
  const sb = getServiceSupabase()
  const zip = new JSZip()
  const root = zip.folder(`${firmaNume} - ${luna}`)!

  const { data: extrase } = await sb.from('extrase').select('*').eq('luna_id', lunaId)
  const ef = root.folder('Extrase de cont')!
  for (const e of extrase||[]) {
    if (e.pdf_path) { const { data:b } = await sb.storage.from('extrase-pdf').download(e.pdf_path); if(b) ef.file(e.pdf_nume||`extras_${e.valuta}.pdf`, b) }
  }

  const { data: docs } = await sb.from('documente').select('*, tranzactii(data_tranzactie,descriere_curatata)').eq('luna_id', lunaId).eq('in_zip', true)
  for (const doc of docs||[]) {
    const { data:b } = await sb.storage.from('documente').download(doc.fisier_path)
    if (!b) continue
    const path = String(doc.fisier_path || '')
    const folderName = path.includes('/dispozitii-plata/') ? 'Dispozitii de plata'
      : path.includes('/facturi-chitanta/') ? 'Facturi + chitanta'
      : path.includes('/facturi-restante/') ? 'Facturi restante'
      : path.includes('/emag-calcul/') ? 'eMAG - Dante International'
      : doc.tip_document || 'Altele'
    const folder = root.folder(folderName)!
    const tx = doc.tranzactii as {data_tranzactie:string;descriere_curatata:string}|null
    const name = tx ? `${tx.data_tranzactie}_${(tx.descriere_curatata||'').slice(0,30).replace(/[^a-zA-Z0-9]/g,'_')}.${doc.fisier_nume.split('.').pop()}` : doc.fisier_nume
    folder.file(name, b)
  }

  const ids = (extrase||[]).map(e=>e.id)
  const { data: txs } = ids.length>0 ? await sb.from('tranzactii').select('*, documente(tip_document,furnizor,numar_document)').in('extras_id',ids).order('data_tranzactie') : { data:[] }
  const csv = ['Data,Descriere,Tip,Suma,Valuta,Categorie,Document',
    ...(txs||[]).map(t=>{ const d=Array.isArray(t.documente)?t.documente[0]:t.documente; return [t.data_tranzactie,`"${t.descriere_curatata||t.descriere}"`,t.tip,t.suma,t.valuta,t.categorie||'',d?.tip_document||'LIPSA'].join(',') })
  ].join('\n')
  root.file('tranzactii.csv', csv)

  const blob = await zip.generateAsync({ type:'blob' })
  const buf = Buffer.from(await blob.arrayBuffer())
  return new NextResponse(buf, { headers: { 'Content-Type':'application/zip', 'Content-Disposition':`attachment; filename="${firmaNume}_${luna}.zip"` } })
}
