const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const swc = require('next/dist/build/swc')
const { webpack } = require('next/dist/compiled/webpack/webpack')

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contaflow-workspace-'))
  const entry = path.join(dir, 'entry.js')
  const loader = path.join(dir, 'loader.cjs')
  fs.writeFileSync(loader, `module.exports=function(source){return require(${JSON.stringify(require.resolve('next/dist/build/swc'))}).transformSync(source,{filename:this.resourcePath,jsc:{parser:{syntax:'typescript',tsx:this.resourcePath.endsWith('.tsx')},transform:{react:{runtime:'automatic'}},target:'es2022'},module:{type:'commonjs'}}).code}`)
  const css = fs.readFileSync(path.join(root, 'components/proiect/PurchaseWorkspace.module.css'), 'utf8')
  const styles = Object.fromEntries([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(match => [match[1], match[1]]))
  const stub = path.join(dir, 'stubs.js')
  fs.writeFileSync(stub, 'module.exports={__esModule:true,default:()=>null}')
  const cssModule = path.join(dir, 'styles.js')
  fs.writeFileSync(cssModule, `module.exports={__esModule:true,default:${JSON.stringify(styles)}}`)
  fs.writeFileSync(entry, `const React=require('react');const {createRoot}=require('react-dom/client');const Module=require(${JSON.stringify(path.join(root, 'app/(app)/[firma]/[luna]/modules/AchizitiiModule.tsx'))}).default;createRoot(document.getElementById('root')).render(React.createElement(Module,{firma:{id:'mock',slug:'proiect-ab-textile',nume:'AB Textile',culoare:'#00865c'},lunaId:'mock-month'}));`)
  await new Promise((resolve, reject) => webpack({ mode: 'development', devtool: false, entry, output: { path: dir, filename: 'bundle.js' }, resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules')], alias: {
    '@/components/ProiectWorkflow$': stub,
    '@/components/proiect/SpecificationAiExpander$': stub,
    '@/components/ui/VeziButon$': stub,
    './proiect-mail/SincronizareProiectMail$': stub,
    './PurchaseWorkspace.module.css$': cssModule,
    '@': root,
  } }, module: { rules: [{ test: /\.tsx?$/, use: loader }] } }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()))
  const playwright = require(process.env.PLAYWRIGHT_PATH || '/Users/razvanabunei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
  const engine = process.env.PLAYWRIGHT_BROWSER || 'chromium'
  if (!['chromium', 'webkit'].includes(engine)) throw new Error('Unsupported test browser')
  const browser = await playwright[engine].launch({ headless: true })
  try {
    for (const round of [1, 2]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      let failDelete = false
      let failUpload = false
      const writes = []
      const docs = [
        { id: 'offer-a', fisier_nume: 'Oferta 1.pdf', fisier_tip: 'application/pdf', tip_document: 'oferta', furnizor: 'Furnizor A', suma: 1210, valuta: 'RON' },
        { id: 'offer-b', fisier_nume: 'Oferta 2.pdf', fisier_tip: 'application/pdf', tip_document: 'oferta', furnizor: 'Furnizor B', suma: 1452, valuta: 'RON' },
      ]
      const item = { id: 'purchase-test', denumire: 'Aer condiționat', valoare: 4000, sursa: 'cofinantare', status: 'oferta', linie_buget: '4.22', nota: '[flux-achizitie:trei_oferte] Specificații minime: 12000 BTU.' }
      await page.route('http://contaflow.test/**', async route => {
        const request = route.request(), url = new URL(request.url())
        const method = request.method()
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<style>:root{--text-primary:#202628;--text-secondary:#65716d;--surface:#fff;--surface-secondary:#f1f5f3;--surface-sunken:#f3f5f4;--border:#d7dfdb;--border-subtle:#e3e9e6;--accent:#00865c;--accent-soft:#eaf7f1;--accent-solid:#00865c;--success:#00865c;--success-soft:#eaf7f1;--danger:#c22;--r-md:10px;--r-lg:14px;--r-sm:6px;--r-full:100px;--fs-xs:12px;--fs-sm:14px;--fs-md:14px;--fs-base:16px;--fs-lg:18px}*{box-sizing:border-box}body{font-family:Arial;margin:16px;background:#f6f8f7}button,input,select{font:inherit}.btn{border:1px solid var(--border);border-radius:6px;padding:8px 12px;background:var(--surface);color:var(--text-primary);cursor:pointer}.btn-primary{background:var(--accent);color:white}.btn:disabled{opacity:.5}.badge{font-size:12px}summary{cursor:pointer}${css}</style><div id="root"></div>` })
        if (method !== 'GET') writes.push({ method, path: url.pathname })
        if (method === 'DELETE') {
          if (failDelete) return route.fulfill({ status: 500, json: { error: 'Mock failure' } })
          const index = docs.findIndex(doc => doc.id === url.searchParams.get('id'))
          if (index >= 0) docs.splice(index, 1)
          return route.fulfill({ json: { ok: true } })
        }
        if (method === 'POST') return route.fulfill({ status: failUpload ? 500 : 200, json: { ok: !failUpload } })
        if (method === 'PATCH') {
          const body = request.postDataJSON()
          Object.assign(item, body)
          if ('linieBuget' in body) item.linie_buget = body.linieBuget
          return route.fulfill({ json: item })
        }
        if (url.pathname === '/api/achizitii') return route.fulfill({ json: [item] })
        if (url.pathname === '/api/achizitii/dosare') return route.fulfill({ json: { [item.id]: docs } })
        if (url.pathname === '/api/achizitii/documente') return route.fulfill({ json: docs })
        return route.fulfill({ json: [] })
      })
      await page.goto('http://contaflow.test/')
      await page.addScriptTag({ content: fs.readFileSync(path.join(dir, 'bundle.js'), 'utf8') })
      const nav = page.getByRole('navigation', { name: 'Pașii achiziției' })
      await nav.waitFor().catch(async error => { console.error('Browser errors:', errors, 'Rendered page:', await page.locator('body').innerText()); throw error })
      assert.equal(await nav.getByRole('button').count(), 7)
      assert.equal(await page.locator('.body > section:visible').count(), 1)
      await page.getByText('Furnizor B', { exact: true }).waitFor()
      await page.screenshot({ path: `/tmp/contaflow-achizitii-preview-${round}.png`, fullPage: true })
      await page.getByPlaceholder('ex. Furnizorul A').fill('Furnizor în lucru')
      const visibleFiles = page.locator('.body > section:visible input[type=file]')
      await visibleFiles.setInputFiles({ name: 'pagina.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') })
      await nav.getByRole('button', { name: /Notă de estimare/ }).click()
      await page.getByRole('button', { name: /Completează Anexa 1/ }).waitFor()
      await page.getByRole('button', { name: 'Pasul precedent', exact: true }).filter({ visible: true }).click()
      assert.equal(await page.getByPlaceholder('ex. Furnizorul A').inputValue(), 'Furnizor în lucru')
      await page.getByText('1. pagina.png', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Documente', exact: true }).click()
      assert.equal(await page.locator('.body > section:visible').count(), 1)
      assert.equal(await page.getByRole('link', { name: /Oferta 1.pdf/ }).getAttribute('download'), 'Oferta 1.pdf')
      page.on('dialog', dialog => dialog.accept())
      failDelete = true
      await page.getByRole('button', { name: 'Șterge Oferta 1.pdf', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: 'Documentul nu a putut fi șters' }).waitFor()
      assert.equal(docs.length, 2)
      failDelete = false
      await page.getByRole('button', { name: 'Șterge Oferta 1.pdf', exact: true }).click()
      await page.getByRole('button', { name: 'Șterge Oferta 1.pdf', exact: true }).waitFor({ state: 'detached' })
      assert.equal(docs.length, 1)
      await page.getByText('Detalii și setări ale dosarului', { exact: true }).click()
      await page.getByLabel('Fluxul acestei achiziții').selectOption('cerere')
      await page.waitForFunction(() => document.querySelectorAll('nav[aria-label="Pașii achiziției"] button').length === 8)
      await nav.getByRole('button', { name: /Linia de buget/ }).click()
      await page.locator('.body > section:visible select').first().selectOption('4.1')
      await page.waitForFunction(() => document.querySelectorAll('nav[aria-label="Pașii achiziției"] button').length === 9)
      await nav.getByRole('button', { name: /Contract cu furnizorul/ }).click()
      failUpload = true
      await page.locator('.body > section:visible input[type=file]').setInputFiles({ name: 'contract.pdf', mimeType: 'application/pdf', buffer: Buffer.from('mock pdf') })
      await page.getByRole('status').filter({ hasText: 'nu au putut fi încărcate' }).waitFor()
      assert.equal(writes.filter(write => write.method === 'POST').length, 1)
      await page.setViewportSize({ width: 390, height: 844 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile horizontal overflow')
      await page.screenshot({ path: `/tmp/contaflow-achizitii-mobile-${round}.png`, fullPage: true })
      await page.setViewportSize({ width: 1280, height: 1000 })
      await page.getByRole('button', { name: 'Oferte', exact: true }).click()
      await page.screenshot({ path: `/tmp/contaflow-achizitii-desktop-${round}.png`, fullPage: true })
      if (round === 2) {
        await page.evaluate(() => {
          const colors = { '--text-primary': '#e8eee9', '--text-secondary': '#a6b3ac', '--surface': '#151c18', '--surface-secondary': '#202922', '--surface-sunken': '#101612', '--border': '#3b4840', '--border-subtle': '#303c34', '--accent-soft': '#163c2b' }
          for (const [name, value] of Object.entries(colors)) document.documentElement.style.setProperty(name, value)
          document.body.style.background = '#101612'
        })
        await page.screenshot({ path: '/tmp/contaflow-achizitii-dark.png', fullPage: true })
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      }
      await page.getByRole('button', { name: 'Marchează finalizată', exact: true }).click()
      await page.getByRole('button', { name: /Finalizate \(1\)/ }).click()
      await page.getByRole('button', { name: 'Deschide dosarul', exact: true }).click()
      assert.equal(await nav.getByRole('button').count(), 9)
      await nav.getByRole('button', { name: /Linia de buget/ }).click()
      assert.equal(await page.locator('.body > section:visible select').count(), 2)
      assert.deepEqual(errors, [])
      console.log(`${engine} round ${round}: 7/8/9 steps, previous-step editing, offer draft retention, downloads, deletion refresh/errors, upload errors, mobile and finalized dossier PASS`)
      await page.close()
    }
    console.log(`Verified actual procurement components with mocked APIs. Screenshots: /tmp/contaflow-achizitii-desktop-2.png and /tmp/contaflow-achizitii-mobile-2.png`)
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
