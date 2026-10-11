const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const swc = require('next/dist/build/swc')
const { NextRequest } = require('next/server')

async function main() {
  const { offerPrice } = await import('../lib/achizitii-offer-price.ts')
  const { isOfferPdf } = await import('../lib/achizitii-offer-number.ts')
  const { purchaseAmounts } = await import('../lib/achizitii-vat.ts')
  assert.deepEqual(offerPrice('1210,00', 'RON'), { suma: 1210, valuta: 'RON' })
  assert.deepEqual(offerPrice(2420, 'EUR'), { suma: 2420, valuta: 'EUR' })
  for (const value of ['', null, -1, 0, Infinity, '12abc', '12.345', '1e5']) assert.throws(() => offerPrice(value, 'RON'))
  assert.throws(() => offerPrice('123', 'invalid'))
  assert.deepEqual(purchaseAmounts('1210', '1', '1', 'gross'), { netUnit: 1000, netTotal: 1000, vatTotal: 210, grossTotal: 1210 })
  const componentFile = path.resolve(__dirname, '../components/proiect/OfferPrice.tsx')
  const componentCode = swc.transformSync(fs.readFileSync(componentFile, 'utf8'), { filename: componentFile, jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime:'automatic' } }, target:'es2022' }, module: { type:'commonjs' } }).code
  const component = { exports: {} }
  vm.runInThisContext(`(function(require,module,exports){${componentCode}\n})`, { filename:componentFile })(key => key === '@/lib/achizitii-vat' ? { purchaseAmounts } : require(key), component, component.exports)
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const markup = renderToStaticMarkup(React.createElement(component.exports.default, { id:'test', suma:1210, valuta:'RON', onSaved:()=>{} }))
  assert.match(markup, /Total cu TVA:/); assert.match(markup, /1[.\s\u00a0]210,00 RON/)
  assert.match(markup, /1[.\s\u00a0]000,00 RON/); assert.match(markup, /210,00 RON/); assert.match(markup, /TVA 21%/)
  const emptyMarkup = renderToStaticMarkup(React.createElement(component.exports.default, { id:'test', onSaved:()=>{} }))
  assert.match(emptyMarkup, /Preț necompletat/); assert.doesNotMatch(emptyMarkup, /Total cu TVA:/)
  const id = '11111111-1111-1111-1111-111111111111'
  let doc = { id, firma_id: id, achizitie_id: id, fisier_nume: 'Oferta 1.pdf', fisier_tip: 'application/pdf', fisier_path: 'original.pdf' }
  const writes = []
  let ai = '{"suma":1210,"valuta":"RON"}'
  const sb = { from: () => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: doc }) }) }),
    update: price => ({ eq: () => ({ eq: async () => { writes.push(price); return {} } }) }),
  }), storage: { from: () => ({ download: async () => ({ data: new Blob(['%PDF-original']) }) }) } }
  class WorkflowError extends Error { constructor(message, status=400) { super(message); this.status=status } }
  class Anthropic { constructor() { this.messages = { create: async () => ({ content: [{ type: 'text', text: ai }] }) } } }
  const filename = path.resolve(__dirname, '../app/api/achizitii/oferte/pret/route.ts')
  const code = swc.transformSync(fs.readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'commonjs' } }).code
  const module = { exports: {} }
  const requireLocal = key => {
    if (key === '@anthropic-ai/sdk') return Anthropic
    if (key === '@/lib/supabase/server') return { getServiceSupabase: () => sb }
    if (key === '@/lib/achizitii-offer-price') return { offerPrice }
    if (key === '@/lib/achizitii-offer-number') return { isOfferPdf }
    if (key === '@/lib/proiect-workflow-store') return { WorkflowError, sameOrigin: () => {}, scopeContext: async (_, scope) => assert.equal(scope, `purchase-${id}`) }
    return require(key)
  }
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(requireLocal, module, module.exports)
  const request = body => new NextRequest('http://localhost/api/achizitii/oferte/pret', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) })
  let response = await module.exports.PATCH(request({ suma: '1210,00', valuta: 'RON' }))
  assert.equal(response.status, 200); assert.deepEqual(writes, [{ suma:1210, valuta:'RON' }])
  response = await module.exports.PATCH(request({ suma: -10, valuta: 'RON' }))
  assert.equal(response.status, 400); assert.equal(writes.length, 1)
  const savedKey = process.env.ANTHROPIC_API_KEY
  process.env.ANTHROPIC_API_KEY = 'mock-only'
  try {
    response = await module.exports.POST(request({}))
    assert.equal(response.status, 200); assert.equal((await response.json()).suma, 1210)
    assert.equal(writes.length, 1, 'AI only proposes; must not overwrite saved total')
    ai = '{"suma":null,"valuta":null}'
    response = await module.exports.POST(request({})); assert.equal(response.status, 422)
    assert.equal(writes.length, 1)
  } finally { if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = savedKey }
  doc = { ...doc, fisier_nume:'Cerere de oferta.pdf' }
  response = await module.exports.PATCH(request({ suma:100, valuta:'RON' }))
  assert.equal(response.status, 404); assert.equal(writes.length, 1)
  console.log('OK: total cu TVA, validare, monedă, bază/TVA 21%, salvare și AI fără suprascriere; documente neeligibile respinse.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
