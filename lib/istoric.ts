import { getServiceSupabase } from '@/lib/supabase/server'
import { getFirmaTotalTasks } from '@/lib/firma-config'
import { workMonthLabel } from '@/lib/accounting-period'
import { calculeazaFlux, dispozitiiPeLuni, type TxFlux } from '@/lib/flux-lunar'

export interface PunctIstoric {
  luna: string          // luna de lucru, YYYY-MM
  label: string
  incasari: number      // incasarile reale: toate conturile, echivalent lei la cursul BNR, fara schimburi valutare si fara imprumuturi de la asociat (ca /api/luna/flux)
  imprumutPrimit: number // imprumut primit (nu e incasare) - intra doar in cashflow-ul real din conturi
  plati: number
  pct: number           // % task-uri bifate
  initializata: boolean
}

function lunileAnterioare(luna: string, n: number): string[] {
  const [y, m] = luna.split('-').map(Number)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

// Tendinta pe ultimele n luni pentru o firma - alimenteaza sparkline-urile (Dashboard + Rezumatul
// lunii). Doar citiri; tranzactiile se pagineaza ca sa nu fie trunchiate la limita de 1000 de randuri.
export async function getIstoricLunar(firmaId: string, firmaSlug: string, luna: string, n = 6): Promise<PunctIstoric[]> {
  const sb = getServiceSupabase()
  const luni = lunileAnterioare(luna, n)
  const { data: luniRows } = await sb.from('luni_contabile').select('id,luna').eq('firma_id', firmaId)
  const idByLuna = new Map<string, string>()
  for (const l of luniRows || []) idByLuna.set(String(l.luna).slice(0, 7), l.id)
  const lunaIds = luni.map(l => idByLuna.get(l)).filter(Boolean) as string[]

  const totalTasks = getFirmaTotalTasks(firmaSlug)
  const doneByLuna = new Map<string, number>()
  const bankByLuna = new Map<string, { in: number; out: number; imp: number }>()
  const txByLuna = new Map<string, TxFlux[]>()

  if (lunaIds.length) {
    const [{ data: stari }, { data: extrase }] = await Promise.all([
      sb.from('task_stari').select('luna_id,completat').in('luna_id', lunaIds).eq('completat', true),
      sb.from('extrase').select('id,luna_id').in('luna_id', lunaIds),
    ])
    for (const s of stari || []) doneByLuna.set(s.luna_id, (doneByLuna.get(s.luna_id) || 0) + 1)
    const lunaByExtras = new Map<string, string>((extrase || []).map((e: any) => [e.id, e.luna_id]))
    const extrasIds = [...lunaByExtras.keys()]
    for (let from = 0; extrasIds.length; from += 1000) {
      const { data: txs } = await sb.from('tranzactii').select('extras_id,data_tranzactie,tip,suma,valuta,descriere,descriere_curatata').in('extras_id', extrasIds).order('id').range(from, from + 999)
      for (const t of txs || []) {
        const lid = lunaByExtras.get(t.extras_id)
        if (lid) txByLuna.set(lid, [...(txByLuna.get(lid) || []), t])
      }
      if (!txs || txs.length < 1000) break
    }
    await Promise.all([...txByLuna.entries()].map(async ([lid, txs]) => {
      const f = await calculeazaFlux(txs)
      bankByLuna.set(lid, { in: f.consolidat.incasariReale.total, out: f.consolidat.plati, imp: f.consolidat.imprumut.primit })
    }))
  }

  // plati in numerar (dispozitii de plata) - ca ultimul punct al tendintei sa fie egal cu cardul „Plati”
  const dispozitii = await dispozitiiPeLuni(sb, lunaIds)

  return luni.map(l => {
    const id = idByLuna.get(l)
    const bank = id ? bankByLuna.get(id) : undefined
    const done = id ? doneByLuna.get(id) || 0 : 0
    return {
      luna: l,
      label: workMonthLabel(l, true),
      incasari: Math.round((bank?.in || 0) * 100) / 100,
      imprumutPrimit: Math.round((bank?.imp || 0) * 100) / 100,
      plati: Math.round(((bank?.out || 0) + (id ? dispozitii.get(id)?.total || 0 : 0)) * 100) / 100,
      pct: totalTasks > 0 ? Math.min(100, Math.round((done / totalTasks) * 100)) : 0,
      initializata: !!id,
    }
  })
}
