import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export async function GET(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  const supplier = normalized(req.nextUrl.searchParams.get('supplier') || '')
  if (!lunaId || supplier.length < 2) return NextResponse.json({ suggestions:[] })

  const sb = getServiceSupabase()
  const { data: statements, error: statementError } = await sb.from('extrase').select('id').eq('luna_id', lunaId)
  if (statementError) return NextResponse.json({ error:statementError.message }, { status:500 })
  const ids = (statements || []).map(statement => statement.id)
  if (!ids.length) return NextResponse.json({ suggestions:[] })

  const { data, error } = await sb.from('tranzactii')
    .select('id,data_tranzactie,descriere,descriere_curatata,referinta,suma,valuta')
    .in('extras_id', ids)
    .eq('tip', 'debit')
  if (error) return NextResponse.json({ error:error.message }, { status:500 })

  const tokens = supplier.split(' ').filter(token => token.length > 1)
  const suggestions = (data || []).map(transaction => {
    const haystack = normalized(`${transaction.descriere_curatata || ''} ${transaction.descriere || ''}`)
    const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? token.length : 0), 0)
    return { ...transaction, score }
  }).filter(transaction => transaction.score > 0).sort((a,b) => b.score - a.score).slice(0, 8)

  return NextResponse.json({ suggestions })
}
