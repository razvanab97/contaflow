const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const swc = require('next/dist/build/swc')
const JSZip = require('jszip')
const cache = new Map()
function localModule(name) {
  const filename = path.resolve(__dirname, '../lib', name + '.ts')
  if (cache.has(filename)) return cache.get(filename).exports
  const module = { exports: {} }; cache.set(filename, module)
  const code = swc.transformSync(fs.readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'commonjs' } }).code
  const requireLocal = id => id.endsWith('proiect-templates.json') ? require('../lib/proiect-templates.json') : id.startsWith('@/lib/') ? localModule(id.slice(6)) : id.startsWith('./') ? localModule(id.slice(2)) : require(id)
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(requireLocal, module, module.exports)
  return module.exports
}
async function main() {
  const { purchaseAmounts } = localModule('achizitii-vat')
  assert.deepEqual(purchaseAmounts('1210','1','1','gross'), { netUnit: 1000, netTotal: 1000, vatTotal: 210, grossTotal: 1210 })
  assert.deepEqual(purchaseAmounts('1000','1','1'), { netUnit: 1000, netTotal: 1000, vatTotal: 210, grossTotal: 1210 })
  assert.equal(purchaseAmounts('1210,00','2','1','gross').grossTotal, 2420)
  assert.equal(purchaseAmounts('242','1','5','gross').netTotal, 1000)
  assert.equal(purchaseAmounts('', '1', '1'), null)
  assert.equal(purchaseAmounts('1e308', '1e308', '1'), null)
  const { generateProjectDoc } = localModule('proiect-generate')
  const { emptyLine, FORM_FIELDS } = localModule('proiect-workflow')
  assert.equal(emptyLine().priceMode, 'gross')
  for (const kind of ['nota','receptie','oferta']) {
    const draft = { fields: Object.fromEntries(Object.keys(FORM_FIELDS[kind]).map(key=>[key,'Test'])), lines: [{ ...emptyLine(), supplier: 'Furnizor', product: 'Produs', specs: 'Specificații', price: '1210,00', source: 'Ofertă', date: '11.10.2026' }] }
    const bytes = await generateProjectDoc(kind,draft,{beneficiar:'Beneficiar',reprezentant:'Reprezentant'})
    const zip = await JSZip.loadAsync(bytes)
    const xml = await zip.file('word/document.xml').async('string')
    assert.match(xml,/TVA 21%/);assert.match(xml,/210,00/);assert.match(xml,/1[.\s\u00a0]210,00/)
    assert.doesNotMatch(xml,/1[.\s\u00a0]464,10/)
  }
  console.log('OK: TVA inclus/fără TVA, virgule, cantități, curs, compatibilitate și Word fără dublă TVA.')
}
main().catch(error=>{console.error(error);process.exitCode=1})
