import { NextRequest, NextResponse } from 'next/server'
import { extractText, getDocumentProxy } from 'unpdf'
import { scopeContext, readWorkflow, WorkflowError } from '@/lib/proiect-workflow-store'
import { previousMonthKey } from '@/lib/accounting-period'
import { completeCreditScheme, validCreditScheme, parsePayroll, reconcilePayroll, calculateGrantCredit, type CreditAnalysis } from '@/lib/grant-credit'

export const maxDuration = 60
export async function GET(req: NextRequest) {
  try {
    const scope = req.nextUrl.searchParams.get('scope') || '', firmaId = req.nextUrl.searchParams.get('firmaId') || ''
    if (!scope.startsWith('month-')) throw new WorkflowError('Calculul creditării aparține unei luni de proiect.')
    const { sb, prefix, month } = await scopeContext(firmaId, scope), state = await readWorkflow(prefix)
    const latest = (task: string) => state.assets.filter(asset=>asset.task===task).reverse().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).at(0)
    const stat = latest('stat'), central = latest('centralizator')
    if (!stat || !central) throw new WorkflowError('Încarcă statul de plată și centralizatorul contribuțiilor pentru a calcula creditarea.', 422)
    async function text(asset: typeof stat) {
      if (!asset || !/^[a-f0-9-]{36}$/i.test(asset.id) || asset.type !== 'application/pdf') throw new WorkflowError('Calculul automat necesită statul și centralizatorul în format PDF cu text lizibil.', 422)
      const { data, error } = await sb.storage.from('documente').download(`${prefix}/files/${asset.id}`)
      if (error || !data) throw new WorkflowError(`Nu pot citi documentul ${asset.name}.`, 503)
      if (data.size > 4*1024*1024) throw new WorkflowError('Limita de analiză este 4 MB pe document.')
      const result = await extractText(await getDocumentProxy(new Uint8Array(await data.arrayBuffer())), { mergePages: true })
      return String(result.text || '')
    }
    const period = previousMonthKey(month)
    let parsedStat, parsedCentral
    try { parsedStat = parsePayroll(await text(stat), 'stat'); parsedCentral = parsePayroll(await text(central), 'centralizator') }
    catch (error) { if (error instanceof WorkflowError) throw error; throw new WorkflowError(error instanceof Error ? error.message : 'Documente neclare.',422) }
    let scheme = state.creditScheme || completeCreditScheme()
    if (!state.creditScheme) {
      const { data: previous, error } = await sb.from('luni_contabile').select('id').eq('firma_id',firmaId).eq('luna',`${previousMonthKey(month)}-01`).maybeSingle()
      if (error) throw new WorkflowError('Nu pot verifica schema lunii precedente.',503)
      if (previous) { const prior = await readWorkflow(`${firmaId}/workflow/month-${previous.id}`); if (prior.creditScheme) scheme = { ...prior.creditScheme, source: `Bază confirmată în luna de lucru ${previousMonthKey(month)}. ${prior.creditScheme.source}`.slice(0,1000) } }
    }
    if (!validCreditScheme(scheme)) throw new WorkflowError('Schema salvată nu este validă; verifică baza înainte de calcul.',422)
    let actual
    try { actual = reconcilePayroll(parsedStat,parsedCentral,period); calculateGrantCredit(actual,scheme) }
    catch (error) { throw new WorkflowError(error instanceof Error ? error.message : 'Datele nu se reconciliază.',422) }
    const analysis: CreditAnalysis = { period, actual, scheme, warnings: [...parsedStat.warnings,...parsedCentral.warnings], sources: { stat: { id:stat.id,name:stat.name }, centralizator: { id:central.id,name:central.name } } }
    return NextResponse.json(analysis,{headers:{'Cache-Control':'private, no-store'}})
  } catch (error) { return NextResponse.json({error:error instanceof Error?error.message:'Calculul creditării nu a putut fi generat.'},{status:error instanceof WorkflowError?error.status:500}) }
}
