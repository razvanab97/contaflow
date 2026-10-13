const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { randomUUID } = require('node:crypto')
const swc = require('next/dist/build/swc')
const { NextRequest } = require('next/server')
const { PDFDocument, StandardFonts } = require('pdf-lib')
const { extractText, getDocumentProxy } = require('unpdf')
const cache = new Map()
function compile(file, resolve = require) {
  const mod = {exports:{}}
  const code = swc.transformSync(fs.readFileSync(file,'utf8'),{filename:file,jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}}).code
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:file})(resolve,mod,mod.exports)
  return mod.exports
}
function local(file) {
  if(cache.has(file))return cache.get(file)
  const mod=compile(file,key=>key.startsWith('.')?local(path.resolve(path.dirname(file),key+'.ts')):require(key));cache.set(file,mod);return mod
}
const helpers=local(path.resolve(__dirname,'../lib/grant-credit.ts'))
const names=['ABUNEI ANDREI-RAZVAN','ABUNEI ELENA','NICORICI MIHAELA','VASILACHE FLORENTINA']
const nets=[2699,2574,2721,2699],taxes=[1719,1926,1696,1718]
const statText=`S.C. AB TEXTILE S.R.L.\nC.I.F.: 52575850\nPerioada: Septembrie 2026\n${names.map((name,i)=>`${name} 4325 176 4325 0 413 1031 0 865 ${taxes[i]-413-1031-[93,100,92,92][i]} ${nets[i]} 0 0 ${nets[i]}`).join('\n')}\nTOTAL: 17300 704 17300 0 1652 4124 0 3460 906 10693 0 0 10693\nTOTAL DE PLATA: 7.059`
const centralText=`SC AB TEXTILE SRL\nLuna SEPTEMBRIE 2026\n${names.map((name,i)=>`${name} 413 1031 ${taxes[i]-413-1031-[93,100,92,92][i]} ${[93,100,92,92][i]} ${taxes[i]}`).join('\n')}\nTotal: 1652 4124 906 377 0 0 7059\nSituatie recapitulativa a contributiilor datorate conform Stat de plata luna SEPTEMBRIE 2026`
async function pdf(text){const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),page=doc.addPage([900,1000]);page.drawText(text,{font,size:10,x:20,y:950,lineHeight:20});return Buffer.from(await doc.save())}
async function text(bytes){return (await extractText(await getDocumentProxy(new Uint8Array(bytes)),{mergePages:true})).text}
async function main(){
  let stat=helpers.parsePayroll(statText,'stat'),central=helpers.parsePayroll(centralText,'centralizator')
  let actual=helpers.reconcilePayroll(stat,central,'2026-09'),scheme=helpers.completeCreditScheme()
  let calculation=helpers.calculateGrantCredit(actual,scheme)
  assert.equal(calculation.toCreditCents,121600);assert.equal(calculation.netDifferenceCents,39700);assert.equal(calculation.contributionsDifferenceCents,81900)
  assert.equal(central.camCents,37700)
  assert.throws(()=>helpers.reconcilePayroll(stat,central,'2026-08'),/perioada/)
  assert.throws(()=>helpers.parsePayroll(statText.replace('52575850','12345678'),'stat'),/CUI/)
  assert.throws(()=>helpers.parsePayroll(centralText.replace('7059','7060'),'centralizator'),/reconciliază/)
  assert.throws(()=>helpers.parsePayroll(statText.replace('10693','10694'),'stat'),/totalului/)
  assert.throws(()=>helpers.parsePayroll(statText.replace(names[1],names[0]),'stat'),/duplicate/)
  assert.throws(()=>helpers.calculateGrantCredit(actual.slice(1),scheme),/persoanele/)
  assert.throws(()=>helpers.reconcilePayroll(stat,{...central,rows:central.rows.map((row,i)=>({...row,contributionsCents:row.contributionsCents+(i===0?100:i===1?-100:0)}))},'2026-09'),/nu se potrivesc/)
  assert.equal(helpers.calculateGrantCredit(actual,{...scheme,rows:scheme.rows.map(row=>({...row,netCents:1000000}))}).toCreditCents,0)
  assert.equal(helpers.calculateGrantCredit(actual,{...scheme,rows:scheme.rows.map(row=>({...row,netCents:1000000}))}).hasNegativeRows,true)
  assert.equal(helpers.moneyCents('2.574,00'),257400);assert.equal(helpers.moneyCents('2574.01'),257401)
  for(const value of ['-1','1e4','NaN','1,000.20'])assert.throws(()=>helpers.moneyCents(value))
  assert.equal(helpers.validCreditScheme({...scheme,rows:[scheme.rows[0],scheme.rows[0]]}),false)
  assert.equal(helpers.validCreditScheme({...scheme,rows:[{...scheme.rows[0],netCents:NaN}]}),false)
  assert.equal(helpers.parsePayroll(centralText.replace('Luna SEPTEMBRIE','Luna Ianuarie'),'centralizator').warnings.length,1)
  const paths=['S.C. AB TEXTILE S.R.L. Stat_de_plata_Chenzina_II_Septembrie_2026.pdf','CENTRALIZATOR CONTRIBUTII SEPTEMBRIE.pdf'].map(name=>path.join(process.env.HOME,'Downloads',name))
  const bytes=[await pdf(statText),await pdf(centralText)]
  if(paths.every(fs.existsSync)){
    bytes[0]=fs.readFileSync(paths[0]);bytes[1]=fs.readFileSync(paths[1])
    stat=helpers.parsePayroll(await text(bytes[0]),'stat');central=helpers.parsePayroll(await text(bytes[1]),'centralizator')
    actual=helpers.reconcilePayroll(stat,central,'2026-09');calculation=helpers.calculateGrantCredit(actual,scheme)
    assert.equal(calculation.toCreditCents,121600);assert.equal(stat.netCents,1069300);assert.equal(central.contributionsCents,705900)
    console.log('PASS actual September signed PDFs: net 10,693; contributions including CAM 7,059; credit 1,216.')
  }
  const assets=bytes.map((_,i)=>({id:randomUUID(),task:i?'centralizator':'stat',name:i?'Central.pdf':'Stat.pdf',type:'application/pdf',createdAt:'2026-10-13T10:00:00Z'}))
  let state={assets},prior={},missing=false,oversized=false
  const prefix='mock/workflow/month-test',files=new Map(assets.map((asset,i)=>[asset.id,bytes[i]])),reads=[]
  class WorkflowError extends Error{constructor(message,status=400){super(message);this.status=status}}
  const sb={
    storage:{from:()=>({download:async key=>{
      reads.push(key);assert.ok(key.startsWith(prefix+'/files/'))
      if(missing)return{error:{}}
      if(oversized)return{data:{size:5*1024*1024}}
      return{data:new Blob([files.get(key.split('/').pop())])}
    }})},
    from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'prior'}})})})})})
  }
  const store={WorkflowError,scopeContext:async()=>({sb,prefix,month:'2026-10'}),readWorkflow:async key=>key===prefix?state:prior}
  const accounting=local(path.resolve(__dirname,'../lib/accounting-period.ts'))
  const route=compile(path.resolve(__dirname,'../app/api/proiect-workflow/creditare/route.ts'),key=>key==='@/lib/proiect-workflow-store'?store:key==='@/lib/accounting-period'?accounting:key==='@/lib/grant-credit'?helpers:require(key))
  const request=scope=>new NextRequest(`http://localhost/api/proiect-workflow/creditare?firmaId=mock&scope=${scope||'month-test'}`)
  const before=JSON.stringify(state)
  let response=await route.GET(request());assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/private, no-store/)
  const analysis=await response.json();assert.equal(helpers.calculateGrantCredit(analysis.actual,analysis.scheme).toCreditCents,121600);assert.equal(JSON.stringify(state),before)
  prior={creditScheme:{...scheme,source:'Confirmed prior',rows:scheme.rows.map(row=>({...row,netCents:257500}))}}
  response=await route.GET(request());let data=await response.json();assert.match(data.scheme.source,/Bază confirmată/);assert.equal(helpers.calculateGrantCredit(data.actual,data.scheme).toCreditCents,121200)
  state={...state,creditScheme:scheme};response=await route.GET(request());data=await response.json();assert.equal(helpers.calculateGrantCredit(data.actual,data.scheme).toCreditCents,121600)
  response=await route.GET(request('purchase-test'));assert.equal(response.status,400)
  state={assets:[]};response=await route.GET(request());assert.equal(response.status,422)
  state={assets};missing=true;response=await route.GET(request());assert.equal(response.status,503);missing=false
  oversized=true;response=await route.GET(request());assert.equal(response.status,400);oversized=false
  const count=reads.length;state={assets:[{...assets[0],id:'../other'},assets[1]]};response=await route.GET(request());assert.equal(response.status,422);assert.equal(reads.length,count)
  state={assets:[...assets,{...assets[0],id:randomUUID(),type:'image/png'}]};response=await route.GET(request());assert.equal(response.status,422)
  const workflow=local(path.resolve(__dirname,'../lib/proiect-workflow.ts'))
  state={...workflow.initialMonth('2026-10',workflow.emptyWorkflow()),assets,version:19}
  let writes=0
  const postStore={...store,sameOrigin:()=>{},scopeContext:async()=>({prefix,month:'2026-10',sb:{from:()=>({upsert:async()=>({error:null})})}}),writeWorkflow:async(key,next,version)=>{assert.equal(key,prefix);assert.equal(version,19);writes++;return{...next,version:20}}}
  const forms=local(path.resolve(__dirname,'../lib/achizitii-form-recommendations.ts'))
  const postRoute=compile(path.resolve(__dirname,'../app/api/proiect-workflow/route.ts'),key=>key==='@/lib/proiect-workflow-store'?postStore:key==='@/lib/proiect-workflow'?workflow:key==='@/lib/achizitii-form-recommendations'?forms:key==='@/lib/grant-credit'?helpers:require(key))
  const post=next=>new NextRequest('http://localhost/api/proiect-workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firmaId:'mock',scope:'month-test',state:next})})
  response=await postRoute.POST(post({...state,creditScheme:{...scheme,confirmedAt:'2026-10-13T12:00:00Z'}}));assert.equal(response.status,200)
  data=await response.json();assert.equal(data.state.tasks.creditare.status,'lipsa');assert.deepEqual(data.state.assets,assets);assert.equal(writes,1)
  response=await postRoute.POST(post({...state,creditScheme:{...scheme,rows:[{name:'',netCents:-1,contributionsCents:0}]}}));assert.equal(response.status,400);assert.equal(writes,1)
  response=await postRoute.POST(post({...state,version:18,creditScheme:scheme}));assert.equal(response.status,409);assert.equal(writes,1)
  console.log('PASS full-scheme arithmetic, no double CAM, totals/company/period/person validation, prior/current scheme, newest revision, read-only scoped PDF endpoint, storage and input failures.')
}
main().catch(error=>{console.error(error);process.exitCode=1})
