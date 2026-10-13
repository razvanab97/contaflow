const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { webpack } = require('next/dist/compiled/webpack/webpack')
const root = path.resolve(__dirname, '..')

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contaflow-form-ui-'))
  const css = fs.readFileSync(path.join(root, 'components/proiect/RutinaLunii.module.css'), 'utf8')
  const classes = Object.fromEntries([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(match => [match[1], match[1]]))
  fs.writeFileSync(path.join(dir, 'css.js'), `module.exports={__esModule:true,default:${JSON.stringify(classes)}}`)
  fs.writeFileSync(path.join(dir, 'stub.js'), 'module.exports={__esModule:true,default:()=>null,deschideDocument:()=>{}}')
  fs.writeFileSync(path.join(dir, 'loader.cjs'), `module.exports=function(source){return require(${JSON.stringify(require.resolve('next/dist/build/swc'))}).transformSync(source,{filename:this.resourcePath,jsc:{parser:{syntax:'typescript',tsx:this.resourcePath.endsWith('.tsx')},transform:{react:{runtime:'automatic'}},target:'es2022'},module:{type:'commonjs'}}).code}`)
  fs.writeFileSync(path.join(dir, 'entry.js'), `
    const React=require('react'),{createRoot}=require('react-dom/client');
    const {emptyWorkflow,initialMonth}=require(${JSON.stringify(path.join(root, 'lib/proiect-workflow.ts'))});
    const Workflow=require(${JSON.stringify(path.join(root, 'components/ProiectWorkflow.tsx'))}).default;
    window.fixture=initialMonth('2026-10',emptyWorkflow());window.fixture.updatedAt='2026-10-13';
    for(const task of Object.values(window.fixture.tasks))task.status='neaplicabil';window.fixture.tasks.reges.status='lipsa';
    window.attempts=[];window.conflict=false;
    window.fetch=async(url,options={})=>{
      let result;
      if(url.includes('/proiect-workflow/salarizare')){
        if(window.zipFailure)return new Response(JSON.stringify({error:'Mock archive failed'}),{status:503,headers:{'Content-Type':'application/json'}});
        return new Response(new Uint8Array([80,75,5,6,...Array(18).fill(0)]),{headers:{'Content-Type':'application/zip'}});
      }
      if(options.body instanceof FormData){
        const fd=options.body,file=fd.get('file'),version=Number(fd.get('version'));window.attempts.push({name:file.name,version});
        if(window.conflict||version!==window.fixture.version)return new Response(JSON.stringify({error:'Date modificate. Reincarca.'}),{status:409,headers:{'Content-Type':'application/json'}});
        if(file.name.includes('fail'))return new Response(JSON.stringify({error:'Mock upload failed'}),{status:500,headers:{'Content-Type':'application/json'}});
        const person=file.name.includes('elena')?'ABUNEI ELENA':'NICORICI MIHAELA';
        const asset={id:'doc-'+window.attempts.length,task:'reges',type:'application/pdf',kind:'upload',name:'Extras REGES salariat - '+person+' - 2026-10-13.pdf',reges:{type:'salariat',subject:person,issuedOn:'2026-10-13',employerCui:'52575850'},originalName:file.name,createdAt:'2026-10-13T09:00:00Z'};
        window.fixture={...window.fixture,assets:[...window.fixture.assets,asset],version:window.fixture.version+1};result={state:window.fixture,asset};
      }else if(options.method==='POST'){window.fixture={...JSON.parse(options.body).state,version:window.fixture.version+1,updatedAt:'2026-10-13'};result={state:window.fixture};}
      else result={state:window.fixture,examples:[]};
      return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
    };
    const app=createRoot(document.getElementById('root'));
    window.renderWorkflow=props=>app.render(React.createElement(Workflow,props));
    window.renderWorkflow({firmaId:'mock',lunaId:'test-month',luna:'2026-10'});
  `)
  await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,entry:path.join(dir,'entry.js'),output:{path:dir,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules')],alias:{
    '@/components/proiect/PurchaseForm.module.css$':path.join(dir,'css.js'),
    './RutinaLunii.module.css$':path.join(dir,'css.js'),
    './CreditProposal.module.css$':path.join(dir,'css.js'),
    '@/lib/vizualizare$':path.join(dir,'stub.js'),
    '@/components/ui/VeziButon$':path.join(dir,'stub.js'),
    'next/link$':path.join(dir,'stub.js'),'@':root,
  }},module:{rules:[{test:/\.tsx?$/,use:path.join(dir,'loader.cjs')}]}},(error,stats)=>error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()))
  const playwright=require(process.env.PLAYWRIGHT_PATH||'/Users/razvanabunei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
  for (const engine of ['chromium','webkit']) {
    const browser=await playwright[engine].launch({headless:true});
    try {
      const page=await browser.newPage({viewport:{width:1180,height:1000}}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.setContent(`<style>:root{--surface:#fff;--surface-secondary:#f1f5f3;--surface-sunken:#f4f6f5;--border:#d6dfda;--border-subtle:#d6dfda;--border-strong:#aabbaf;--accent:#00865c;--accent-solid:#00865c;--accent-soft:#e8f7f0;--text-primary:#202826;--text-secondary:#65756a;--success:#00865c;--success-soft:#e8f7f0;--warning:#af7000;--danger:#bd2222;--r-lg:14px;--r-md:10px;--fs-xs:12px;--fs-sm:13px;--fs-md:14px;--fs-base:16px;--fs-lg:18px}*{box-sizing:border-box}body{font-family:Arial;margin:24px;background:#f7f9f8;color:var(--text-primary)}button,input,textarea,select{font:inherit}.btn{padding:8px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;background:white}.btn-primary{background:var(--accent);color:white}${css}</style><div id="root"></div>`);
      await page.addScriptTag({content:fs.readFileSync(path.join(dir,'bundle.js'),'utf8')});
      const input=page.getByLabel('Încarcă Extrase REGES',{exact:true});
      await input.waitFor({state:'attached'});
      const archiveButton=page.getByRole('button',{name:'Descarcă toate documentele (ZIP)',exact:true});
      assert.equal(await archiveButton.isDisabled(),true);
      assert.equal(await input.getAttribute('multiple'),'');
      const recommendations=page.getByRole('region',{name:'Documente REGES recomandate'});
      await recommendations.waitFor();
      assert.equal(await recommendations.locator('ul').first().locator('li').count(),6);
      await recommendations.locator('summary').click();
      assert.equal(await recommendations.locator('li').count(),10);
      const file=name=>({name,mimeType:'application/pdf',buffer:Buffer.from('mock PDF')});
      await input.setInputFiles([file('elena.pdf'),file('mihaela.pdf'),file('elena-2.pdf')]);
      await page.getByRole('status').filter({hasText:'3/3 documente salvate separat'}).waitFor();
      assert.equal(await page.evaluate(()=>window.fixture.assets.length),3);
      assert.equal(await page.evaluate(()=>window.fixture.tasks.reges.status),'lipsa');
      const versions=await page.evaluate(()=>window.attempts.map(x=>x.version));
      assert.deepEqual(versions,[1,2,3]);
      assert.equal(await recommendations.getByText('Încărcat și recunoscut',{exact:true}).count(),2);
      await page.evaluate(()=>window.zipFailure=true);
      await archiveButton.click();
      await page.getByRole('alert').filter({hasText:'Mock archive failed'}).waitFor();
      await page.evaluate(()=>window.zipFailure=false);
      const downloadEvent=page.waitForEvent('download');await archiveButton.click();
      const downloaded=await downloadEvent;assert.equal(downloaded.suggestedFilename(),'Dosar_salarizare_AB_TEXTILE_luna_lucru_2026-10.zip');
      assert.equal(await page.evaluate(()=>window.fixture.tasks.reges.status),'lipsa');
      await input.setInputFiles([file('elena-3.pdf'),file('fail.pdf'),file('mihaela-2.pdf')]);
      await page.getByRole('status').filter({hasText:'2/3 documente salvate separat'}).waitFor();
      await page.getByRole('alert').filter({hasText:'Mock upload failed'}).waitFor();
      assert.equal(await page.evaluate(()=>window.fixture.assets.length),5);
      assert.deepEqual(await page.evaluate(()=>window.attempts.slice(3).map(x=>x.version)),[5,6,6]);
      await page.evaluate(()=>window.conflict=true);
      await input.setInputFiles([file('conflict.pdf'),file('not-attempted.pdf')]);
      await page.getByRole('alert').filter({hasText:'Lotul a fost oprit'}).waitFor();
      assert.equal(await page.evaluate(()=>window.attempts.length),7);
      assert.equal(await page.evaluate(()=>window.fixture.assets.length),5);
      await page.evaluate(()=>window.conflict=false);
      await input.setInputFiles(Array.from({length:21},(_,index)=>file('file-'+index+'.pdf')));
      await page.getByRole('alert').filter({hasText:'maximum 20'}).waitFor();
      assert.equal(await page.evaluate(()=>window.attempts.length),7);
      await input.setInputFiles([{name:'large.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(5*1024*1024)},file('mihaela-valid.pdf')]);
      await page.getByRole('status').filter({hasText:'1/2 documente salvate separat'}).waitFor();
      assert.equal(await page.evaluate(()=>window.fixture.assets.length),6);
      assert.equal(await page.evaluate(()=>window.fixture.tasks.reges.status),'lipsa');
      await page.screenshot({path:`/tmp/contaflow-reges-${engine}.png`,fullPage:true});
      await page.setViewportSize({width:390,height:844});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow');
      assert.deepEqual(errors,[]);
      console.log(engine+': recommendations, multi-select, sequential versions, partial failures, conflict stop, file limits, ZIP download/errors, unchanged status and mobile PASS');
    }finally{await browser.close();}
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
