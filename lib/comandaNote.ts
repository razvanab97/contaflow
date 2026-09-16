import type { SupabaseClient } from '@supabase/supabase-js'

function curataFurnizor(raw: string | null | undefined): string {
  const nume = String(raw || '').split('|')[0]?.trim()
  return nume || 'furnizor necunoscut'
}

function scurtaReferinta(value: string | null | undefined) {
  const firstPart = String(value || '').split(';')[0]?.trim() || ''
  return firstPart.match(/\d+/)?.[0] || firstPart
}

// Cand o tranzactie/comanda ajunge sa aiba mai multe facturi atasate (butonul "+ Adaugă
// altă factură"), notam automat in tab-ul "Note pe tranzacții" din ce facturi e formata
// suma totala - ca sa nu mai trebuiasca cautat manual prin arhiva de fiecare data cand
// cineva verifica de ce o singura plata din extras acopera mai multe documente.
// Nu face nimic daca tranzactia are 0 sau 1 documente atasate.
export async function syncComandaNote(sb: SupabaseClient, txId: string) {
  const { data: tx } = await sb.from('tranzactii').select('id,suma,valuta,referinta').eq('id', txId).maybeSingle()
  if (!tx) return

  const { data: docs } = await sb
    .from('documente')
    .select('furnizor,numar_document,suma')
    .eq('tranzactie_id', txId)
    .order('created_at', { ascending: true })
  if (!docs || docs.length < 2) return

  const valuta = tx.valuta || 'RON'
  const orderRef = scurtaReferinta(tx.referinta)
  const total = Number(tx.suma || 0).toFixed(2)
  const items = docs
    .map(d => `${curataFurnizor(d.furnizor)}${d.numar_document ? ` (${d.numar_document})` : ''} - ${Number(d.suma ?? 0).toFixed(2)} ${valuta}`)
    .join(', ')
  const note = `${orderRef ? `Comanda ${orderRef}` : 'Această plată'} din suma ${total} ${valuta} este formată din ${docs.length} facturi: ${items}.`

  await sb.from('tranzactii').update({ status_note: note }).eq('id', txId)
}
