import { getServiceSupabase } from '@/lib/supabase/server'
import { getFirmaConfig, MODULE_DEFS } from '@/lib/firma-config'
import { computeVerification, getDeFacturat } from '@/lib/stardeskVerify'
import type { Punct } from '@/lib/mail-contabil-tipuri'

// Starea reala a lunii pentru o firma - sursa comuna pentru alertele "De facut" de pe Dashboard,
// pagina "Sistem de lucru" (pasii in ordine, cu bife reale) si pachetul pentru contabil. Doar citiri.

type Sb = ReturnType<typeof getServiceSupabase>
export const TASK_PACHET_TRIMIS = 'sistem.pachet_trimis'

export interface StareFirma {
  lunaId: string | null
  module: string[]
  extrase: number
  txTotal: number; txFaraDocument: number; txFaraDocumentVechi: number
  inboxNeasociateVechi: number
  deFacturat: { n: number; total: number; vechi: number } | null
  stardesk: { discrepante: number; faraFactura: number; bookingLipsa: number } | null
  airbnbCsv: number | null; bookingBorderou: number | null
  avizeEmag: number | null
  mailDeschise: number; mailVechi: number
  impoziteRamase: number; raportGata: boolean; pachetTrimis: boolean
}

const zileInUrma = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

export async function getStareFirma(sb: Sb, firma: { id: string; slug: string }, luna: string): Promise<StareFirma> {
  const module = getFirmaConfig(firma.slug)?.module || []
  const { data: luni } = await sb.from('luni_contabile').select('id,luna').eq('firma_id', firma.id)
  const lunaId = (luni || []).find(l => String(l.luna).startsWith(luna))?.id || null
  const are = (m: string) => module.includes(m as never)

  const [extraseR, inboxR, mailR, stariR] = await Promise.all([
    lunaId ? sb.from('extrase').select('id').eq('luna_id', lunaId) : Promise.resolve({ data: [] as { id: string }[] }),
    sb.from('documente').select('furnizor').eq('firma_id', firma.id).like('fisier_path', '%/inbox-facturi/%').is('tranzactie_id', null).lt('data_document', zileInUrma(30)).limit(2000),
    sb.from('mail_contabil').select('created_at,puncte').eq('firma_id', firma.id),
    lunaId ? sb.from('task_stari').select('task_key,completat').eq('luna_id', lunaId) : Promise.resolve({ data: [] as { task_key: string; completat: boolean }[] }),
  ])
  const extrasIds = (extraseR.data || []).map(e => e.id)
  const { data: txs } = extrasIds.length
    ? await sb.from('tranzactii').select('document_id,note,motiv_ignorare,data_tranzactie').in('extras_id', extrasIds)
    : { data: [] as { document_id: string | null; note: string | null; motiv_ignorare: string | null; data_tranzactie: string }[] }
  // "Neasociate" exact ca in pagina Extras (txStatus): fara document si neignorate (note 'na' = ignorata).
  const deschise = (txs || []).filter(t => !t.document_id && t.note !== 'na')

  // Situatiile din mailurile contabilului inca nerezolvate (si cele mai vechi de 14 zile).
  let mailDeschise = 0, mailVechi = 0
  for (const m of mailR.data || []) {
    const n = ((m.puncte as Punct[]) || []).filter(p => !p.rezolvatManual && p.status !== 'rezolvat').length
    mailDeschise += n
    if (String(m.created_at).slice(0, 10) < zileInUrma(14)) mailVechi += n
  }
  const done = new Set((stariR.data || []).filter(s => s.completat).map(s => s.task_key))

  let deFacturat: StareFirma['deFacturat'] = null, stardesk: StareFirma['stardesk'] = null, airbnbCsv = null, bookingBorderou = null, avizeEmag = null
  if (are('5stardesk')) {
    const lista = await getDeFacturat(sb, firma.id)
    deFacturat = { n: lista.length, total: Math.round(lista.reduce((s, x) => s + (x.total ?? 0), 0) * 100) / 100, vechi: lista.filter(x => (x.dataSfarsit || '9999') < zileInUrma(7) || !x.dataSfarsit).length }
    if (lunaId) {
      const v = await computeVerification(sb, lunaId).catch(() => null)
      if (v) stardesk = {
        discrepante: v.discrepanteClient.length, faraFactura: v.faraFacturaClient.length,
        // facturi Booking (cod numeric) cu check-out in perioada, dar rezervarea lipseste din borderou
        bookingLipsa: v.facturiFaraRezervare.filter(f => (f as { unde?: string }).unde === 'lipsa' && /^\d{6,}$/.test(String(f.idRezervare || ''))).length,
      }
    }
  }
  if (lunaId && (are('airbnb-borderou') || are('booking-facturi'))) {
    const [a, b] = await Promise.all([
      sb.from('airbnb_facturi_asteptate').select('id', { count: 'exact', head: true }).eq('luna_id', lunaId),
      sb.from('borderou_rezervari').select('id', { count: 'exact', head: true }).eq('luna_id', lunaId).eq('platforma', 'booking'),
    ])
    airbnbCsv = a.count ?? 0; bookingBorderou = b.count ?? 0
  }
  if (lunaId && are('emag')) {
    const { count } = await sb.from('documente').select('id', { count: 'exact', head: true }).eq('luna_id', lunaId).eq('modul', 'emag').eq('tip_document', 'aviz_plata')
    avizeEmag = count ?? 0
  }
  const impozite = MODULE_DEFS.impozite?.tasks || []
  const raport = MODULE_DEFS['raport-lunar']?.tasks || []
  return {
    lunaId, module,
    extrase: extrasIds.length,
    txTotal: (txs || []).length, txFaraDocument: deschise.length, txFaraDocumentVechi: deschise.filter(t => t.data_tranzactie < zileInUrma(14)).length,
    // fara facturile decontate altfel decat prin plata bancara (eMAG/Dante - retinute din aviz; platformele)
    inboxNeasociateVechi: (inboxR.data || []).filter(d => !/dante|emag|airbnb|booking/i.test(String(d.furnizor || '').split('|')[0])).length,
    deFacturat, stardesk, airbnbCsv, bookingBorderou, avizeEmag,
    mailDeschise, mailVechi,
    impoziteRamase: impozite.filter(t => !done.has(t.key)).length,
    raportGata: raport.length > 0 && raport.every(t => done.has(t.key)),
    pachetTrimis: done.has(TASK_PACHET_TRIMIS),
  }
}

// Fisierele din folderul local (Personal Computer) inca neprocesate sau de atribuit manual - global.
export async function getFolderLocalDeRezolvat(sb: Sb) {
  const { count } = await sb.from('inbox_watch_files').select('id', { count: 'exact', head: true }).in('status', ['pending', 'nedetectat', 'eroare'])
  return count ?? 0
}
