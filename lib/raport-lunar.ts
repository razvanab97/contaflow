export type MonthlyTransaction = {
  id?:string|null
  extras_id?:string|null
  data_tranzactie:string|null
  tip:string|null
  suma:number|string|null
  valuta:string|null
  categorie:string|null
  descriere?:string|null
  descriere_curatata?:string|null
  referinta?:string|null
}
type Side = {total:number;by_categorie:Record<string,number>}
export type CurrencyFlow = {incasari:Side;cheltuieli:Side;net:number}
export type PeriodException = {luna:string;valuta:string;numar:number;incasari:number;plati:number}
export type ReportEntry = {id:string;data_tranzactie:string;tip:'credit'|'debit';suma:number;valuta:string;categorie:string;descriere:string;referinta:string}
export type CategoryRank = {categorie:string;total:number;numar:number;procent:number}
export type CurrencyAnalysis = {
  numarIncasari:number
  numarPlati:number
  transferuriIn:number
  transferuriOut:number
  schimbValutarIn:number
  schimbValutarOut:number
  platiAnalizate:number
  fluxFaraMiscariInterne:number
  topCheltuieli:CategoryRank[]
  neclasificate:{total:number;numar:number;procent:number}
}

const amount=(cents:number)=>Math.round(cents)/100
const emptySide=():{total:number;by_categorie:Record<string,number>}=>({total:0,by_categorie:{}})

export function accountingMonth(workMonth:string):string {
  const match=workMonth.match(/^(20\d{2})-(0[1-9]|1[0-2])(?:-\d{2})?$/)
  if(!match)throw new Error('Luna contabilă nu este validă')
  return new Date(Date.UTC(Number(match[1]),Number(match[2])-2,1)).toISOString().slice(0,7)
}

