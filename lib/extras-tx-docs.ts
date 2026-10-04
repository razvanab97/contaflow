import type { getServiceSupabase } from '@/lib/supabase/server'

// Documentele justificative ale tranzactiilor din extrasele lunii (facturi, chitante, bonuri), in
// ordinea extrasului si apoi cronologic dupa data tranzactiei. Se iau DUPA TRANZACTII, nu dupa
// modulul/calea documentului: o factura din Inbox Facturi (folder local, Gmail) sau dintr-un alt modul
// asociata unei plati isi pastreaza calea originala si poate avea alta luna - altfel ar lipsi din
// exportul extrasului.
export async function getExtrasTxDocs(sb: ReturnType<typeof getServiceSupabase>, lunaId: string) {
  const { data: extrase } = await sb.from('extrase').select('id').eq('luna_id', lunaId)
  const extrasIds = (extrase || []).map(e => e.id)
  if (!extrasIds.length) return []
  const { data: txs } = await sb.from('tranzactii').select('id,extras_id,data_tranzactie,document_id').in('extras_id', extrasIds)
  if (!txs?.length) return []
  const txIds = txs.map(t => t.id)
  const docIds = txs.map(t => t.document_id).filter(Boolean) as string[]
  const SEL = 'id,fisier_path,fisier_nume,fisier_tip,tranzactie_id'
  const bucati = <T,>(a: T[], n = 150) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
  const rezultate = await Promise.all([
    ...bucati(txIds).map(ids => sb.from('documente').select(SEL).in('tranzactie_id', ids)),
    ...bucati(docIds).map(ids => sb.from('documente').select(SEL).in('id', ids)),
  ])
  const unice = new Map<string, { id: string; fisier_path: string; fisier_nume: string; fisier_tip: string; tranzactie_id: string | null }>()
  for (const r of rezultate) for (const d of r.data || []) unice.set(d.id, d)
  const txById = new Map(txs.map(t => [t.id, t]))
  const txDupaDoc = new Map(txs.filter(t => t.document_id).map(t => [t.document_id as string, t]))
  return [...unice.values()]
    .filter(d => !String(d.fisier_path).includes('/config/'))
    .map(doc => {
      const tx = (doc.tranzactie_id && txById.get(doc.tranzactie_id)) || txDupaDoc.get(doc.id)
      return { ...doc, extras_id: tx?.extras_id || null, data_tranzactie: tx?.data_tranzactie || '' }
    })
    .sort((a, b) => {
      const ea = a.extras_id || '', eb = b.extras_id || ''
      if (ea !== eb) return ea.localeCompare(eb)
      const da = a.data_tranzactie || '', db = b.data_tranzactie || ''
      if (da !== db) return da.localeCompare(db)
      return String(a.fisier_nume || '').localeCompare(String(b.fisier_nume || ''))
    })
}
