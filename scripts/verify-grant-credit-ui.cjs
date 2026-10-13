const assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {webpack}=require('next/dist/compiled/webpack/webpack')
const root=path.resolve(__dirname,'..')
async function main(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'contaflow-credit-ui-'))
  const styles=['RutinaLunii','CreditProposal'].map(name=>fs.readFileSync(path.join(root,`components/proiect/${name}.module.css`),'utf8')).join('\n')
  const classes=Object.fromEntries([...styles.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(match=>[match[1],match[1]]))
  fs.writeFileSync(path.join(dir,'css.js'),`module.exports={__esModule:true,default:${JSON.stringify(classes)}}`)
  fs.writeFileSync(path.join(dir,'stub.js'),'module.exports={__esModule:true,default:()=>null,deschideDocument:()=>{}}')
  fs.writeFileSync(path.join(dir,'loader.cjs'),`module.exports=function(source){return require(${JSON.stringify(require.resolve('next/dist/build/swc'))}).transformSync(source,{filename:this.resourcePath,jsc:{parser:{syntax:'typescript',tsx:this.resourcePath.endsWith('.tsx')},transform:{react:{runtime:'automatic'}},target:'es2022'},module:{type:'commonjs'}}).code}`)
  fs.writeFileSync(path.join(dir,'entry.js'),`
    const React=require('react'),{createRoot}=require('react-dom/client');
    const {emptyWorkflow,initialMonth}=require(${JSON.stringify(path.join(root,'lib/proiect-workflow.ts'))});
    const {completeCreditScheme}=require(${JSON.stringify(path.join(root,'lib/grant-credit.ts'))});
    const Workflow=require(${JSON.stringify(path.join(root,'components/ProiectWorkflow.tsx'))}).default;
    window.fixture=initialMonth('2026-10',emptyWorkflow());
    for(const task of Object.values(window.fixture.tasks))task.status='neaplicabil';window.fixture.tasks.creditare.status='lipsa';
    window.fixture.assets=['stat','centralizator'].map((task,i)=>({task,id:task+'-1',name:task+'.pdf',type:'application/pdf',createdAt:'2026-10-13T09:00:00Z',kind:'upload'}));
    window.posts=[];window.reads=0;window.delta=0;
    window.fetch=async(url,options={})=>{
      let data;
      if(url.includes('/creditare')){
        window.reads++;
        if(window.failure)return new Response(JSON.stringify({error:'Documentele nu se reconciliaza'}),{status:422});
        const scheme=window.fixture.creditScheme||completeCreditScheme();
        const nets=[2699,2574,2721,2699],taxes=[1719,1926,1696,1718];
        const names=['ABUNEI ANDREI-RAZVAN','ABUNEI ELENA','NICORICI MIHAELA','VASILACHE FLORENTINA'];
        data={period:'2026-09',scheme,warnings:[],actual:names.map((name,i)=>({name,netCents:nets[i]*100+(i===0?window.delta:0),contributionsCents:taxes[i]*100})),sources:{stat:{id:'stat-1',name:'Stat.pdf'},centralizator:{id:'centralizator-1',name:'Centralizator.pdf'}}};
      }else if(options.body instanceof FormData){
        const task=options.body.get('task');window.delta=10000;
        const asset={id:task+'-2',task,name:'Nou.pdf',type:'application/pdf',createdAt:'2026-10-13T10:00:00Z',kind:'upload'};
        window.fixture={...window.fixture,version:window.fixture.version+1,assets:[...window.fixture.assets,asset]};data={state:window.fixture,asset};
      }else if(options.method==='POST'){
        window.fixture={...JSON.parse(options.body).state,version:window.fixture.version+1};window.posts.push(window.fixture);data={state:window.fixture};
      }else data={state:window.fixture,examples:[]};
      return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
    };
    createRoot(document.getElementById('root')).render(React.createElement(Workflow,{firmaId:'mock',lunaId:'test-month',luna:'2026-10'}));
  `)
  await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,entry:path.join(dir,'entry.js'),output:{path:dir,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules')],alias:{
    '@/components/proiect/PurchaseForm.module.css$':path.join(dir,'css.js'),'./RutinaLunii.module.css$':path.join(dir,'css.js'),'./CreditProposal.module.css$':path.join(dir,'css.js'),
    '@/lib/vizualizare$':path.join(dir,'stub.js'),'@/components/ui/VeziButon$':path.join(dir,'stub.js'),'next/link$':path.join(dir,'stub.js'),'@':root,
  }},module:{rules:[{test:/\.tsx?$/,use:path.join(dir,'loader.cjs')}]}},(error,stats)=>error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()))
  const playwright=require(process.env.PLAYWRIGHT_PATH||'/Users/razvanabunei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
  for(const engine of ['chromium','webkit']){
    const browser=await playwright[engine].launch({headless:true})
    try{
      const page=await browser.newPage({viewport:{width:1180,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message))
      await page.setContent(`<style>:root{--surface:#fff;--surface-secondary:#f1f5f3;--surface-sunken:#f4f6f5;--border:#d6dfda;--border-subtle:#d6dfda;--border-strong:#aabbaf;--accent:#00865c;--accent-solid:#00865c;--accent-soft:#e8f7f0;--text-primary:#202826;--text-secondary:#65756a;--success:#00865c;--success-soft:#e8f7f0;--warning:#af7000;--danger:#bd2222;--r-lg:14px;--r-md:10px;--fs-xs:12px;--fs-sm:13px;--fs-md:14px;--fs-base:16px;--fs-lg:18px}*{box-sizing:border-box}body{font-family:Arial;margin:24px;background:#f7f9f8;color:var(--text-primary)}button,input,textarea,select{font:inherit}.btn{padding:8px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;background:white}.btn-primary{background:var(--accent);color:white}${styles}</style><div id="root"></div>`)
      await page.addScriptTag({content:fs.readFileSync(path.join(dir,'bundle.js'),'utf8')})
      const section=page.getByRole('region',{name:'Calculul creditării'}),amount=section.locator('.amount')
      await section.getByText('1.216,00 lei de creditat',{exact:true}).waitFor()
      assert.equal(await section.locator('tbody tr').count(),4)
      assert.match(await section.innerText(),/397,00 lei diferență salarii \+ 819,00 lei diferență contribuții/)
      assert.equal(await page.evaluate(()=>window.posts.length),0)
      await section.screenshot({path:'/tmp/contaflow-credit-'+engine+'-initial.png'})
      assert.match(await section.getByRole('link',{name:'Stat.pdf',exact:true}).getAttribute('href'),/id=stat-1/)
      await section.locator('summary').click()
      const net=section.getByLabel('Net bază ABUNEI ELENA',{exact:true});await net.fill('2575')
      await section.getByText('1.215,00 lei de creditat',{exact:true}).waitFor()
      const header=page.locator('button[aria-expanded]').filter({hasText:'Creditarea contului de grant'})
      await header.click();await header.click();assert.equal(await net.inputValue(),'2575')
      const save=section.getByRole('button',{name:'Păstrează baza pentru luna următoare'})
      assert.equal(await save.isDisabled(),true)
      await section.getByRole('checkbox').check();await save.click()
      await page.waitForFunction(()=>window.posts.length===1)
      assert.equal(await page.evaluate(()=>window.fixture.tasks.creditare.status),'lipsa')
      assert.equal(await page.evaluate(()=>window.fixture.creditScheme.rows.find(row=>row.name==='ABUNEI ELENA').netCents),257500)
      await page.locator('button[aria-expanded]').filter({hasText:'Centralizator contribuții'}).click()
      const previousReads=await page.evaluate(()=>window.reads)
      await page.getByLabel('Încarcă Centralizator contribuții',{exact:true}).setInputFiles({name:'Central-new.pdf',mimeType:'application/pdf',buffer:Buffer.from('fixture')})
      await page.waitForFunction(count=>window.reads>count,previousReads)
      await section.getByText('1.315,00 lei de creditat',{exact:true}).waitFor()
      assert.equal(await section.getByRole('checkbox').isChecked(),false)
      await page.evaluate(()=>window.failure=true);await section.getByRole('button',{name:'Recalculează'}).click()
      await section.getByRole('alert').filter({hasText:'Documentele nu se reconciliaza'}).waitFor();assert.equal(await amount.count(),0)
      await page.evaluate(()=>window.failure=false);await section.getByRole('button',{name:'Recalculează'}).click()
      await section.getByText('1.315,00 lei de creditat',{exact:true}).waitFor()
      await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow')
      await page.screenshot({path:'/tmp/contaflow-credit-'+engine+'-mobile.png',fullPage:true})
      await page.setViewportSize({width:1180,height:1000})
      await page.screenshot({path:'/tmp/contaflow-credit-'+engine+'.png',fullPage:true})
      await page.addStyleTag({content:':root{--surface:#141414;--text-primary:#eee;--text-secondary:#bbb;--border:#444;--accent:#34d399}body{background:#111}'});
      assert.deepEqual(errors,[])
      console.log(engine+': automatic calculation, full baseline, breakdown, editable basis, collapse persistence, autosave without payment, new-upload refresh, safe errors, mobile and dark theme PASS')
    }finally{await browser.close()}
  }
}
main().catch(error=>{console.error(error);process.exitCode=1})
