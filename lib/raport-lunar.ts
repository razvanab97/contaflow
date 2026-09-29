export type MonthlyTransaction = {
  data_tranzactie:string|null
  tip:string|null
  suma:number|string|null
  valuta:string|null
  categorie:string|null
}
type Side = {total:number;by_categorie:Record<string,number>}
export type CurrencyFlow = {incasari:Side;cheltuieli:Side;net:number}
export type PeriodException = {luna:string;valuta:string;numar:number;incasari:number;plati:number}

const amount=(cents:number)=>Math.round(cents)/100
const emptySide=():{total:number;by_categorie:Record<string,number>}=>({total:0,by_categorie:{}})

export function accountingMonth(workMonth:string):string {
  const match=workMonth.match(/^(20\d{2})-(0[1-9]|1[0-2])(?:-\d{2})?$/)
  if(!match)throw new Error('Luna contabilă nu este validă')
  return new Date(Date.UTC(Number(match[1]),Number(match[2])-2,1)).toISOString().slice(0,7)
}

export function calculateMonthlyFlow(rows:MonthlyTransaction[],period:string){
  const cents:Record<string,{incasari:{total:number;by_categorie:Record<string,number>};cheltuieli:{total:number;by_categorie:Record<string,number>}}>= {}
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
    const category=String(tx.categorie||'necategorizate').trim()||'necategorizate'
    cents[valuta][side].total+=sumCents
    cents[valuta][side].by_categorie[category]=(cents[valuta][side].by_categorie[category]||0)+sumCents
    included++
  }
  const flux:Record<string,CurrencyFlow>={}
  for(const [valuta,data] of Object.entries(cents)){
    const convert=(side:{total:number;by_categorie:Record<string,number>}):Side=>({
      total:amount(side.total),
      by_categorie:Object.fromEntries(Object.entries(side.by_categorie).map(([key,value])=>[key,amount(value)])),
    })
    flux[valuta]={incasari:convert(data.incasari),cheltuieli:convert(data.cheltuieli),net:amount(data.incasari.total-data.cheltuieli.total)}
  }
  const offPeriod:PeriodException[]=[...exceptions.values()].map(item=>({...item,incasari:amount(item.incasari),plati:amount(item.plati)})).sort((a,b)=>a.luna.localeCompare(b.luna)||a.valuta.localeCompare(b.valuta))
  return {flux,included,invalid,offPeriod}
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
