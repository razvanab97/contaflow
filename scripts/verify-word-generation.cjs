const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { spawnSync } = require('node:child_process')
const swc = require('next/dist/build/swc')
const JSZip = require('jszip')
const { NextRequest } = require('next/server')
const cache = new Map()
function local(name) {
  const filename = path.resolve(__dirname, '../lib', name + '.ts')
  if (cache.has(filename)) return cache.get(filename).exports
  const module = { exports: {} }; cache.set(filename, module)
  const code = swc.transformSync(fs.readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type:'commonjs' } }).code
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(key => key.endsWith('proiect-templates.json') ? require('../lib/proiect-templates.json') : key.startsWith('@/lib/') ? local(key.slice(6)) : key.startsWith('./') ? local(key.slice(2)) : require(key), module, module.exports)
  return module.exports
}
async function main() {
  const { emptyWorkflow, emptyLine, validateDraft } = local('proiect-workflow')
  const draft = { fields:{numar:'1',data:'12.10.2026',achizitie:'Aer condiționat',tip:'Produse',justificare:'Am ales oferta cu cel mai mic preț fără TVA.'}, lines:['A','B','C'].map((supplier,index)=>({...emptyLine(),supplier,website:`https://furnizor-${supplier.toLowerCase()}.ro/`,product:'Aer condiționat',specs:'Alimentare electrică\nCapacitate minimum 12000 BTU\nRăcire și încălzire',price:String(1000+index*100),priceMode:'net',source:`Oferta ${index+1}.pdf`,date:''})) }
  let state = {...emptyWorkflow(),version:1,forms:{nota:draft}}
  assert.deepEqual(validateDraft('nota',draft,state.profile),[])
  assert.ok(validateDraft('nota',{...draft,fields:{...draft.fields,data:''}},state.profile).includes('Data documentului'))
  assert.ok(validateDraft('nota',{...draft,lines:[{...draft.lines[0],source:''}]},state.profile).some(value=>value.includes('sursă')))
  const files = new Map(), rows = new Map()
  let failUpload=false,failInsert=false,failWrite=false
  const prefix='mock/workflow/purchase-test'
  class WorkflowError extends Error { constructor(message,status=400){super(message);this.status=status} }
  const bucket = {
    upload: async (key,bytes)=>{if(failUpload)return {error:{message:'mock upload error'}};assert.ok(!files.has(key));files.set(key,Buffer.from(bytes));return {}},
    download: async key=>files.has(key)?{data:new Blob([files.get(key)])}:{error:{message:'missing'}},
    remove: async keys=>{keys.forEach(key=>files.delete(key));return {}},
  }
  const sb = {storage:{from:()=>bucket},from:()=>({insert:async row=>{if(failInsert)return {error:{message:'mock db error'}};rows.set(row.id,row);return {}},delete:()=>({eq:async (_,id)=>{rows.delete(id);return {}}})})}
  const store = {WorkflowError,sameOrigin:()=>{},scopeContext:async()=>({prefix,sb,lunaId:null}),readWorkflow:async()=>state,writeWorkflow:async (_,next,version)=>{if(failWrite)throw new WorkflowError('mock version conflict',409);assert.equal(version,state.version);state={...next,version:version+1};return state}}
  const filename=path.resolve(__dirname,'../app/api/proiect-workflow/document/route.ts'),module={exports:{}}
  const code=swc.transformSync(fs.readFileSync(filename,'utf8'),{filename,jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}}).code
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename})(key=>key==='@/lib/proiect-workflow-store'?store:key.startsWith('@/lib/')?local(key.slice(6)):require(key),module,module.exports)
  const request=(version=state.version)=>new NextRequest('http://localhost/api/proiect-workflow/document',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firmaId:'mock',scope:'purchase-test',version,kind:'nota'})})
  let response=await module.exports.POST(request());assert.equal(response.status,200)
  const {asset}=await response.json();assert.match(asset.name,/\.docx$/);assert.equal(state.assets.length,1);assert.equal(rows.size,1);assert.equal(files.size,1)
  response=await module.exports.GET(new NextRequest(`http://localhost/api/proiect-workflow/document?firmaId=mock&scope=purchase-test&id=${asset.id}`))
  assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/wordprocessingml/);assert.match(response.headers.get('Content-Disposition'),/attachment; filename\*=UTF-8/)
  const bytes=Buffer.from(await response.arrayBuffer());assert.deepEqual(bytes,files.get(`${prefix}/files/${asset.id}`))
  const zip=await JSZip.loadAsync(bytes),xml=await zip.file('word/document.xml').async('string')
  assert.ok(zip.file('[Content_Types].xml'));assert.match(xml,/Aer condiționat/);assert.match(xml,/furnizor-a.ro/);assert.match(xml,/1[.\s\u00a0]000,00/);assert.doesNotMatch(xml,/%%\w+%%/)
  const check=spawnSync('xmllint',['--noout','-'],{input:xml,encoding:'utf8'});assert.equal(check.status,0,check.stderr||String(check.error))
  response=await module.exports.POST(request(0));assert.equal(response.status,409)
  for(const flag of ['upload','insert','write']) {
    failUpload=flag==='upload';failInsert=flag==='insert';failWrite=flag==='write'
    response=await module.exports.POST(request());assert.equal(response.status,flag==='write'?409:503);assert.equal(files.size,1);assert.equal(rows.size,1);assert.equal(state.assets.length,1)
  }
  failUpload=failInsert=failWrite=false
  state={...state,forms:{nota:{...draft,fields:{...draft.fields,data:''}}}}
  response=await module.exports.POST(request());assert.equal(response.status,400);assert.equal(files.size,1)
  console.log('OK: Anexa 1 cu date ofertă goale, POST → DOCX valid → salvare → GET identic; data notei obligatorie, conflict și rollback fără fișiere orfane.')
}
main().catch(error=>{console.error(error);process.exitCode=1})
