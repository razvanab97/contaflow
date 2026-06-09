import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const itemId = req.nextUrl.searchParams.get('itemId')
  if (!itemId) return NextResponse.json({ docs: [] })

  const sb = getServiceSupabase()
  const { data:docs, error } = await sb.from('documente')
    .select('id,fisier_nume,tip_document')
    .eq('checklist_item_id', itemId)
    .order('created_at')
  if (error) return NextResponse.json({ error:error.message }, { status:500 })
  return NextResponse.json({ docs:docs || [] })
}

export async function DELETE(req: NextRequest) {
  const { itemId, ids } = await req.json()
  const documentIds = Array.isArray(ids) ? [...new Set(ids.filter(id => typeof id === 'string' && id))] : []
  if (!itemId || !documentIds.length) return NextResponse.json({ error:'Selectează cel puțin un document' }, { status:400 })

  const sb = getServiceSupabase()
  const { data:docs, error } = await sb.from('documente')
    .select('id,fisier_path')
    .eq('checklist_item_id', itemId)
    .in('id', documentIds)
  if (error) return NextResponse.json({ error:error.message }, { status:500 })
  if (!docs?.length) return NextResponse.json({ error:'Documentele nu au fost găsite în această secțiune' }, { status:404 })

  const deletedIds = docs.map(doc => doc.id)
  const { error:deleteError } = await sb.from('documente')
    .delete()
    .eq('checklist_item_id', itemId)
    .in('id', deletedIds)
  if (deleteError) return NextResponse.json({ error:deleteError.message }, { status:500 })

  const paths = docs.map(doc => doc.fisier_path).filter(Boolean)
  const storageResult = paths.length ? await sb.storage.from('documente').remove(paths) : { error:null }
  return NextResponse.json({ ok:true, deletedIds, warning:storageResult.error?.message || null })
}

export async function PATCH(req: NextRequest) {
  const { itemId, targetItemId, ids } = await req.json()
  const documentIds = Array.isArray(ids) ? [...new Set(ids.filter(id => typeof id === 'string' && id))] : []
  if (!itemId || !targetItemId || itemId === targetItemId || !documentIds.length)
    return NextResponse.json({ error:'Selectează documentele și o altă secțiune' }, { status:400 })

  const sb = getServiceSupabase()
  const { data:items, error:itemError } = await sb.from('checklist_items')
    .select('id,luna_id')
    .in('id', [itemId, targetItemId])
  if (itemError) return NextResponse.json({ error:itemError.message }, { status:500 })
  const sourceItem = items?.find(item => item.id === itemId)
  const targetItem = items?.find(item => item.id === targetItemId)
  if (!sourceItem || !targetItem || sourceItem.luna_id !== targetItem.luna_id)
    return NextResponse.json({ error:'Secțiunea destinație nu aparține aceleiași luni' }, { status:400 })

  const { data:moved, error } = await sb.from('documente')
    .update({ checklist_item_id:targetItemId })
    .eq('checklist_item_id', itemId)
    .in('id', documentIds)
    .select('id')
  if (error) return NextResponse.json({ error:error.message }, { status:500 })
  if (!moved?.length) return NextResponse.json({ error:'Documentele nu au fost găsite în această secțiune' }, { status:404 })
  return NextResponse.json({ ok:true, movedIds:moved.map(document => document.id) })
}
