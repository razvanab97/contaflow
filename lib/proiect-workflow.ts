// Regulile sunt ținte interne editabile, nu termene contractuale confirmate.
export type Rule = { day: number; offset: number; frequency: 'monthly' | 'annual' | 'manual'; month: number }
export type Step = 'lipsa' | 'primit' | 'semnat' | 'trimis' | 'acceptat' | 'neaplicabil' | 'initiat' | 'avizat' | 'executat'
export const STEP_LABELS: Record<Step,string> = { initiat:'Plată inițiată', avizat:'Plată avizată', executat:'Plată executată', lipsa:'De pregătit', primit:'Primit / pregătit', semnat:'Semnat / verificat', trimis:'Trimis', acceptat:'Acceptat / încheiat', neaplicabil:'Nu se aplică' }
export const TASKS = [
  { key:'stat', title:'Stat de plată', source:'Orieda', day:8, action:'Solicită statul de plată pentru perioada raportată.' },
  { key:'pontaj', title:'Pontaj', source:'Orieda / administrator', day:8, action:'Completează și verifică pontajul tuturor angajaților.' },
  { key:'reges', title:'Extrase REGES', source:'REGES', day:8, action:'Adaugă extrasele tuturor angajaților, emise în aceeași zi.' },
  { key:'centralizator', title:'Centralizator contribuții', source:'Orieda', day:8, action:'Obține centralizatorul semnat de administrator și contabil.' },
  { key:'creditare', title:'Creditarea contului de grant', source:'Bancă / Prosocial', day:15, action:'Confirmă suma comunicată pentru această lună, efectuează creditarea și adaugă dovada.', depends:['stat','pontaj','reges','centralizator'] },
  { key:'salarii', title:'Plata salariilor și contribuțiilor', source:'Bancă / Prosocial', day:20, action:'După avizare, verifică executarea plăților și transmite dovezile. Inițierea nu înseamnă plată executată.', depends:['creditare'] },
  { key:'balanta', title:'Balanță de verificare', source:'Orieda', day:18, action:'Solicită balanța lunii și verifică semnăturile necesare.' },
  { key:'registru', title:'Registru jurnal', source:'Orieda', day:18, action:'Solicită registrul jurnal pentru perioada raportată.' },
  { key:'extras', title:'Extrase bancare', source:'Bancă', day:18, action:'Descarcă extrasele perioadei pentru contul de grant și contul curent.' },
  { key:'raport', title:'Raport lunar — Anexa 5', source:'Administrator → Prosocial', day:18, action:'Completează formularul lunii, generează Word, semnează și transmite raportul.' },
  { key:'chirie', title:'Plata chiriei', source:'Bancă / contract de închiriere', day:1, action:'Verifică chiria netă și impozitul separat. Adaugă dovada plății și confirmă executarea.' },
  { key:'orieda', title:'Dosarul pentru contabilitate', source:'Administrator → Orieda', day:15, action:'Trimite facturile, extrasele și documentele lunii către contabilitate.' },
  { key:'ajofm', title:'Raportarea anuală AJOFM', source:'Administrator → AJOFM', day:31, action:'Verifică termenul și formularul aplicabile anului curent; apoi pregătește raportarea anuală.' },
] as const
export type TaskKey = typeof TASKS[number]['key']
export type TaskState = { status:Step; due:string | null; note:string }
export type Asset = { id:string; task:string; name:string; type:string; createdAt:string; kind:'upload'|'generated' }
export type Line = { supplier:string; product:string; specs:string; unit:string; qty:string; price:string; currency:string; rate:string; source:string; date:string }
export type Draft = { fields:Record<string,string>; lines:Line[] }
export type Workflow = { version:number; updatedAt:string; profile:Record<string,string>; rules:Record<string,Rule>; tasks:Record<string,TaskState>; forms:Record<string,Draft>; assets:Asset[] }
export const PROFILE_FIELDS = { beneficiar:'Beneficiar', reprezentant:'Reprezentant legal', cui:'CUI', onrc:'Nr. Registrul Comerțului', adresa:'Sediu social', contract_subventie:'Contract de subvenție (număr / dată)', caen:'Activitate / CAEN' }
export function emptyWorkflow():Workflow { return {version:0,updatedAt:'',profile:{beneficiar:'AB TEXTILE S.R.L.',reprezentant:'Abunei Elena',cui:'52575850',caen:'CAEN 9610 — Spălarea și curățarea articolelor textile și a produselor din blană'},rules:Object.fromEntries(TASKS.map(t=>[t.key,{day:t.day,offset:0,frequency:t.key==='ajofm'?'annual':'monthly',month:3}])),tasks:{},forms:{},assets:[]} }
export function dueDate(workMonth:string, rule:Rule):string|null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(workMonth)) throw new Error('Lună invalidă')
  if (rule.frequency==='manual') return null
  const [y,m]=workMonth.split('-').map(Number)
  if (rule.frequency==='annual' && m!==rule.month) return null
  const base=new Date(Date.UTC(y,m-1+rule.offset,1))
  const last=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0)).getUTCDate()
  base.setUTCDate(Math.min(rule.day,last))
  return base.toISOString().slice(0,10)
}
export function initialMonth(month:string, settings:Workflow):Workflow {
  return {...emptyWorkflow(),profile:{...settings.profile},rules:{...settings.rules},tasks:Object.fromEntries(TASKS.map(t=>[t.key,{status:'lipsa',due:dueDate(month,settings.rules[t.key]),note:''}]))}
}
export function activeTasks(state:Workflow, month:string) { return TASKS.filter(t=>state.rules[t.key]?.frequency!=='annual'||Number(month.slice(5,7))===state.rules[t.key].month||state.tasks[t.key]?.due) }
export function blockedBy(key:string, state:Workflow):string[] {
  const task=TASKS.find(t=>t.key===key)
  const dependencies=task && 'depends' in task ? task.depends : []
  return dependencies.filter(k=>!(k==='creditare'?['executat','trimis','acceptat','neaplicabil']:['semnat','trimis','acceptat','neaplicabil']).includes(state.tasks[k]?.status)).map(k=>TASKS.find(t=>t.key===k)!.title)
}
export function nextTask(state:Workflow, month:string) {
  return [...activeTasks(state,month)].filter(t=>!['trimis','acceptat','neaplicabil'].includes(state.tasks[t.key]?.status)&&!blockedBy(t.key,state).length).sort((a,b)=>(state.tasks[a.key]?.due||'9999').localeCompare(state.tasks[b.key]?.due||'9999'))[0]
}
export type FormKind='raport'|'oferta'|'nota'|'receptie'|'restituire'
export const FORM_LABELS:Record<FormKind,string>={raport:'Raport lunar — Anexa 5',oferta:'Cerere de ofertă',nota:'Notă de estimare — Anexa 1',receptie:'Proces-verbal de recepție — Anexa 3',restituire:'Restituire surse proprii — Anexa 4'}
export const FORM_FIELDS:Record<FormKind,Record<string,string>>={
 raport:{perioada:'Perioada raportată',data:'Data documentului',autorizatii:'Autorizații și stadiu',obiective:'Obiective realizate',vulnerabili:'Număr persoane vulnerabile',personal_vulnerabil:'Nume, funcții și date angajare — persoane vulnerabile',alti_angajati:'Număr alți angajați',personal:'Nume, funcții și date angajare — alți angajați',plecari:'Demisii / concedieri (sau „Nu este cazul”)',activitati:'Activități desfășurate'},
 oferta:{numar:'Număr cerere',data:'Data documentului',achizitie:'Denumire achiziție conform bugetului',tip:'Tip: Produse / Servicii / Lucrări',furnizor:'Denumire juridică furnizor',adresa_furnizor:'Adresa furnizorului',identificare_furnizor:'CUI / ONRC furnizor',conditii:'Condiții, termen ofertă, livrare și garanție'},
 nota:{numar:'Număr notă',data:'Data documentului',achizitie:'Denumire achiziție conform bugetului',tip:'Tip: Produse / Servicii / Lucrări',justificare:'Oferta selectată, valoarea și justificarea alegerii'},
 receptie:{comanda_online:'Comandă online (da / nu)',numar:'Număr proces-verbal',data:'Data recepției',furnizor:'Denumire juridică furnizor',reprezentant_furnizor:'Reprezentant furnizor / comandă online',referinta:'Contract / factură (număr și dată)',constatari:'Ce s-a livrat / prestat, constatări și anexe (garanții, fotografii, punere în funcțiune)'},
 restituire:{data:'Data cererii',suma:'Suma de restituit (lei)',data_transfer:'Data transferului din surse proprii',scop:'Cheltuiala finanțată temporar'},
}
export const emptyLine=():Line=>({supplier:'',product:'',specs:'',unit:'buc',qty:'1',price:'',currency:'RON',rate:'1',source:'',date:''})
export function defaultDraft(kind:FormKind, month?:string):Draft {
 const fields:Record<string,string>=kind==='receptie'?{comanda_online:'nu'}:{}
 if(kind==='raport'&&month){const [y,m]=month.split('-').map(Number);const end=new Date(Date.UTC(y,m-1,0));const mm=String(end.getUTCMonth()+1).padStart(2,'0');fields.perioada=`01.${mm}.${end.getUTCFullYear()} – ${end.getUTCDate()}.${mm}.${end.getUTCFullYear()}`}
 return {fields,lines:['nota','oferta','receptie'].includes(kind)?[emptyLine()]:[]}
}
export function validateDraft(kind:FormKind,draft:Draft,profile:Record<string,string>):string[] {
 const missing=Object.entries(FORM_FIELDS[kind]).filter(([k])=>!draft.fields[k]?.trim()).map(([,v])=>v)
 for(const k of ['beneficiar','reprezentant',...(kind==='restituire'?['cui','onrc','adresa','contract_subventie']:[]),...(kind==='raport'?['caen']:[])])if(!profile[k]?.trim())missing.push(PROFILE_FIELDS[k as keyof typeof PROFILE_FIELDS])
 if(['nota','oferta','receptie'].includes(kind)) {
 if(!draft.lines.length)missing.push('Cel puțin un produs / serviciu')
 draft.lines.forEach((l,i)=>{if(!l.product.trim()||!l.specs.trim()||!Number.isFinite(Number(l.qty))||Number(l.qty)<=0)missing.push(`Poziția ${i+1}: produs, specificații și cantitate pozitivă`);if(kind!=='oferta'&&(!l.price.trim()||!Number.isFinite(Number(l.price))||Number(l.price)<0||!Number.isFinite(Number(l.rate))||Number(l.rate)<=0))missing.push(`Poziția ${i+1}: preț și curs valide`);if(kind==='nota'&&(!l.supplier.trim()||!l.source.trim()||!l.date.trim()))missing.push(`Poziția ${i+1}: furnizor, sursă și dată ofertă`)})
 }
 if(kind==='restituire'&&(!Number.isFinite(Number(draft.fields.suma))||Number(draft.fields.suma)<=0))missing.push('Suma trebuie să fie pozitivă')
 return missing
}

export const LEGACY_GROUPS:Record<string,string[]>={
 'obligatie.reges':['stat','pontaj','reges','centralizator'],
 'obligatie.salarii_op':['creditare','salarii'],
 'obligatie.acte_contabile':['balanta','registru'],
 'obligatie.extras_cont':['extras'],
 'obligatie.raport_proiect':['raport'],
 'obligatie.acte_orieda':['orieda'],
}
