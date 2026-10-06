import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { collectPaged } from '@/lib/raport-lunar'
import { cursuriBnrSigur } from '@/lib/curs-bnr'
import { claseazaAchizitie } from '@/lib/achizitii-produse'
import { regulaAutomata } from '@/lib/tranzactii-reguli'
import { tipImprumut } from '@/lib/flux-lunar'

// "Achizitii produse" pe orice perioada: totalul, defalcarea pe furnizor si tranzactiile din spatele
// fiecarei sume (in lei la cursul BNR din ziua platii; valuta originala ramane vizibila). Doar citiri.
// Intoarce si platile NEincluse (candidati) din perioada, ca sa se poata marca manual ce lipseste.
export type PerioadaAchizitii = 'azi' | 'luna_curenta' | 'luna_selectata' | 'an' | 'interval' | 'total'

const r2 = (n: number) => Math.round(n * 100) / 100
const azi = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bucharest' }).format(new Date())
const ziUrmatoare = (d: string) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10) }
const ISO = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const firmaId = p.get('firmaId')
  const perioada = (p.get('perioada') || 'luna_selectata') as PerioadaAchizitii
  const lunaId = p.get('lunaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })
  if (!['azi', 'luna_curenta', 'luna_selectata', 'an', 'interval', 'total'].includes(perioada)) return NextResponse.json({ error: 'Perioadă invalidă' }, { status: 400 })

  const astazi = azi()
  let from: string | null = null
  let to: string | null = null
  if (perioada === 'azi') { from = astazi; to = astazi }
  else if (perioada === 'luna_curenta') { from = `${astazi.slice(0, 8)}01`; to = astazi }
  else if (perioada === 'an') { from = `${astazi.slice(0, 4)}-01-01`; to = astazi }
  else if (perioada === 'interval') {
    const f = p.get('from') || '', t = p.get('to') || ''
    if (!ISO.test(f) || !ISO.test(t)) return NextResponse.json({ error: 'Interval invalid' }, { status: 400 })
    from = f <= t ? f : t; to = f <= t ? t : f
  }
  if (perioada === 'luna_selectata' && !lunaId) return NextResponse.json({ error: 'lunaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  try {
    const luni = await sb.from('luni_contabile').select('id').eq('firma_id', firmaId)
    if (luni.error) throw new Error(luni.error.message)
    let lunaIds = (luni.data || []).map(l => l.id)
    if (perioada === 'luna_selectata') lunaIds = lunaIds.filter(id => id === lunaId)
    const extrase = lunaIds.length ? await sb.from('extrase').select('id').in('luna_id', lunaIds) : { data: [], error: null }
    if (extrase.error) throw new Error(extrase.error.message)
    const extrasIds = (extrase.data || []).map(e => e.id)

    let migrare = true
    let txs: any[] = []
    if (extrasIds.length) {
      const COLS = 'id,data_tranzactie,tip,suma,valuta,descriere,descriere_curatata'
      const incarca = (cols: string) => collectPaged<any>((a, b) => {
        let q = sb.from('tranzactii').select(cols).in('extras_id', extrasIds).eq('tip', 'debit')
        if (from && to) q = q.gte('data_tranzactie', from).lt('data_tranzactie', ziUrmatoare(to))
        return q.order('data_tranzactie').order('id').range(a, b) as any
      })
      txs = await incarca(`${COLS},achizitie_produse`).catch(() => { migrare = false; return incarca(COLS) })
    }

    const curs = txs.some(t => (t.valuta || 'RON').toUpperCase() !== 'RON') ? await cursuriBnrSigur(txs.map(t => String(t.data_tranzactie).slice(0, 10))) : null
    const inLeiTx = (t: any): number | null => {
      const v = (t.valuta || 'RON').toUpperCase()
      const suma = Math.abs(Number(t.suma))
      if (!Number.isFinite(suma)) return null
      if (v === 'RON') return r2(suma)
      const k = curs ? curs(String(t.data_tranzactie).slice(0, 10), v) : null
      return k ? r2(suma * k) : null
    }
    const descriere = (t: any) => String(t.descriere || t.descriere_curatata || '').replace(/\s+/g, ' ').trim().slice(0, 160)

    const incluse: any[] = []
    const candidati: any[] = []
    const perFurnizor = new Map<string, { suma: number; numar: number }>()
    let faraCurs = 0
    for (const t of txs) {
      const cl = claseazaAchizitie(t)
      const lei = inLeiTx(t)
      const baza = { id: t.id, data: String(t.data_tranzactie).slice(0, 10), descriere: descriere(t), suma: Math.abs(Number(t.suma)), valuta: (t.valuta || 'RON').toUpperCase(), sumaLei: lei }
      if (cl) {
        incluse.push({ ...baza, furnizor: cl.furnizor, sursa: cl.sursa })
        if (lei == null) { faraCurs++; continue }
        const f = perFurnizor.get(cl.furnizor) || { suma: 0, numar: 0 }
        f.suma += lei; f.numar++
        perFurnizor.set(cl.furnizor, f)
      } else if (!regulaAutomata(t) && !tipImprumut(t)) {
        candidati.push({ ...baza, excluseManual: t.achizitie_produse === false })
      }
    }
    const furnizori = [...perFurnizor.entries()].map(([furnizor, f]) => ({ furnizor, suma: r2(f.suma), numar: f.numar })).sort((a, b) => b.suma - a.suma)
    incluse.sort((a, b) => b.data.localeCompare(a.data))
    candidati.sort((a, b) => b.data.localeCompare(a.data) || (b.sumaLei ?? 0) - (a.sumaLei ?? 0))

    return NextResponse.json({
      perioada, from, to, migrare, faraCurs,
      total: r2(furnizori.reduce((a, f) => a + f.suma, 0)),
      numar: furnizori.reduce((a, f) => a + f.numar, 0),
      furnizori,
      tranzactii: incluse,
      candidati: candidati.slice(0, 300),
      candidatiTotal: candidati.length,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 })
  }
}
