import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { numeDescriptiv, furnizorAfisat } from '@/lib/denumire-document'

export const maxDuration = 60

function extensie(nume: string | null, path: string | null, tip: string | null) {
  const m = String(nume || '').match(/\.([a-z0-9]{2,5})$/i) || String(path || '').match(/\.([a-z0-9]{2,5})$/i)
  return m ? m[1].toLowerCase() : tip === 'application/pdf' ? 'pdf' : String(tip || '').startsWith('image/png') ? 'png' : 'jpg'
}

// Redenumire in masa a documentelor existente cu numele descriptiv (firma, tip, numar, furnizor,
// data, suma), din datele deja salvate - fara AI. Doar numele afisat/descarcat (fisier_nume), nu si
// fisierul din storage. dryRun: true -> doar exemple, fara scriere. Intoarce numele vechi (pentru anulare).
export async function POST(req: NextRequest) {
  const { dryRun = true, tabel = 'documente', offset = 0, limit = 400 } = await req.json().catch(() => ({}))
  const sb = getServiceSupabase()
  const { data: firme } = await sb.from('firme').select('id,nume')
  const numeFirma = new Map((firme || []).map(f => [f.id, f.nume]))
  const schimbari: { id: string; vechi: string; nou: string }[] = []

  if (tabel === 'documente') {
    const { data, error } = await sb.from('documente')
      .select('id,firma_id,tip_document,numar_document,furnizor,data_document,suma,valuta,fisier_nume,fisier_path,fisier_tip')
      .order('created_at').range(offset, offset + limit - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const d of data || []) {
      if (/\.(json|csv)$/i.test(d.fisier_nume || '') || /\.(json|csv)$/i.test(d.fisier_path || '')) continue
      const nou = numeDescriptiv({ firma: numeFirma.get(d.firma_id), tip: d.tip_document, numar: d.numar_document, furnizor: furnizorAfisat(d.furnizor), data: d.data_document, suma: d.suma, valuta: d.valuta, extensie: extensie(d.fisier_nume, d.fisier_path, d.fisier_tip), numeVechi: d.fisier_nume })
      if (nou !== d.fisier_nume) schimbari.push({ id: d.id, vechi: d.fisier_nume, nou })
    }
  } else if (tabel === 'bonuri' || tabel === 'facturi_asteptate') {
    const cols = tabel === 'bonuri' ? 'id,firma_id,fisier_nume,fisier_path,fisier_tip,comerciant,data_bon,suma' : 'id,firma_id,fisier_nume,fisier_path,fisier_tip,furnizor,numar_document,data_factura,suma'
    const { data, error } = await sb.from(tabel).select(cols).order('created_at').range(offset, offset + limit - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const d of (data || []) as any[]) {
      const nou = tabel === 'bonuri'
        ? numeDescriptiv({ firma: numeFirma.get(d.firma_id), tip: 'bon', furnizor: d.comerciant, data: d.data_bon, suma: d.suma, extensie: extensie(d.fisier_nume, d.fisier_path, d.fisier_tip), numeVechi: d.fisier_nume })
        : numeDescriptiv({ firma: numeFirma.get(d.firma_id), tip: 'factura', numar: d.numar_document, furnizor: d.furnizor, data: d.data_factura, suma: d.suma, extensie: extensie(d.fisier_nume, d.fisier_path, d.fisier_tip), numeVechi: d.fisier_nume })
      if (nou !== d.fisier_nume) schimbari.push({ id: d.id, vechi: d.fisier_nume, nou })
    }
  } else return NextResponse.json({ error: 'Tabel invalid' }, { status: 400 })

  if (!dryRun) for (const c of schimbari) await sb.from(tabel).update({ fisier_nume: c.nou }).eq('id', c.id)
  return NextResponse.json({ tabel, dryRun, offset, procesate: schimbari.length, schimbari })
}
