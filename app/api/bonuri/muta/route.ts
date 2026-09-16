import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

// Muta manual un bon pe alta firma (ex. CUI-ul client citit pe bon nu corespunde firmei pe care
// a fost incarcat, iar auto-rutarea dupa CUI nu l-a mutat) - re-incarca fisierul sub path-ul noii
// firme si sterge fisierul vechi, ca structura de storage sa ramana consistenta cu restul bonurilor.
export async function POST(req: NextRequest) {
  const { id, firmaId } = await req.json().catch(() => ({}))
  if (!id || !firmaId) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: bon, error: bonError } = await sb.from('bonuri')
    .select('id,firma_id,fisier_path,fisier_nume,fisier_tip')
    .eq('id', id).single()
  if (bonError || !bon) return NextResponse.json({ error: 'Bonul nu a fost găsit' }, { status: 404 })
  if (bon.firma_id === firmaId) return NextResponse.json({ ok: true })

  const { data: firma, error: firmaError } = await sb.from('firme').select('id,nume').eq('id', firmaId).single()
  if (firmaError || !firma) return NextResponse.json({ error: 'Firma nu a fost găsită' }, { status: 404 })

  const { data: file, error: downloadError } = await sb.storage.from('documente').download(bon.fisier_path)
  if (downloadError || !file) return NextResponse.json({ error: 'Fișierul bonului nu a putut fi citit' }, { status: 500 })
  const bytes = new Uint8Array(await file.arrayBuffer())

  const newPath = `${firmaId}/bonuri/${bon.fisier_nume}`
  const { error: uploadError } = await sb.storage.from('documente').upload(newPath, bytes, { contentType: bon.fisier_tip || 'application/octet-stream' })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { error: updateError } = await sb.from('bonuri').update({ firma_id: firmaId, fisier_path: newPath }).eq('id', id)
  if (updateError) {
    await sb.storage.from('documente').remove([newPath])
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  await sb.storage.from('documente').remove([bon.fisier_path])
  return NextResponse.json({ ok: true, firmaNume: firma.nume })
}
