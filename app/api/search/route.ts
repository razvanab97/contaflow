import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

function normalized(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export async function GET(req: NextRequest) {
  const term = normalized(req.nextUrl.searchParams.get('q')).trim()
  if (!term) return NextResponse.json({ results: [] })
  const sb = getServiceSupabase()
  const [{ data: firms }, { data: months }, { data: statements }, { data: transactions }, { data: documents }] = await Promise.all([
    sb.from('firme').select('id,slug,nume'),
    sb.from('luni_contabile').select('id,firma_id,luna'),
    sb.from('extrase').select('id,luna_id,valuta,iban'),
    sb.from('tranzactii').select('id,extras_id,data_tranzactie,descriere,descriere_curatata,referinta,suma,valuta,categorie').limit(5000),
    sb.from('documente').select('id,firma_id,luna_id,fisier_nume,furnizor,tip_document').limit(5000),
  ])
  const firmMap = new Map((firms || []).map(firm => [firm.id, firm]))
  const monthMap = new Map((months || []).map(month => [month.id, month]))
  const statementMap = new Map((statements || []).map(statement => [statement.id, statement]))
  const results: { type:string; title:string; detail:string; href:string }[] = []
  const add = (type:string, title:string, detail:string, firmaId:string, lunaId?:string, extras=false) => {
    const firm = firmMap.get(firmaId)
    const month = lunaId ? monthMap.get(lunaId) : null
    if (!firm) return
    results.push({ type, title, detail, href: month ? `/${firm.slug}/${String(month.luna).slice(0, 7)}${extras ? '/extras' : ''}` : `/dashboard` })
  }
  for (const firm of firms || []) {
    if (normalized(firm.nume).includes(term)) add('Firmă', firm.nume, 'Firmă', firm.id)
  }
  for (const transaction of transactions || []) {
    const statement = statementMap.get(transaction.extras_id)
    const month = statement ? monthMap.get(statement.luna_id) : null
    const haystack = normalized(`${transaction.suma} ${transaction.valuta} ${transaction.data_tranzactie} ${transaction.descriere} ${transaction.descriere_curatata} ${transaction.referinta} ${transaction.categorie}`)
    if (month && haystack.includes(term)) add('Tranzacție', `${transaction.suma} ${transaction.valuta} · ${transaction.descriere_curatata || transaction.descriere}`, `${transaction.data_tranzactie}${transaction.referinta ? ` · Ref: ${transaction.referinta}` : ''}`, month.firma_id, month.id, true)
  }
  for (const document of documents || []) {
    const haystack = normalized(`${document.fisier_nume} ${document.furnizor} ${document.tip_document}`)
    if (haystack.includes(term)) add('Document', document.fisier_nume, document.furnizor || document.tip_document, document.firma_id, document.luna_id)
  }
  return NextResponse.json({ results: results.slice(0, 40) })
}
