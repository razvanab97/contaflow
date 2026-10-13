const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const swc = require('next/dist/build/swc')
const { NextRequest } = require('next/server')
const { PDFDocument } = require('pdf-lib')
const cache = new Map()
function local(name) {
  const filename = path.resolve(__dirname, '../lib', name + '.ts')
  if (cache.has(filename)) return cache.get(filename).exports
  const module = { exports: {} }; cache.set(filename, module)
  const code = swc.transformSync(fs.readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'commonjs' } }).code
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(key => key.endsWith('proiect-templates.json') ? require('../lib/proiect-templates.json') : key.startsWith('@/lib/') ? local(key.slice(6)) : key.startsWith('./') ? local(key.slice(2)) : require(key), module, module.exports)
  return module.exports
}
async function fixture(type, subject, cui = '52575850') {
  const pdf = await PDFDocument.create(), page = pdf.addPage()
  const titles = {salariat:'Extras salariat din Registrul General de Evidenta a Salariatilor',contract:'Extras contract din Registrul General de Evidenta a Salariatilor',salariati_angajator:'Extras salariati angajator din Registrul General de Evidenta a Salariatilor',contracte_angajator:'Extras contracte angajator din Registrul General de Evidenta a Salariatilor'}
  page.drawText(`${titles[type]}\nGenerat azi 21.07.2026 13:23\nSalariat: ${subject}\n31 ian. 1972 identificat prin CNP 1234567890123\nAngajator: AB TEXTILE S.R.L. identificat prin CUI/CIF ${cui}`, {x:20,y:780,size:10,lineHeight:16})
  return Buffer.from(await pdf.save())
}
async function main() {
  const { regesReportFromText, regesFilename } = local('reges-reports')
  const { readRegesPdf } = local('reges-pdf')
  assert.equal(regesReportFromText('Factura Salariat: ABUNEI ELENA'), null)
  assert.equal(regesReportFromText('Extras salariat din Registrul\nSalariat: CNP 1234567890123'), null)
  assert.equal(regesReportFromText('Extras salariat din Registrul\nSalariat: ABUNEI ELENA\nGenerat azi 31.02.2026')?.issuedOn, undefined)
  assert.doesNotMatch(regesFilename({type:'salariat',subject:'ABUNEI / ELENA'}), /\//)
  let state = {...local('proiect-workflow').emptyWorkflow(),version:1,tasks:{reges:{status:'lipsa',due:'2026-10-08',note:''}}}
  const files = new Map(), rows = new Map(), prefix = 'mock/workflow/month-test'
  let failWrite = false
  class WorkflowError extends Error {constructor(message,status=400){super(message);this.status=status}}
  const bucket = {upload:async(key,bytes)=>{files.set(key,Buffer.from(bytes));return {}},download:async key=>({data:new Blob([files.get(key)])}),remove:async keys=>{keys.forEach(key=>files.delete(key));return {}}}
  const sb = {storage:{from:()=>bucket},from:()=>({insert:async row=>{rows.set(row.id,row);return {}},delete:()=>({eq:async(_,id)=>{rows.delete(id);return {}}})})}
  const store = {WorkflowError,sameOrigin:()=>{},scopeContext:async()=>({prefix,sb,lunaId:'mock-month'}),readWorkflow:async()=>state,writeWorkflow:async(_,next,version)=>{if(failWrite)throw new WorkflowError('mock conflict',409);assert.equal(version,state.version);state={...next,version:version+1};return state}}
  const filename=path.resolve(__dirname,'../app/api/proiect-workflow/document/route.ts'),module={exports:{}}
  const code=swc.transformSync(fs.readFileSync(filename,'utf8'),{filename,jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}}).code
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename})(key=>key==='@/lib/proiect-workflow-store'?store:key.startsWith('@/lib/')?local(key.slice(6)):require(key),module,module.exports)
  const upload = (bytes, name, version = state.version) => {
    const fd=new FormData();fd.set('firmaId','mock');fd.set('scope','month-test');fd.set('version',String(version));fd.set('task','reges');fd.set('file',new File([bytes],name,{type:'application/pdf'}))
    return module.exports.POST(new NextRequest('http://localhost/api/proiect-workflow/document',{method:'POST',body:fd}))
  }
  const names = {salariat:'RaportSalariat_#5c6cf375-54cf-4ebe-8b7d-1a405b8cd568.pdf',contract:'RaportSalariatContract_#005e1e1b-af85-4301-9e0a-b0b3d166ac53.pdf',salariati_angajator:'RaportSalariatiAngajator_#6dd5f37c-0da2-49b1-8ded-541d3e1c3a9e.pdf',contracte_angajator:'RaportAngajator_#3a57cbd9-56b6-4b83-996a-32753aa4754d.pdf'}
  for (const [type,name] of Object.entries(names)) {
    const filename=path.join(os.homedir(),'Downloads',name)
    const bytes=fs.existsSync(filename)?fs.readFileSync(filename):await fixture(type,'ABUNEI ELENA')
    const report=await readRegesPdf(bytes)
    assert.equal(report.type,type);assert.equal(report.issuedOn,'2026-07-21');assert.equal(report.employerCui,'52575850')
    const response=await upload(bytes,name);assert.equal(response.status,200)
    const data=await response.json();assert.equal(data.asset.name,regesFilename(report));assert.equal(data.asset.originalName,name)
    assert.equal(rows.get(data.asset.id).fisier_nume,data.asset.name)
    assert.deepEqual(files.get(`${prefix}/files/${data.asset.id}`),bytes)
    assert.equal(data.state.tasks.reges.status,'lipsa')
    const download=await module.exports.GET(new NextRequest(`http://localhost/api/proiect-workflow/document?firmaId=mock&scope=month-test&id=${data.asset.id}`))
    assert.match(download.headers.get('Content-Disposition'),new RegExp(encodeURIComponent(data.asset.name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))
    assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes)
  }
  const blank=await PDFDocument.create();blank.addPage();const blankBytes=await blank.save()
  let response=await upload(blankBytes,'scanat.pdf');let data=await response.json()
  assert.equal(response.status,200);assert.equal(data.asset.name,'scanat.pdf');assert.ok(data.warning);assert.equal(data.asset.reges,undefined)
  response=await upload(await fixture('salariat','ABUNEI ELENA','99999999'),'alta-firma.pdf');data=await response.json()
  assert.equal(data.asset.name,'alta-firma.pdf');assert.ok(data.warning);assert.equal(data.asset.reges,undefined)
  const count=state.assets.length
  response=await upload(blankBytes,'conflict.pdf',0);assert.equal(response.status,409);assert.equal(state.assets.length,count)
  failWrite=true;response=await upload(blankBytes,'rollback.pdf');assert.equal(response.status,409);assert.equal(files.size,count);assert.equal(rows.size,count)
  console.log('PASS: four REGES report types (local originals when available), naming without CNP, dates/CUI, unchanged signed PDF bytes, matching download/DB names, unreadable/wrong-company fallback, conflict rollback, unchanged task status.')
}
main().catch(error=>{console.error(error);process.exitCode=1})
