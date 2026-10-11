const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const swc = require('next/dist/build/swc')
const { NextRequest } = require('next/server')
const cache = new Map()
function local(name) {
  const filename = path.resolve(__dirname, '../lib', name + '.ts')
  if (cache.has(filename)) return cache.get(filename).exports
  const module = {exports:{}}; cache.set(filename,module)
  const code = swc.transformSync(fs.readFileSync(filename,'utf8'),{filename,jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}}).code
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename})(key=>key.startsWith('./')?local(key.slice(2)):require(key),module,module.exports)
  return module.exports
}
async function main() {
  const {parseOfferProposals,appendOfferProposal,offerSelectionText,lowestNoteOffer,offerWebsite}=local('achizitii-offer-prefill')
  const {emptyLine}=local('proiect-workflow')
  const doc={id:'a',fisier_nume:'Oferta 1.pdf',furnizor:'Furnizor confirmat',suma:1210,valuta:'RON'}
  const row={supplier:'AI supplier',product:'Aer condiționat model A',specs:'12000 BTU',unit:'buc',qty:'1',price:'1210',priceMode:'gross',currency:'RON',date:'12.10.2026',page:2}
  const raw=JSON.stringify({offers:[{id:'a',lines:[row],warnings:[]}]})
  const proposal=parseOfferProposals(raw,[doc],'https://contaflow.xyz')[0]
  assert.equal(proposal.lines[0].supplier,'Furnizor confirmat')
  assert.match(proposal.lines[0].source,/Oferta 1.pdf · pagina 2.*id=a/)
  assert.equal(proposal.lines[0].rate,'1'); assert.equal(proposal.savedTotal,1210)
  assert.match(offerSelectionText(proposal),/1[.\s\u00a0]000,00 RON fără TVA/)
  const original={fields:{numar:'1',data:'12.10.2026',justificare:'Motiv scris de utilizator'},lines:[emptyLine()]}
  const applied=appendOfferProposal(original,proposal)
  assert.equal(applied.lines.length,1); assert.deepEqual(applied.fields,original.fields)
  assert.equal(original.lines[0].price,''); assert.equal(appendOfferProposal(applied,proposal).lines.length,1)
  const manual={...original,lines:[{...emptyLine(),product:'Produs scris manual',specs:'Specificații manuale'}]}
  assert.deepEqual(appendOfferProposal(manual,proposal).lines[0],manual.lines[0])
  const partial={...original,lines:[{...emptyLine(),qty:'2'}]}
  assert.equal(appendOfferProposal(partial,proposal).lines[0].qty,'2')
  const unknown=parseOfferProposals(JSON.stringify({offers:[{id:'a',lines:[{...row,priceMode:null,date:null,qty:null,currency:'EUR'}]}]}),[doc],'https://contaflow.xyz')[0]
  assert.equal(unknown.lines[0].price,''); assert.equal(unknown.lines[0].qty,''); assert.equal(unknown.lines[0].date,''); assert.equal(unknown.lines[0].rate,''); assert.ok(unknown.warnings.length)
  const alternative={...proposal,lines:[proposal.lines[0],{...proposal.lines[0],product:'Alt produs'}]}
  assert.match(offerSelectionText(alternative),/valoarea fără TVA de verificat/)
  const mismatch=parseOfferProposals(raw,[{...doc,suma:1500}],'https://contaflow.xyz')[0]
  assert.ok(mismatch.warnings.some(w=>w.includes('diferă')))
  assert.throws(()=>parseOfferProposals(raw,[{...doc,id:'other'}],'https://contaflow.xyz'))
  assert.throws(()=>appendOfferProposal({...original,lines:Array.from({length:20},(_,i)=>({...emptyLine(),product:String(i)}))},proposal))
  const formattedRaw=JSON.stringify({commonSpecs:['Alimentare electrică','Capacitate minimă 12000 BTU','Funcție de răcire și încălzire'],offers:[{id:'a',lines:[{...row,website:'altex.ro'}],warnings:[]}]})
  const formatted=parseOfferProposals(formattedRaw,[doc],'https://contaflow.xyz',{product:'Aer condiționat',quantity:'1'})[0]
  const formattedLine=formatted.lines[0]
  assert.equal(formattedLine.product,'Aer condiționat');assert.equal(formattedLine.qty,'1');assert.equal(formattedLine.website,'https://altex.ro/')
  assert.equal(formattedLine.specs.split('\n').length,3);assert.equal(formattedLine.price,'1000.00');assert.equal(formattedLine.priceMode,'net')
  assert.equal(offerWebsite('javascript:alert(1)'),'');assert.equal(offerWebsite('https://user:password@example.com'),'')
  const comparison={fields:{},lines:['A','B','C'].map((supplier,index)=>({...formattedLine,supplier,price:String(1000+index*100)}))}
  const winner=lowestNoteOffer(comparison);assert.equal(winner.index,0);assert.equal(winner.amount,1000);assert.match(winner.text,/prețul cel mai mic fără TVA/)
  assert.equal(lowestNoteOffer({...comparison,lines:comparison.lines.slice(0,2)}),null)
  assert.equal(lowestNoteOffer({...comparison,lines:comparison.lines.map(line=>({...line,price:'1000'}))}),null)
  assert.equal(lowestNoteOffer({...comparison,lines:comparison.lines.map((line,index)=>index===1?{...line,currency:'EUR'}:line)}),null)
  assert.equal(lowestNoteOffer({...comparison,lines:comparison.lines.map((line,index)=>index===1?{...line,specs:'Alte specificații'}:line)}),null)

  const filename=path.resolve(__dirname,'../app/api/achizitii/oferte/precompletare/route.ts')
  const id='11111111-1111-1111-1111-111111111111'
  let docs=[{...doc,id,fisier_tip:'application/pdf',fisier_path:'original.pdf'},{...doc,id:'request',fisier_nume:'Cerere de oferta.pdf'}]
  let calls=0
  const filters=[]
  const query={eq:(key,value)=>{filters.push([key,value]);return query},order:async()=>({data:docs})}
  const purchaseQuery={eq:()=>purchaseQuery,single:async()=>({data:{denumire:'Aer condiționat',nota:'Minimum 12000 BTU'}})}
  const sb={from:table=>({select:()=>table==='proiect_achizitii'?purchaseQuery:query}),storage:{from:()=>({download:async name=>{assert.equal(name,'original.pdf');return {data:new Blob(['%PDF-original'])}}})}}
  class WorkflowError extends Error{constructor(message,status=400){super(message);this.status=status}}
  class Anthropic{constructor(){this.messages={create:async request=>{calls++;assert.equal(request.messages[0].content.filter(item=>item.type==='document').length,1);return {content:[{type:'text',text:JSON.stringify({offers:[{id,lines:[row],warnings:[]}]})}]}}}}}
  const module={exports:{}}
  const code=swc.transformSync(fs.readFileSync(filename,'utf8'),{filename,jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}}).code
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename})(key=>key==='@anthropic-ai/sdk'?Anthropic:key==='@/lib/proiect-workflow-store'?{WorkflowError,sameOrigin:()=>{},scopeContext:async()=>({sb})}:key.startsWith('@/lib/')?local(key.slice(6)):require(key),module,module.exports)
  const request=()=>new NextRequest('https://contaflow.xyz/api/achizitii/oferte/precompletare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firmaId:id,scope:`purchase-${id}`})})
  const savedKey=process.env.ANTHROPIC_API_KEY;process.env.ANTHROPIC_API_KEY='mock-only'
  try{
    let response=await module.exports.POST(request());assert.equal(response.status,200)
    assert.equal((await response.json()).offers.length,1);assert.ok(filters.some(([key,value])=>key==='firma_id'&&value===id));assert.ok(filters.some(([key,value])=>key==='achizitie_id'&&value===id))
    docs=[];response=await module.exports.POST(request());assert.equal(response.status,400);assert.equal(calls,1)
    docs=Array.from({length:4},()=>({...doc,id,fisier_tip:'application/pdf'}));response=await module.exports.POST(request());assert.equal(response.status,400);assert.equal(calls,1)
  }finally{if(savedKey===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=savedKey}
  console.log('OK: PDF-uri limitate la dosar, surse, preț/TVA, date lipsă, curs extern, variante, discrepanțe, preluare fără suprascriere și duplicate.')
}
main().catch(error=>{console.error(error);process.exitCode=1})
