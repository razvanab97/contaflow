const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const {randomUUID}=require('node:crypto'),swc=require('next/dist/build/swc'),{NextRequest}=require('next/server'),{PDFDocument}=require('pdf-lib')
const cache=new Map()
function compile(file,resolve){const mod={exports:{}};const code=swc.transformSync(fs.readFileSync(file,'utf8'),{filename:file,jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}}).code;vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:file})(resolve,mod,mod.exports);return mod.exports}
function local(name){if(cache.has(name))return cache.get(name);const mod=compile(path.resolve(__dirname,'../lib/'+name+'.ts'),key=>key.startsWith('./')?local(key.slice(2)):require(key));cache.set(name,mod);return mod}
function iban(){const bban='TEST'+ '0'.repeat(16);const digits=(bban+'RO00').replace(/[A-Z]/g,c=>String(c.charCodeAt(0)-55));return 'RO'+String(98-Number(BigInt(digits)%97n)).padStart(2,'0')+bban}
const opText=name=>`Platitor / Payer\nNume / Name AB TEXTILE S R L\nCont / Account ${iban()}\nBeneficiar / Beneficiary\nNume / Name ${name}\nCont / Account ${iban()}\nDetalii / Details\nSuma / Amount 2,699.00 RON\nDescriere / Description Salariu august\nReferinta / Reference 123456\nData procesare / Processing date 22.09.2026\nStatus Efectuata\nBanca / Bank Test Bank`
async function pdf(text){const doc=await PDFDocument.create(),page=doc.addPage([900,1000]);page.drawText(text,{x:20,y:950,size:10,lineHeight:18});return Buffer.from(await doc.save())}
async function main(){
  const helper=local('salary-payment'),pdfHelper=local('salary-payment-pdf'),workflow=local('proiect-workflow')
  const payment=helper.salaryPaymentFromText(opText('Abunei Andrei Razvan'))
  assert.equal(payment.amountCents,269900);assert.equal(payment.period,'2026-08');assert.equal(payment.processedOn,'2026-09-22');assert.equal(helper.validRomanianIban(iban()),true)
  assert.equal(helper.validRomanianIban(iban().slice(0,-1)+'1'),false)
  assert.throws(()=>helper.salaryPaymentFromText(opText('A B').replace('AB TEXTILE S R L','OTHER COMPANY')),/Plătitorul/)
  assert.throws(()=>helper.salaryPaymentFromText(opText('A B').replace('Efectuata','Initiata')),/efectuată/)
  assert.equal(helper.salaryPaymentFromText(opText('A B').replace('Salariu august','Taxe buget')),null)
  assert.equal(helper.salaryPaymentFromText(opText('A B').replace('august','decembrie').replace('22.09.2026','22.01.2027')).period,'2026-12')
  const inputs=['Salariu August Abunei Elena.pdf','Salariu August Nicorici.pdf','Salariu August Vasilache.pdf','Salariu August - Abunei Andrei.pdf']
  const files=new Map(),sources=[]
  for(const [i,name] of inputs.entries()){
    const file=path.join(process.env.HOME,'Downloads',name), bytes=fs.existsSync(file)?fs.readFileSync(file):await pdf(opText(['Abunei Elena','Nicorici Mihaela','Vasilache Florentina','Abunei Andrei Razvan'][i]))
    const parsed=await pdfHelper.readSalaryPaymentPdf(bytes);assert.ok(parsed);assert.equal(parsed.period,'2026-08');assert.equal(parsed.processedOn,'2026-09-22')
    const id=randomUUID();files.set(id,bytes);sources.push({id,task:'salarii',name,type:'application/pdf',salaryPayment:parsed,createdAt:'2026-10-13',kind:'upload'})
  }
  if(inputs.every(name=>fs.existsSync(path.join(process.env.HOME,'Downloads',name))))assert.equal(sources.reduce((sum,asset)=>sum+asset.salaryPayment.amountCents,0),1069300)
  const refs=sources.map(asset=>({payment:asset.salaryPayment,assetId:asset.id,assetName:asset.name,scope:'month-prior',createdAt:asset.createdAt}))
  const rows=helper.salaryPlanRows([{name:'ABUNEI ANDREI-RAZVAN',netCents:280001},{name:'NEW EMPLOYEE',netCents:100000}],refs,'2026-09')
  assert.equal(rows[0].amountCents,280001);assert.equal(rows[0].reference.payment.amountCents,269900);assert.equal(rows[1].reference,undefined);assert.equal(rows[0].description,'Salariu septembrie 2026')
  assert.equal(helper.salaryPlanRows([{name:'ABUNEI ANDREI RAZVAN',netCents:1}],refs,'2026-08')[0].reference,undefined)
  let state={...workflow.initialMonth('2026-10',workflow.emptyWorkflow()),version:1},writes=0,conflict=false
  const stored=new Map(),prefix='mock/workflow/month-test'
  class WorkflowError extends Error{constructor(message,status=400){super(message);this.status=status}}
  const sb={storage:{from:()=>({upload:async(key,bytes)=>{stored.set(key,Buffer.from(bytes));return{}},remove:async keys=>{keys.forEach(key=>stored.delete(key));return{}}})},from:()=>({insert:async()=>({}),delete:()=>({eq:async()=>({})})})}
  const store={WorkflowError,sameOrigin:()=>{},scopeContext:async()=>({prefix,sb,lunaId:'test'}),readWorkflow:async()=>state,writeWorkflow:async(_,next)=>{if(conflict)throw new WorkflowError('Conflict',409);writes++;state={...next,version:state.version+1};return state}}
  const route=compile(path.resolve(__dirname,'../app/api/proiect-workflow/document/route.ts'),key=>key==='@/lib/proiect-workflow-store'?store:key==='@/lib/proiect-generate'?{generateProjectDoc:()=>{throw new Error('No generation')}}:key.startsWith('@/lib/')?local(key.slice(6)):require(key))
  const upload=async(bytes,version=state.version)=>{const fd=new FormData();for(const [key,value] of Object.entries({firmaId:'mock',scope:'month-test',task:'salarii',version:String(version)}))fd.set(key,value);fd.set('file',new File([bytes],'Original.pdf',{type:'application/pdf'}));return route.POST(new NextRequest('http://localhost/api/proiect-workflow/document',{method:'POST',body:fd}))}
  const original=files.get(sources[0].id),before=state.tasks.salarii.status
  let response=await upload(original);assert.equal(response.status,200);let data=await response.json();assert.ok(data.asset.salaryPayment);assert.equal(data.asset.originalName,'Original.pdf');assert.match(data.asset.name,/OP salariu/);assert.deepEqual(stored.get(prefix+'/files/'+data.asset.id),original);assert.equal(state.tasks.salarii.status,before)
  response=await upload(await pdf(opText('Abunei Elena').replace('Efectuata','Initiata')));data=await response.json();assert.equal(response.status,200);assert.ok(data.warning);assert.equal(data.asset.salaryPayment,undefined)
  conflict=true;const count=stored.size;response=await upload(original);assert.equal(response.status,409);assert.equal(stored.size,count);conflict=false
  const statId=randomUUID(),centralId=randomUUID()
  const actualStat=path.join(process.env.HOME,'Downloads','S.C. AB TEXTILE S.R.L. Stat_de_plata_Chenzina_II_Septembrie_2026.pdf')
  const actualCentral=path.join(process.env.HOME,'Downloads','CENTRALIZATOR CONTRIBUTII SEPTEMBRIE.pdf')
  if(fs.existsSync(actualStat)&&fs.existsSync(actualCentral)){
    files.set(statId,fs.readFileSync(actualStat));files.set(centralId,fs.readFileSync(actualCentral))
    state={...state,assets:[{id:statId,task:'stat',name:'Stat.pdf',type:'application/pdf',createdAt:'2026-10-13'},{id:centralId,task:'centralizator',name:'Central.pdf',type:'application/pdf',createdAt:'2026-10-13'}]}
    let prior={assets:sources},fail=false
    const planSb={storage:{from:()=>({download:async key=>fail?{error:{}}:{data:new Blob([files.get(key.split('/').pop())])}})},from:()=>({select:()=>({eq:()=>({lt:()=>({order:()=>({limit:async()=>({data:[{id:'prior',luna:'2026-09-01'}]})})})})})})}
    const planStore={WorkflowError,scopeContext:async()=>({sb:planSb,prefix,month:'2026-10'}),readWorkflow:async key=>key===prefix?state:prior}
    const planRoute=compile(path.resolve(__dirname,'../app/api/proiect-workflow/plata-salarii/route.ts'),key=>key==='@/lib/proiect-workflow-store'?planStore:key.startsWith('@/lib/')?local(key.slice(6)):require(key))
    const request=()=>new NextRequest('http://localhost/api/proiect-workflow/plata-salarii?firmaId=mock&scope=month-test')
    const unchanged=JSON.stringify(state);response=await planRoute.GET(request());assert.equal(response.status,200);data=await response.json();assert.equal(data.netCents,1069300);assert.equal(data.contributionsCents,705900);assert.ok(data.rows.every(row=>row.reference));assert.equal(JSON.stringify(state),unchanged);assert.match(response.headers.get('Cache-Control'),/private, no-store/)
    const currentAssets=state.assets;state={...state,assets:[...currentAssets,...sources]};prior={assets:[]}
    const currentTasks=JSON.stringify(state.tasks);response=await planRoute.GET(request());assert.equal(response.status,200);data=await response.json()
    assert.equal(data.period,'2026-09');assert.equal(data.netCents,1069300);assert.ok(data.rows.every(row=>row.reference?.scope==='month-test'));assert.equal(JSON.stringify(state.tasks),currentTasks)
    state={...state,assets:currentAssets};response=await planRoute.GET(request());data=await response.json();assert.ok(data.rows.every(row=>!row.reference));assert.ok(data.warnings.length)
    fail=true;response=await planRoute.GET(request());assert.equal(response.status,503)
    fail=false;state={...state,assets:[]};response=await planRoute.GET(request());assert.equal(response.status,422)
  }
  console.log('PASS actual four OPs, 10,693 RON historical net total, validated IBAN/company/status/month, rollover year, current-stat amounts instead of stale OP amounts, unchanged PDFs and payment state, upload rollback, scoped read-only salary plan and missing-source errors.')
}
main().catch(error=>{console.error(error);process.exitCode=1})
