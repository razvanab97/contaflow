const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const swc = require('next/dist/build/swc')
const { NextRequest } = require('next/server')

async function main() {
  const filename = path.resolve(__dirname, '../app/api/chitante/document/route.ts')
  const bytes = Buffer.from('%PDF-1.7\noriginal offer pages\n%%EOF')
  let selectedId
  const sb = {
    from: () => ({ select: () => ({ eq: (_, id) => {
      selectedId = id
      return { single: async () => ({ data: id === 'missing' ? null : { fisier_path: `${id}.pdf`, fisier_nume: `Oferta ${id}.pdf`, fisier_tip: 'application/pdf' } }) }
    } }) }),
    storage: { from: () => ({ download: async key => {
      assert.equal(key, `${selectedId}.pdf`)
      return { data: new Blob([bytes], { type: 'application/pdf' }) }
    } }) },
  }
  const module = { exports: {} }
  const code = swc.transformSync(fs.readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'commonjs' } }).code
  const requireLocal = id => id === '@/lib/supabase/server' ? { getServiceSupabase: () => sb } : require(id)
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(requireLocal, module, module.exports)
  for (const id of ['1', '2', '3']) {
    const response = await module.exports.GET(new NextRequest(`http://localhost/api/chitante/document?id=${id}`))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Content-Type'), 'application/pdf')
    assert.equal(response.headers.get('Content-Disposition'), `attachment; filename="Oferta ${id}.pdf"`)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes)
  }
  const preview = await module.exports.GET(new NextRequest('http://localhost/api/chitante/document?id=1&preview=1'))
  assert.match(preview.headers.get('Content-Disposition'), /^inline;/)
  const missing = await module.exports.GET(new NextRequest('http://localhost/api/chitante/document?id=missing'))
  assert.equal(missing.status, 404)
  console.log('OK: descărcări individuale Oferta 1/2/3, PDF original, nume corect, preview și document inexistent.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
