const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { webpack } = require('next/dist/compiled/webpack/webpack')
const root = path.resolve(__dirname, '..')

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contaflow-form-ui-'))
  const css = fs.readFileSync(path.join(root, 'components/proiect/PurchaseForm.module.css'), 'utf8')
  const classes = Object.fromEntries([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(match => [match[1], match[1]]))
  fs.writeFileSync(path.join(dir, 'css.js'), `module.exports={__esModule:true,default:${JSON.stringify(classes)}}`)
  fs.writeFileSync(path.join(dir, 'stub.js'), 'module.exports={__esModule:true,default:()=>null,deschideDocument:()=>{}}')
  fs.writeFileSync(path.join(dir, 'loader.cjs'), `module.exports=function(source){return require(${JSON.stringify(require.resolve('next/dist/build/swc'))}).transformSync(source,{filename:this.resourcePath,jsc:{parser:{syntax:'typescript',tsx:this.resourcePath.endsWith('.tsx')},transform:{react:{runtime:'automatic'}},target:'es2022'},module:{type:'commonjs'}}).code}`)
  fs.writeFileSync(path.join(dir, 'entry.js'), `
    const React=require('react'),{createRoot}=require('react-dom/client');
    const {emptyWorkflow,emptyLine}=require(${JSON.stringify(path.join(root, 'lib/proiect-workflow.ts'))});
    const Workflow=require(${JSON.stringify(path.join(root, 'components/ProiectWorkflow.tsx'))}).default;
    window.fixture=emptyWorkflow();window.fixture.updatedAt='2026-10-12';
    window.fixture.forms.nota={fields:{numar:'1',data:'12.10.2026',achizitie:'Aer condiționat',tip:'Produse',justificare:'Am ales cel mai mic preț fără TVA.'},lines:['A','B','C'].map((supplier,index)=>({...emptyLine(),supplier:'Furnizor '+supplier,website:'https://oferta.ro',product:'Aer condiționat',specs:'12000 BTU\\nRăcire și încălzire',price:String(1000+index*100),source:'Oferta '+(index+1)+'.pdf',priceMode:'net'}))};
    window.saved=0;
    window.fetch=async(url,options={})=>{
      let result;
      if(url.includes('/oferte/precompletare'))result={offers:window.fixture.forms.nota.lines.map((line,index)=>({id:'offer-'+index,name:'Oferta citită '+(index+1),lines:[line],warnings:[]}))};
      else if(url.includes('/proiect-workflow/document')&&options.method==='POST'){
        const asset={id:'generated',name:'Anexa 1.docx',task:'nota',createdAt:'2026-10-12T09:00:00Z'};window.fixture={...window.fixture,assets:[...window.fixture.assets,asset],version:window.fixture.version+1};result={state:window.fixture,asset};
      }else if(options.method==='POST'){window.fixture={...JSON.parse(options.body).state,version:window.fixture.version+1,updatedAt:'2026-10-12'};window.saved++;result={state:window.fixture};}
      else result={state:window.fixture,purchase:{denumire:'Aer condiționat',valoare:4000,nota:'12000 BTU',tip:'Produse'},examples:[]};
      return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
    };
    const app=createRoot(document.getElementById('root'));
    window.renderWorkflow=props=>app.render(React.createElement(Workflow,props));
    window.renderWorkflow({firmaId:'mock',purchaseId:'test',formKind:'nota'});
  `)
  await new Promise((resolve, reject) => webpack({ mode: 'development', devtool: false, entry: path.join(dir, 'entry.js'), output: { path: dir, filename: 'bundle.js' }, resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules')], alias: {
    '@/components/proiect/PurchaseForm.module.css$': path.join(dir, 'css.js'),
    '@/components/proiect/RutinaLunii$': path.join(dir, 'stub.js'),
    '@/lib/vizualizare$': path.join(dir, 'stub.js'),
    '@/components/ui/VeziButon$': path.join(dir, 'stub.js'),
    'next/link$': path.join(dir, 'stub.js'), '@': root,
  } }, module: { rules: [{ test: /\.tsx?$/, use: path.join(dir, 'loader.cjs') }] } }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()))
  const playwright = require(process.env.PLAYWRIGHT_PATH || '/Users/razvanabunei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
  for (const engine of ['chromium', 'webkit']) {
    const browser = await playwright[engine].launch({ headless: true })
    try {
      const page = await browser.newPage({ viewport: { width: 1180, height: 950 } })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.setContent(`<style>:root{--surface:#fff;--surface-sunken:#f4f6f5;--surface-secondary:#f0f5f2;--border:#d6dfda;--border-strong:#becbc3;--accent:#00865c;--accent-solid:#00865c;--accent-soft:#e9f7f0;--text-primary:#202826;--text-secondary:#62726a;--success:#00865c;--warning:#b56800;--danger:#c22;--r-lg:14px;--r-md:9px;--fs-lg:18px;--fs-base:16px;--fs-md:14px;--fs-sm:13px;--fs-xs:12px}*{box-sizing:border-box}body{font-family:Arial;margin:24px;background:#f5f8f6;color:var(--text-primary)}button,input,textarea,select{font:inherit}.btn{padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text-primary);cursor:pointer}.btn-primary{background:var(--accent);color:white}.btn:disabled{opacity:.5}${css}</style><div id="root"></div>`)
      await page.addScriptTag({ content: fs.readFileSync(path.join(dir, 'bundle.js'), 'utf8') })
      const nav = page.getByRole('navigation', { name: 'Zonele formularului' })
      await nav.waitFor()
      assert.equal(await nav.getByRole('button').count(), 4)
      assert.equal(await page.getByLabel('Beneficiar', { exact: true }).isVisible(), false)
      await page.getByLabel('Număr notă', { exact: true }).fill('12').catch(async error=>{console.error(errors,await page.locator('body').innerText());await page.screenshot({path:'/tmp/contaflow-form-error.png',fullPage:true});throw error})
      await nav.getByRole('button', { name: /Produse și prețuri/ }).click()
      assert.equal(await page.locator('details.line').count(), 3)
      assert.equal(await page.locator('details.line[open]').count(), 1)
      await page.locator('details.line').nth(1).locator('summary').click()
      await page.locator('details.line').nth(1).getByLabel('Produs / serviciu', { exact: true }).fill('Aer condiționat verificat')
      await page.getByRole('button', { name: 'Completează din oferte cu AI', exact: true }).click()
      await page.getByRole('button', { name: 'Citește ofertele și propune completarea', exact: true }).click()
      await page.getByText('Oferta citită 1', { exact: true }).waitFor()
      await nav.getByRole('button', { name: /Date document/ }).click()
      assert.equal(await page.getByLabel('Număr notă', { exact: true }).inputValue(), '12')
      await nav.getByRole('button', { name: /Ajutor AI/ }).click()
      await page.getByText('Oferta citită 1', { exact: true }).waitFor()
      await page.waitForFunction(() => window.saved > 0)
      assert.equal(await page.evaluate(() => window.fixture.forms.nota.lines[1].product), 'Aer condiționat verificat')
      await nav.getByRole('button', { name: /Date document/ }).click()
      await page.screenshot({ path: `/tmp/contaflow-formular-${engine}.png`, fullPage: true })
      await page.getByRole('button', { name: 'Salvează și generează Word', exact: true }).click()
      await page.getByRole('link', { name: /Anexa 1.docx/ }).first().waitFor()
      assert.equal(await nav.getByRole('button', { name: /Versiuni Word/ }).getAttribute('aria-pressed'), 'true')
      await page.getByLabel('Alege formularul', { exact: true }).selectOption('oferta')
      await page.getByLabel('Număr cerere', { exact: true }).waitFor()
      assert.equal(await nav.getByRole('button', { name: /Date document/ }).getAttribute('aria-pressed'), 'true')
      await page.getByLabel('Alege formularul', { exact: true }).selectOption('receptie')
      await page.getByLabel('Număr proces-verbal', { exact: true }).waitFor()
      await page.getByLabel('Alege formularul', { exact: true }).selectOption('nota')
      assert.equal(await page.getByLabel('Număr notă', { exact: true }).inputValue(), '12')
      await page.setViewportSize({ width: 390, height: 844 })
      await nav.getByRole('button', { name: /Date document/ }).click()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile overflow')
      await page.screenshot({ path: `/tmp/contaflow-formular-mobile-${engine}.png`, fullPage: true })
      await page.evaluate(()=>window.renderWorkflow({firmaId:'mock',lunaId:'month-test',initialForm:true,formKind:'raport'}))
      await page.getByLabel('Perioada raportată', { exact: true }).waitFor()
      assert.equal(await page.getByRole('navigation', { name: 'Zonele formularului' }).count(), 0)
      assert.equal(await page.getByLabel('Beneficiar', { exact: true }).isVisible(), true)
      assert.deepEqual(errors, [])
      console.log(`${engine}: section navigation, collapsed profile/positions, editing retention, autosave, retained AI proposals, Word/version navigation, all purchase forms, monthly report regression, mobile PASS`)
    } finally { await browser.close() }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
