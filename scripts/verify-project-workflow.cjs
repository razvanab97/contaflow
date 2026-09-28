const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');const out=fs.mkdtempSync(require('os').tmpdir()+'/contaflow-workflow-');fs.mkdirSync(out,{recursive:true});
const swc=require(root+'/node_modules/next/dist/build/swc');
(async()=>{
await swc.loadBindings();
for(const name of ['proiect-workflow','proiect-generate','proiect-workflow-store']){
 let src=fs.readFileSync(`${root}/lib/${name}.ts`,'utf8').replaceAll("'@/lib/proiect-workflow'","'./proiect-workflow.cjs'").replaceAll("'@/lib/proiect-templates.json'","'./proiect-templates.json'").replace("import { getServiceSupabase } from '@/lib/supabase/server'","const {getServiceSupabase}=require('./sb.cjs')");
 src=src.replace("from 'jszip'","from '"+root+"/node_modules/jszip'");
 const result=await swc.transform(src,{filename:name+'.ts',jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}});fs.writeFileSync(`${out}/${name}.cjs`,result.code);
}
fs.copyFileSync(`${root}/lib/proiect-templates.json`,out+'/proiect-templates.json');
fs.writeFileSync(out+'/sb.cjs',`const {createClient}=require('${root}/node_modules/@supabase/supabase-js'); let client; exports.getServiceSupabase=()=>client??=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);`);
const w=require(out+'/proiect-workflow.cjs');const {generateProjectDoc}=require(out+'/proiect-generate.cjs');
assert.equal(w.dueDate('2026-02',{day:31,offset:0,frequency:'monthly',month:3}),'2026-02-28');
assert.equal(w.dueDate('2028-02',{day:31,offset:0,frequency:'monthly',month:3}),'2028-02-29');
assert.equal(w.dueDate('2026-12',{day:1,offset:1,frequency:'monthly',month:3}),'2027-01-01');
const state=w.initialMonth('2026-09',w.emptyWorkflow());assert.equal(w.activeTasks(state,'2026-09').length,12);assert.equal(w.activeTasks(w.initialMonth('2026-03',w.emptyWorkflow()),'2026-03').length,13);
assert.equal(w.defaultDraft('raport','2026-01').fields.perioada,'01.12.2025 – 31.12.2025');
assert.equal(w.nextTask(state,'2026-09').key,'chirie');assert.equal(w.blockedBy('creditare',state).length,4);
state.tasks.creditare.status='initiat';assert.equal(w.blockedBy('salarii',state).length,1);state.tasks.creditare.status='executat';assert.equal(w.blockedBy('salarii',state).length,0);
assert(!Object.keys(w.FORM_LABELS).some(k=>/transa|anexa.?7/.test(k)));
const profile={...w.emptyWorkflow().profile,onrc:'J22/123/2025',adresa:'Iași — adresă de test',contract_subventie:'123 / 01.01.2026'};
const sample={comanda_online:'nu',perioada:'01.08.2026 – 31.08.2026',data:'28.09.2026',autorizatii:'Autorizațiile sunt în curs de obținere.',obiective:'Pregătirea spațiului de lucru.',vulnerabili:'2',personal_vulnerabil:'Persoană test A — operator, angajată la 01.01.2026.\nPersoană test B — operator, angajată la 01.01.2026.',alti_angajati:'2',personal:'Persoană test C — manager.\nPersoană test D — asistent.',plecari:'Nu este cazul.',activitati:'Testarea echipamentelor.\nInstruirea personalului.',numar:'TEST 1',achizitie:'Echipamente și materiale',tip:'Produse',furnizor:'Furnizor & Test SRL',adresa_furnizor:'Strada Exemplu nr. 1',identificare_furnizor:'CUI 12345678',conditii:'Prețuri fără TVA. Transport indicat separat. Valabilitate ofertă 30 zile.',justificare:'Oferta Furnizor Test SRL, 1.050,00 lei fără TVA, respectă specificațiile tehnice și termenul de livrare.',reprezentant_furnizor:'Reprezentant test',referinta:'Factura TEST 123 / 28.09.2026',constatari:'Produsele au fost livrate și verificate. Se anexează documentele de garanție și fotografiile.',suma:'1050',data_transfer:'25.09.2026',scop:'Achiziția echipamentelor prevăzute în buget'};
const JSZip=require(root+'/node_modules/jszip');
for(const kind of Object.keys(w.FORM_LABELS)){
 const draft={fields:sample,lines:['oferta','nota','receptie'].includes(kind)?[{...w.emptyLine(),supplier:'Furnizor & Test SRL',product:'Echipament test',specs:'Capacitate 10 kg; produs nou.',qty:'2',price:'100',currency:'EUR',rate:'5.25',source:'https://example.com/produs',date:'25.09.2026'}]:[]};
 assert.deepEqual(w.validateDraft(kind,draft,profile),[]);
 const buffer=await generateProjectDoc(kind,draft,profile);fs.writeFileSync(`${out}/${kind}.docx`,buffer);const zip=await JSZip.loadAsync(buffer);const xml=await zip.file('word/document.xml').async('string');assert(!/%%\w+%%/.test(xml));assert(!xml.includes('Vasilache'));assert(!xml.includes('Necesar retea electrica'));if(kind==='nota'){assert(xml.includes('525,00'));assert(xml.includes('1.050,00'));assert(xml.includes('&amp;'))}
}
assert(w.validateDraft('nota',{fields:sample,lines:[{...w.emptyLine(),qty:'NaN'}]},profile).length>0);
console.log('Documente de verificare: '+out);
console.log('PASS: termene, an bisect, trecere de an, AJOFM anual, dependențe plăți, perioadă raportată, validare și 5 documente Word.');
if(process.argv.includes('--storage')){
process.loadEnvFile(root+'/.env.local');const st=require(out+'/proiect-workflow-store.cjs');const sb=require(out+'/sb.cjs').getServiceSupabase();const prefix='3227c6f6-a998-4fdd-aae6-a632bc8639f7/workflow/test-'+crypto.randomUUID();
try{
assert.equal((await st.readWorkflow(prefix)).version,0);const a=await st.writeWorkflow(prefix,w.emptyWorkflow(),0);assert.equal(a.version,1);const results=await Promise.allSettled([st.writeWorkflow(prefix,{...a,profile:{beneficiar:'TEST A'}},1),st.writeWorkflow(prefix,{...a,profile:{beneficiar:'TEST B'}},1)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);assert.equal((await st.readWorkflow(prefix)).version,2);const old=await sb.storage.from('documente').download(prefix+'/revisions/0000000001.json');assert.equal(JSON.parse(await old.data.text()).profile.beneficiar,'AB TEXTILE S.R.L.');console.log('PASS: salvare reală în Supabase, recitire, versiuni păstrate, conflict concurent 409.');
}finally{const {data}=await sb.storage.from('documente').list(prefix+'/revisions');if(data?.length){const {error}=await sb.storage.from('documente').remove(data.map(x=>prefix+'/revisions/'+x.name));if(error)throw error}console.log('Datele temporare de verificare au fost eliminate.');}
}
})().catch(e=>{console.error(e);process.exit(1)});
