const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { randomUUID } = require('node:crypto')
const swc = require('next/dist/build/swc')
const JSZip = require('jszip')
const { NextRequest } = require('next/server')

function compile(filename, resolve) {
  const module = { exports: {} }
  const code = swc.transformSync(fs.readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'commonjs' } }).code
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(resolve, module, module.exports)
  return module.exports
}
async function main() {
  const helper = compile(path.resolve(__dirname, '../lib/salary-package.ts'), require)
  const used = new Set()
  assert.equal(helper.salaryZipEntry('01_Stat_plata','../../document.pdf',used),'01_Stat_plata/document.pdf')
  assert.equal(helper.salaryZipEntry('01_Stat_plata','DOCUMENT.pdf',used),'01_Stat_plata/DOCUMENT (2).pdf')
  assert.equal(helper.salaryZipEntry('01_Stat_plata','document (2).pdf',used),'01_Stat_plata/document (2) (2).pdf')
  assert.doesNotMatch(helper.salaryZipEntry('03_REGES','..\\../bad\0.pdf',used), /\.\.\/|\0|\\/)
  const files = new Map()
  const make = (task,name,content) => { const id=randomUUID();files.set(id,Buffer.from(content));return {id,task,name,type:'application/pdf',createdAt:'2026-10-13',kind:'upload'} }
  const assets = [make('stat','Stat.pdf','stat original'),make('stat','Stat.pdf','stat revised original'),make('pontaj','Pontaj.pdf','pontaj original'),make('reges','Extras REGES salariat - ABUNEI ELENA.pdf','signed PDF bytes'),make('centralizator','Centralizator.pdf','centralizator original'),make('raport','Raport.docx','unrelated')]
  let state={assets,version:9,tasks:{reges:{status:'lipsa'}}}, fail=false, large=false, called=0
  const prefix='mock/workflow/month-test', reads=[]
  class WorkflowError extends Error {constructor(message,status=400){super(message);this.status=status}}
  const sb={storage:{from:()=>({download:async key=>{
    reads.push(key);assert.ok(key.startsWith(prefix+'/files/'))
    const id=key.split('/').pop()
    if(fail)return {error:{message:'mock missing'}}
    if(large)return {data:{size:65*1024*1024,arrayBuffer:()=>{throw new Error('Should reject before reading bytes')}}}
    return {data:new Blob([files.get(id)])}
  }})}}
  const store={WorkflowError,scopeContext:async(firmaId,scope)=>{called++;assert.equal(firmaId,'mock');assert.equal(scope,'month-test');return {prefix,sb,month:'2026-10'}},readWorkflow:async()=>state}
  const route=compile(path.resolve(__dirname,'../app/api/proiect-workflow/salarizare/route.ts'),key=>key==='@/lib/proiect-workflow-store'?store:key==='@/lib/salary-package'?helper:require(key))
  const request=scope=>new NextRequest(`http://localhost/api/proiect-workflow/salarizare?firmaId=mock&scope=${scope||'month-test'}`)
  const before=JSON.stringify(state)
  let response=await route.GET(request());assert.equal(response.status,200)
  assert.equal(response.headers.get('Content-Type'),'application/zip');assert.match(response.headers.get('Cache-Control'),/private, no-store/)
  assert.match(response.headers.get('Content-Disposition'),/2026-10\.zip/)
  const zip=await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()))
  const names=Object.keys(zip.files).filter(key=>!zip.files[key].dir)
  assert.deepEqual(names,['01_Stat_plata/Stat.pdf','01_Stat_plata/Stat (2).pdf','02_Pontaj/Pontaj.pdf','03_REGES/Extras REGES salariat - ABUNEI ELENA.pdf','04_Centralizator/Centralizator.pdf','Citeste-ma.txt'])
  for(const [index,name] of names.slice(0,5).entries())assert.deepEqual(await zip.file(name).async('nodebuffer'),files.get(assets[index].id))
  assert.equal(reads.length,5);assert.equal(JSON.stringify(state),before)
  state={...state,assets:[assets[3]]};response=await route.GET(request());assert.equal(response.status,200)
  const partial=await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));assert.match(await partial.file('Citeste-ma.txt').async('string'),/Stat de plată: 0 fișiere - LIPSESC DOCUMENTE/)
  state={...state,assets:[]};response=await route.GET(request());assert.equal(response.status,404)
  const calls=called;response=await route.GET(request('purchase-test'));assert.equal(response.status,400);assert.equal(called,calls)
  response=await route.GET(request('settings'));assert.equal(response.status,400);assert.equal(called,calls)
  state={...state,assets:[assets[0]]};fail=true;response=await route.GET(request());assert.equal(response.status,503);assert.match((await response.json()).error,/nu a fost generată incomplet/)
  fail=false;large=true;response=await route.GET(request());assert.equal(response.status,413)
  large=false;state={...state,assets:[{...assets[0],id:'../another-month'}]};const readCount=reads.length;response=await route.GET(request());assert.equal(response.status,400);assert.equal(reads.length,readCount)
  console.log('PASS: four salary folders, all versions without filename overwrite, unchanged document bytes, exclusion of unrelated tasks, month-scoped storage, partial-category notice, empty/missing/oversized/invalid-ID failures, read-only state.')
}
main().catch(error=>{console.error(error);process.exitCode=1})