export function calculateMonthlyFlow(rows:MonthlyTransaction[],period:string){
  const cents:Record<string,{incasari:{total:number;by_categorie:Record<string,number>};cheltuieli:{total:number;by_categorie:Record<string,number>}}>= {}
  const counts:Record<string,{incasari:Record<string,number>;cheltuieli:Record<string,number>;numarIncasari:number;numarPlati:number}>={}
  const transactions:ReportEntry[]=[]
  const exceptions=new Map<string,{luna:string;valuta:string;numar:number;incasari:number;plati:number}>()
  let included=0,invalid=0
  for(const tx of rows){
    const date=String(tx.data_tranzactie||'')
    const sum=Number(tx.suma)
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||tx.suma===null||tx.suma===''||!Number.isFinite(sum)||sum<0||!['credit','debit'].includes(String(tx.tip))){
      invalid++
      continue
    }
    const valuta=String(tx.valuta||'necunoscută').toUpperCase()
    const sumCents=Math.round(sum*100)
    const side=tx.tip==='credit'?'incasari':'cheltuieli'
    if(date.slice(0,7)!==period){
      const luna=date.slice(0,7),key=luna+'|'+valuta
      const item=exceptions.get(key)||{luna,valuta,numar:0,incasari:0,plati:0}
      item.numar++;item[tx.tip==='credit'?'incasari':'plati']+=sumCents;exceptions.set(key,item)
      continue
    }
    if(!cents[valuta])cents[valuta]={incasari:emptySide(),cheltuieli:emptySide()}
    if(!counts[valuta])counts[valuta]={incasari:{},cheltuieli:{},numarIncasari:0,numarPlati:0}
    const descriere=String(tx.descriere_curatata||tx.descriere||'Fără descriere').trim()||'Fără descriere'
    // Schimbul între monede este flux bancar, dar nu cheltuială operațională.
    const category=/\bschimb\s+valutar\b/i.test([tx.descriere_curatata,tx.descriere].filter(Boolean).join(' '))?'schimb_valutar':String(tx.categorie||'necategorizate').trim()||'necategorizate'
    cents[valuta][side].total+=sumCents
    cents[valuta][side].by_categorie[category]=(cents[valuta][side].by_categorie[category]||0)+sumCents
    counts[valuta][side][category]=(counts[valuta][side][category]||0)+1
    counts[valuta][side==='incasari'?'numarIncasari':'numarPlati']++
    transactions.push({
      id:String(tx.id||included),data_tranzactie:date,tip:tx.tip as 'credit'|'debit',
      suma:amount(sumCents),valuta,categorie:category,
      descriere,
      referinta:String(tx.referinta||'').trim(),
    })
    included++
  }
  const flux:Record<string,CurrencyFlow>={}
  const analiza:Record<string,CurrencyAnalysis>={}
  for(const [valuta,data] of Object.entries(cents)){
    const convert=(side:{total:number;by_categorie:Record<string,number>}):Side=>({
      total:amount(side.total),
      by_categorie:Object.fromEntries(Object.entries(side.by_categorie).map(([key,value])=>[key,amount(value)])),
    })
    flux[valuta]={incasari:convert(data.incasari),cheltuieli:convert(data.cheltuieli),net:amount(data.incasari.total-data.cheltuieli.total)}
    const transferuriIn=data.incasari.by_categorie.transfer||0
    const transferuriOut=data.cheltuieli.by_categorie.transfer||0
    const schimbValutarIn=data.incasari.by_categorie.schimb_valutar||0
    const schimbValutarOut=data.cheltuieli.by_categorie.schimb_valutar||0
    const platiAnalizate=data.cheltuieli.total-transferuriOut-schimbValutarOut
    const topCheltuieli=Object.entries(data.cheltuieli.by_categorie)
      .filter(([categorie])=>categorie!=='transfer'&&categorie!=='schimb_valutar')
      .map(([categorie,total])=>({
        categorie,total:amount(total),numar:counts[valuta].cheltuieli[categorie],
        procent:platiAnalizate?Math.round(total/platiAnalizate*1000)/10:0,
      }))
      .sort((a,b)=>b.total-a.total||a.categorie.localeCompare(b.categorie))
    const neclasificateCents=(data.cheltuieli.by_categorie.altele||0)+(data.cheltuieli.by_categorie.necategorizate||0)
    const neclasificateCount=(counts[valuta].cheltuieli.altele||0)+(counts[valuta].cheltuieli.necategorizate||0)
    analiza[valuta]={
      numarIncasari:counts[valuta].numarIncasari,
      numarPlati:counts[valuta].numarPlati,
      transferuriIn:amount(transferuriIn),
      transferuriOut:amount(transferuriOut),
      schimbValutarIn:amount(schimbValutarIn),
      schimbValutarOut:amount(schimbValutarOut),
      platiAnalizate:amount(platiAnalizate),
      fluxFaraMiscariInterne:amount(data.incasari.total-transferuriIn-schimbValutarIn-platiAnalizate),
      topCheltuieli,
      neclasificate:{
        total:amount(neclasificateCents),
        numar:neclasificateCount,
        procent:platiAnalizate?Math.round(neclasificateCents/platiAnalizate*1000)/10:0,
      },
    }
  }
  transactions.sort((a,b)=>b.data_tranzactie.localeCompare(a.data_tranzactie)||b.id.localeCompare(a.id))
  const offPeriod:PeriodException[]=[...exceptions.values()].map(item=>({...item,incasari:amount(item.incasari),plati:amount(item.plati)})).sort((a,b)=>a.luna.localeCompare(b.luna)||a.valuta.localeCompare(b.valuta))
  return {flux,analiza,transactions,included,invalid,offPeriod}
}

export function mergeTransactionsById(...groups:MonthlyTransaction[][]):MonthlyTransaction[]{
  const byId=new Map<string,MonthlyTransaction>()
  const withoutId:MonthlyTransaction[]=[]
  for(const tx of groups.flat()){
    if(tx.id)byId.set(tx.id,tx)
    else withoutId.push(tx)
  }
  return [...byId.values(),...withoutId]
}

export async function collectPaged<T>(load:(start:number,end:number)=>Promise<{data:T[]|null;error:{message:string}|null}>,pageSize=1000):Promise<T[]> {
  const result:T[]=[]
  for(let start=0;;start+=pageSize){
    const {data,error}=await load(start,start+pageSize-1)
    if(error)throw new Error(error.message)
    result.push(...(data||[]))
    if(!data||data.length<pageSize)return result
  }
}
