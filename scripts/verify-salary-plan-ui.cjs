const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {webpack}=require('next/dist/compiled/webpack/webpack'),root=path.resolve(__dirname,'..')
async function main(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'contaflow-salary-ui-')),css=fs.readFileSync(path.join(root,'components/proiect/CreditProposal.module.css'),'utf8')
  const classes=Object.fromEntries([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(match=>[match[1],match[1]]))
  fs.writeFileSync(path.join(dir,'css.js'),`module.exports={__esModule:true,default:${JSON.stringify(classes)}}`)
  fs.writeFileSync(path.join(dir,'loader.cjs'),`module.exports=function(source){return require(${JSON.stringify(require.resolve('next/dist/build/swc'))}).transformSync(source,{filename:this.resourcePath,jsc:{parser:{syntax:'typescript',tsx:this.resourcePath.endsWith('.tsx')},transform:{react:{runtime:'automatic'}},target:'es2022'},module:{type:'commonjs'}}).code}`)
  fs.writeFileSync(path.join(dir,'entry.js'),`
    const React=require('react'),{createRoot}=require('react-dom/client');
    const Plan=require(${JSON.stringify(path.join(root,'components/proiect/SalaryPaymentPlan.tsx'))}).default;
    window.delta=0;window.reads=0;window.copied='';
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copied=text}});
    window.fetch=async()=>{
      window.reads++;
      if(window.failure)return new Response(JSON.stringify({error:'Statul nu corespunde lunii'}),{status:422});
      const names=['ABUNEI ELENA','ABUNEI ANDREI-RAZVAN','NICORICI MIHAELA','VASILACHE FLORENTINA'],nets=[2574,2699,2721,2699];
      return new Response(JSON.stringify({period:'2026-09',netCents:1069300+window.delta,contributionsCents:705900,warnings:[],stat:{id:'stat-1',name:'Stat.pdf'},rows:names.map((name,i)=>({name,amountCents:nets[i]*100+(i===0?window.delta:0),description:'Salariu septembrie 2026',reference:window.missing&&i===0?undefined:{assetId:'source-'+i,assetName:'OP.pdf',scope:'month-prior',payment:{name,iban:'RO00TEST0000000000000000',bank:'Test Bank',amountCents:250000,period:'2026-08',processedOn:'2026-09-22',yearInferred:true}}}))}),{headers:{'Content-Type':'application/json'}});
    };
    function App(){const [assets,setAssets]=React.useState([{id:'stat-1',task:'stat',createdAt:'2026-10-13'}]);return React.createElement(React.Fragment,null,React.createElement('button',{onClick:()=>{window.delta=100;setAssets([...assets,{id:'stat-2',task:'stat',createdAt:'2026-10-14'}])}},'Simuleaza stat nou'),React.createElement(Plan,{url:'/api/proiect-workflow/plata-salarii?scope=month-current',assets,documentUrl:(scope,id)=>'/document?scope='+scope+'&id='+id}))}
    createRoot(document.getElementById('root')).render(React.createElement(App));
  `)
  await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,entry:path.join(dir,'entry.js'),output:{path:dir,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules')],alias:{'./CreditProposal.module.css$':path.join(dir,'css.js'),'@':root}},module:{rules:[{test:/\.tsx?$/,use:path.join(dir,'loader.cjs')}]}},(error,stats)=>error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()))
  const playwright=require(process.env.PLAYWRIGHT_PATH||'/Users/razvanabunei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
  for(const engine of ['chromium','webkit']){
    const browser=await playwright[engine].launch({headless:true})
    try{
      const page=await browser.newPage({viewport:{width:1150,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message))
      await page.setContent(`<style>:root{--surface:#fff;--border:#ddd;--text-secondary:#666;--text-primary:#222;--accent:#00865c}*{box-sizing:border-box}body{font:15px Arial;margin:24px;background:#f8faf9}.btn{padding:10px;border:1px solid #ddd;border-radius:8px}${css}</style><div id="root"></div>`)
      await page.addScriptTag({content:fs.readFileSync(path.join(dir,'bundle.js'),'utf8')})
      const section=page.getByRole('region',{name:'Pregătirea salariilor'}),copy=section.getByRole('button',{name:'Copiază detaliile pentru ABUNEI ELENA',exact:true})
      await section.getByText('10.693,00 lei salarii nete',{exact:true}).waitFor();assert.equal(await section.locator('article').count(),4);assert.equal(await copy.isEnabled(),false)
      assert.match(await section.innerText(),/17.752,00/);assert.match(await section.innerText(),/2.500,00/)
      assert.match(await section.getByRole('link',{name:'Deschide OP-ul sursă'}).first().getAttribute('href'),/scope=month-prior/)
      await section.getByRole('checkbox').check();await copy.click();assert.match(await page.evaluate(()=>window.copied),/Suma: 2.574,00 RON/);assert.match(await page.evaluate(()=>window.copied),/Salariu septembrie 2026/)
      await page.getByRole('button',{name:'Simuleaza stat nou'}).click();await section.getByText('10.694,00 lei salarii nete',{exact:true}).waitFor();assert.equal(await section.getByRole('checkbox').isChecked(),false)
      await page.evaluate(()=>window.failure=true);await section.getByRole('button',{name:'Actualizează salariile'}).click();await section.getByRole('alert').filter({hasText:'Statul nu corespunde lunii'}).waitFor();assert.equal(await section.locator('.amount').count(),0)
      await page.evaluate(()=>{window.failure=false;window.missing=true});await section.getByRole('button',{name:'Actualizează salariile'}).click();await section.getByRole('alert').filter({hasText:'Lipsește OP-ul sursă'}).waitFor();assert.equal(await copy.count(),0)
      await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow')
      await page.screenshot({path:'/tmp/contaflow-salary-plan-'+engine+'.png',fullPage:true});assert.deepEqual(errors,[])
      console.log(engine+': current salary amounts, historical bank sources, verified clipboard preparation without transactions, upload refresh, cleared errors, missing-IBAN refusal, mobile PASS')
    }finally{await browser.close()}
  }
}
main().catch(error=>{console.error(error);process.exitCode=1})
