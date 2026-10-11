const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const swc = require('next/dist/build/swc')

async function main() {
  const procedure = await import('../lib/achizitii-procedura.ts')
  const flow = await import('../lib/achizitii-flow.ts')
  let states = [], cursor = 0
  const react = { ...require('react'), useState(initial) {
    const index = cursor++
    if (!(index in states)) states[index] = initial
    return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
  } }
  const filename = path.resolve(__dirname, '../app/(app)/[firma]/[luna]/modules/SistemAchizitii.tsx')
  const code = swc.transformSync(fs.readFileSync(filename, 'utf8'), { filename, jsc: { parser:{ syntax:'typescript', tsx:true }, transform:{ react:{runtime:'automatic'} }, target:'es2022' }, module:{type:'commonjs'} }).code
  const module = { exports:{} }
  const requireLocal = key => key === 'react' ? react : key === '@/lib/achizitii-flow' ? flow : key === '@/lib/achizitii-procedura' ? { ...procedure, dosarAchizitie: () => ['cerere','oferte','nota','contract','plata','factura','pv','poze'].map(cheie=>({cheie, ok:cheie !== 'poze', detaliu:'test'})) } : key.startsWith('@/components/') ? { default:()=>null, __esModule:true } : require(key)
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(requireLocal, module, module.exports)
  const generated = [], statuses = []
  const item = {id:'purchase-a',denumire:'Aer',status:'nota_semnata',linie_buget:'4.22',sursa:'cofinantare',valoare:4000,nota:flow.withPurchaseFlow('', 'cerere')}
  const props = { item, docs:[], onLinie:()=>{}, onSursa:()=>{}, onUploaded:()=>{}, onGenereaza:kind=>generated.push(kind), onStatus:status=>statuses.push(status), onFlux:()=>{} }
  const render = () => { cursor=0; return module.exports.PasiAchizitie(props) }
  function nodes(node, out=[]) {
    if (Array.isArray(node)) { node.forEach(child=>nodes(child,out)); return out }
    if (!node || typeof node !== 'object') return out
    if (typeof node.type === 'function') return nodes(node.type(node.props),out)
    out.push(node); nodes(node.props?.children,out); return out
  }
  const button = (tree, key) => nodes(tree).find(node=>node.type==='button' && node.props['aria-controls'] === `pas-${item.id}-${key}`)
  const panel = (tree, key) => nodes(tree).find(node=>node.props.id === `pas-${item.id}-${key}`)
  let tree = render()
  assert.equal(panel(tree,'nota').props.hidden,true)
  assert.equal(panel(tree,'oferte').props.hidden,false)
  button(tree,'nota').props.onClick(); tree=render()
  assert.equal(panel(tree,'nota').props.hidden,false)
  assert.equal(button(tree,'nota').props['aria-expanded'],true)
  nodes(panel(tree,'nota')).find(node=>node.type==='button').props.onClick()
  assert.deepEqual(generated,['nota']); assert.deepEqual(statuses,[])
  button(tree,'cerere').props.onClick(); tree=render()
  assert.equal(panel(tree,'nota').props.hidden,true)
  assert.equal(panel(tree,'cerere').props.hidden,false)
  button(tree,'cerere').props.onClick(); tree=render()
  assert.equal(panel(tree,'cerere').props.hidden,true)
  assert.deepEqual(statuses,[]); assert.equal(props.docs.length,0)
  states=[]; props.item={...item,status:'finalizat'}; tree=render()
  nodes(tree).find(node=>node.type==='button' && node.props.children === 'Arată pașii').props.onClick(); tree=render()
  button(tree,'pv').props.onClick(); tree=render()
  assert.equal(panel(tree,'pv').props.hidden,false)
  assert.deepEqual(statuses,[])
  console.log('OK: redeschidere/închidere pași anteriori, generare formular, oferte accesibile, dosar finalizat fără schimbare etapă.')
}
main().catch(error=>{console.error(error);process.exitCode=1})
