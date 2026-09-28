import {NextRequest,NextResponse} from 'next/server'
import {TASKS,LEGACY_GROUPS,STEP_LABELS,FORM_FIELDS,defaultDraft,initialMonth,emptyWorkflow,blockedBy,type Workflow,type FormKind} from '@/lib/proiect-workflow'
import {scopeContext,readWorkflow,writeWorkflow,sameOrigin,WorkflowError} from '@/lib/proiect-workflow-store'
function failure(e:unknown){return NextResponse.json({error:e instanceof Error?e.message:'Eroare proiect'},{status:e instanceof WorkflowError?e.status:500})}
function validate(state:Workflow) {
 if(!state||typeof state!=='object'||JSON.stringify(state).length>300000)throw new WorkflowError('Date prea mari sau invalide')
 if(!state.profile||Object.values(state.profile).some(v=>typeof v!=='string'||v.length>20000))throw new WorkflowError('Date beneficiar invalide')
 for(const t of TASKS){const r=state.rules?.[t.key];if(!r||!Number.isInteger(r.day)||r.day<1||r.day>31||!Number.isInteger(r.offset)||r.offset<0||r.offset>2||!['monthly','annual','manual'].includes(r.frequency)||!Number.isInteger(r.month)||r.month<1||r.month>12)throw new WorkflowError('Regulă de termen invalidă')}
 if(!state.tasks||!state.forms)throw new WorkflowError('Date incomplete')
 for(const [key,t]of Object.entries(state.tasks)){
 if(!TASKS.some(x=>x.key===key)||!t||!Object.hasOwn(STEP_LABELS,t.status)||typeof t.note!=='string'||t.note.length>10000||t.due!==null&&(typeof t.due!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(t.due)||!Number.isFinite(Date.parse(t.due))||new Date(t.due).toISOString().slice(0,10)!==t.due))throw new WorkflowError('Stare / dată invalidă')
 }
 for(const [key,d]of Object.entries(state.forms)){
 if(![...Object.keys(FORM_FIELDS),'dosar'].includes(key)||!d?.fields||!Array.isArray(d.lines)||d.lines.length>100||Object.values(d.fields).some(v=>typeof v!=='string'||v.length>30000))throw new WorkflowError('Formular invalid')
 for(const l of d.lines)if(!l||['supplier','product','specs','unit','qty','price','currency','rate','source','date'].some(k=>typeof l[k as keyof typeof l]!=='string'||l[k as keyof typeof l].length>10000))throw new WorkflowError('Poziție invalidă')
 }
}
export async function GET(req:NextRequest){try{
 const firmaId=req.nextUrl.searchParams.get('firmaId')||'',scope=req.nextUrl.searchParams.get('scope')||''
 const {prefix,month,sb}=await scopeContext(firmaId,scope)
 let state=await readWorkflow(prefix)
 if(!state.version&&scope!=='settings'){
 const settings=await readWorkflow(`${firmaId}/workflow/settings`)
 state=month?initialMonth(month,settings):{...emptyWorkflow(),profile:settings.profile,rules:settings.rules}
 if(month){
 const [y,m]=month.split('-').map(Number)
 const previousDate=new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,10)
 const {data:previous,error:previousError}=await sb.from('luni_contabile').select('id').eq('firma_id',firmaId).eq('luna',previousDate).maybeSingle()
 if(previousError)throw new WorkflowError('Nu pot verifica luna precedentă',503)
 if(previous){const prev=await readWorkflow(`${firmaId}/workflow/month-${previous.id}`);if(prev.forms.raport)state.forms.raport={...prev.forms.raport,fields:{...prev.forms.raport.fields,...defaultDraft('raport',month).fields,data:'',_preluat:previousDate.slice(0,7)}}}
 const {data,error}=await sb.from('obligatii_stari').select('tip_key,trimis,scadenta').eq('luna_id',scope.slice(6))
 if(error)throw new WorkflowError('Nu pot verifica istoricul obligațiilor',503)

 for(const row of data||[])for(const key of LEGACY_GROUPS[row.tip_key]||[]){if(row.trimis){state.tasks[key].status=['creditare','salarii'].includes(key)?'primit':'trimis';state.tasks[key].note=['creditare','salarii'].includes(key)?'Bifa veche confirma pachetul transmis, nu executarea plății. Verifică extrasul bancar și dovada.':'Preluat din checklistul anterior; acceptarea nu este confirmată.'}if(row.scadenta)state.tasks[key].due=row.scadenta}
 }
 try{state=await writeWorkflow(prefix,state,0)}catch(e){if(e instanceof WorkflowError&&e.status===409)state=await readWorkflow(prefix);else throw e}
 }
 if(month&&['creditare','salarii'].some(key=>state.tasks[key]?.note==='Preluat din checklistul anterior; acceptarea nu este confirmată.')){
  const corrected={...state,tasks:{...state.tasks}}
  for(const key of ['creditare','salarii'])if(corrected.tasks[key]?.note==='Preluat din checklistul anterior; acceptarea nu este confirmată.')corrected.tasks[key]={...corrected.tasks[key],status:'primit',note:'Bifa veche confirma pachetul transmis, nu executarea plății. Verifică extrasul bancar și dovada.'}
  try{state=await writeWorkflow(prefix,corrected,state.version)}catch(e){if(e instanceof WorkflowError&&e.status===409)state=await readWorkflow(prefix);else throw e}
 }
 return NextResponse.json({state,month},{headers:{'Cache-Control':'no-store'}})
 }catch(e){return failure(e)}}
export async function POST(req:NextRequest){try{
 sameOrigin(req)
 const body=await req.json();const {firmaId,scope,state}=body as {firmaId:string;scope:string;state:Workflow}
 const {prefix,month,sb}=await scopeContext(firmaId,scope)
 validate(state)
 const current=await readWorkflow(prefix)
 if(state.version!==current.version)throw new WorkflowError('Există o versiune mai nouă. Reîncarcă pagina înainte de salvare.',409)
 if(month)for(const t of TASKS){
 const updated=state.tasks[t.key];if(!updated)throw new WorkflowError('Lipsesc obligații din lună')
 if(updated.status!==current.tasks[t.key]?.status&&['semnat','trimis','acceptat','initiat','avizat','executat'].includes(updated.status)&&blockedBy(t.key,state).length)throw new WorkflowError('Finalizează întâi: '+blockedBy(t.key,state).join(', '))
 if(updated.status==='neaplicabil'&&!updated.note.trim())throw new WorkflowError('Adaugă motivul pentru „Nu se aplică”.')
 }
 const saved=await writeWorkflow(prefix,{...state,assets:current.assets},current.version)
 let warning=''
 if(month){
 const states=Object.entries(LEGACY_GROUPS).map(([key,keys])=>({luna_id:scope.slice(6),task_key:key,completat:keys.every(k=>['trimis','acceptat','neaplicabil'].includes(saved.tasks[k]?.status)),updated_at:new Date().toISOString()}))
 states.push({luna_id:scope.slice(6),task_key:'raport_lunar_proiect.actualizat',completat:['primit','semnat','trimis','acceptat'].includes(saved.tasks.raport.status),updated_at:new Date().toISOString()})
 const {error}=await sb.from('task_stari').upsert(states,{onConflict:'luna_id,task_key'})
 if(error)warning='Datele sunt salvate, dar indicatorul general de progres nu a putut fi actualizat.'
 }
 return NextResponse.json({state:saved,warning})
 }catch(e){return failure(e)}}
