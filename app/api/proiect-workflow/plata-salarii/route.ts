import { NextRequest, NextResponse } from 'next/server'
import { extractText, getDocumentProxy } from 'unpdf'
import { scopeContext, readWorkflow, WorkflowError } from '@/lib/proiect-workflow-store'
import { previousMonthKey } from '@/lib/accounting-period'
import { parsePayroll, reconcilePayroll } from '@/lib/grant-credit'
import { salaryPlanRows, validSalaryPayment, type SalaryReference, type SalaryPlan } from '@/lib/salary-payment'
import type { Asset } from '@/lib/proiect-workflow'

export const maxDuration = 60
export async function GET(req: NextRequest) {
  try {
    const firmaId = req.nextUrl.searchParams.get('firmaId') || '', scope = req.nextUrl.searchParams.get('scope') || ''
    if (!scope.startsWith('month-')) throw new WorkflowError('Pregătirea salariilor aparține unei luni de proiect.')
    const { sb, prefix, month } = await scopeContext(firmaId,scope), state = await readWorkflow(prefix), period = previousMonthKey(month)
    const latest = (task: string) => state.assets.filter(a=>a.task===task).reverse().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).at(0)
    const stat = latest('stat'), central = latest('centralizator')
    if (!stat) throw new WorkflowError('Încarcă statul de plată al lunii. OP-urile vechi oferă conturile, nu stabilesc salariul actual.',422)
    async function read(asset: Asset, type: 'stat'|'centralizator') {
      if (!/^[a-f0-9-]{36}$/i.test(asset.id) || asset.type!=='application/pdf') throw new WorkflowError('Analiza necesită PDF-uri cu text lizibil.',422)
      const { data, error } = await sb.storage.from('documente').download(`${prefix}/files/${asset.id}`)
      if (error || !data) throw new WorkflowError(`Nu pot citi ${asset.name}.`,503)
      if (data.size>4*1024*1024) throw new WorkflowError('Documentul depășește 4 MB.',413)
      const text = await extractText(await getDocumentProxy(new Uint8Array(await data.arrayBuffer())),{mergePages:true})
      return parsePayroll(String(text.text || ''),type)
    }
    let payroll, contributionsCents: number | undefined, warnings: string[] = []
    try {
      payroll = await read(stat,'stat')
      if (payroll.period !== period) throw new Error(`Statul trebuie să fie pentru ${period}, nu ${payroll.period}.`)
      if (central) { const parsed = await read(central,'centralizator'); reconcilePayroll(payroll,parsed,period); contributionsCents=parsed.contributionsCents; warnings=parsed.warnings }
      else warnings.push('Lipsește centralizatorul: afișăm doar salariile nete, nu un total verificat al contribuțiilor.')
    } catch(error) { if(error instanceof WorkflowError)throw error;throw new WorkflowError(error instanceof Error?error.message:'Date salariale neclare.',422) }
    const references: SalaryReference[] = []
    const collect = (assets: Asset[], fromScope: string) => {
      for(const asset of assets)if(asset.task==='salarii'&&validSalaryPayment(asset.salaryPayment)&&asset.salaryPayment.period<period)references.push({payment:asset.salaryPayment,assetId:asset.id,assetName:asset.name,scope:fromScope,createdAt:asset.createdAt})
    }
    collect(state.assets,scope)
    const {data:history,error} = await sb.from('luni_contabile').select('id,luna').eq('firma_id',firmaId).lt('luna',`${month}-01`).order('luna',{ascending:false}).limit(24)
    if(error)throw new WorkflowError('Nu pot verifica OP-urile lunilor precedente.',503)
    for(const prior of history || []){
      const priorScope = `month-${prior.id}`, workflow = await readWorkflow(`${firmaId}/workflow/${priorScope}`)
      collect(workflow.assets,priorScope)
    }
    const rows = salaryPlanRows(payroll.rows,references,period)
    if(rows.some(row=>!row.reference))warnings.push('Pentru unele persoane lipsește un OP salarial anterior recunoscut. Nu inventăm conturi bancare.')
    const plan: SalaryPlan = {period,netCents:payroll.netCents!,contributionsCents,warnings,stat:{id:stat.id,name:stat.name},rows}
    return NextResponse.json(plan,{headers:{'Cache-Control':'private, no-store'}})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Planul de salarii nu a putut fi pregătit.'},{status:error instanceof WorkflowError?error.status:500,headers:{'Cache-Control':'private, no-store'}})}
}
