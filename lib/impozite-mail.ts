export type TaxPayment = {
  id:string
  sourceId:string
  label:string
  amount:number|null
  iban:string
  fiscalId:string
  recipient:string
  description:string
  due:string|null
  paid:boolean
}
export type TaxSource = {
  id:string
  name:string
  kind:'text'|'image'
  text:string
  filePath:string|null
  hash:string
  company:string
  period:string
  createdAt:string
}
export type TaxMailState = { version:number; updatedAt:string; sources:TaxSource[]; payments:TaxPayment[] }
export type ExtractedPayment = Omit<TaxPayment,'id'|'sourceId'|'paid'>
export type TaxDraft = { company:string; period:string; subjectPeriod:string; payments:ExtractedPayment[]; warnings:string[] }

const months=['IANUARIE','FEBRUARIE','MARTIE','APRILIE','MAI','IUNIE','IULIE','AUGUST','SEPTEMBRIE','OCTOMBRIE','NOIEMBRIE','DECEMBRIE']
const fold=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
export function sameTaxCompany(a:string,b:string):boolean {
  const key=(value:string)=>fold(value).replace(/\bS\s*R\s*L\b/g,'').replace(/[^A-Z0-9]/g,'')
  return !!key(a)&&key(a)===key(b)
}
export function taxPeriodKey(value:string):string {
  const match=fold(value).match(/\b([A-Z]+)\s+(20\d{2})\b/)
  const month=match?months.indexOf(match[1]):-1
  return month<0?'':match![2]+'-'+String(month+1).padStart(2,'0')
}
export function expectedTaxPeriod(workMonth:string):string {
  const match=workMonth.match(/^(20\d{2})-(0[1-9]|1[0-2])(?:-\d{2})?$/)
  if(!match)return ''
  const date=new Date(Date.UTC(Number(match[1]),Number(match[2])-2,1))
  return months[date.getUTCMonth()]+' '+date.getUTCFullYear()
}
export function taxPeriodReview(draft:TaxDraft,workMonth:string):string[] {
  const reasons:string[]=[]
  const expected=expectedTaxPeriod(workMonth),body=taxPeriodKey(draft.period),subject=taxPeriodKey(draft.subjectPeriod)
  if(!body)reasons.push('Perioada din corpul emailului lipsește sau nu poate fi citită.')
  if(draft.subjectPeriod&&!subject)reasons.push('Perioada din subiectul emailului nu poate fi citită.')
  if(body&&subject&&body!==subject)reasons.push('Subiectul indică '+draft.subjectPeriod+', iar corpul indică '+draft.period+'.')
  if(expected&&body&&body!==taxPeriodKey(expected))reasons.push('Luna de lucru '+workMonth+' corespunde obligațiilor pentru '+expected+', dar corpul indică '+draft.period+'.')
  return reasons
}

export const emptyTaxMailState=():TaxMailState=>({version:0,updatedAt:'',sources:[],payments:[]})
export const normalizeIban=(value:unknown)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'')
export function validIban(value:unknown):boolean {
  const iban=normalizeIban(value)
  if(!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban))return false
  if(iban.startsWith('RO')&&iban.length!==24)return false
  let remainder=0
  for(const c of iban.slice(4)+iban.slice(0,4)){
    const part=c>='A'&&c<='Z'?String(c.charCodeAt(0)-55):c
    for(const digit of part)remainder=(remainder*10+Number(digit))%97
  }
  return remainder===1
}
export function parseTaxAmount(value:unknown):number|null {
  if(typeof value==='number')return Number.isFinite(value)&&value>0?Math.round(value*100)/100:null
  let raw=String(value||'').replace(/[^0-9,.-]/g,'')
  if(!raw)return null
  const comma=raw.lastIndexOf(','),dot=raw.lastIndexOf('.')
  if(comma>=0&&dot>=0)raw=comma>dot?raw.replace(/\./g,'').replace(',','.'):raw.replace(/,/g,'')
  else if(comma>=0)raw=raw.replace(/\./g,'').replace(',','.')
  else if(dot>=0&&/^\d{1,3}(\.\d{3})+$/.test(raw))raw=raw.replace(/\./g,'')
  const amount=Number(raw)
  return Number.isFinite(amount)&&amount>0?Math.round(amount*100)/100:null
}
const clean=(value:unknown,max:number)=>String(value||'').trim().slice(0,max)
function validDate(value:unknown):string|null {
  const date=clean(value,10)
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null
  const stamp=Date.parse(date)
  return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===date?date:null
}
export function normalizeTaxDraft(value:unknown):TaxDraft {
  const raw=value&&typeof value==='object'?value as Record<string,unknown>:{}
  const lines=Array.isArray(raw.payments)?raw.payments:[]
  const payments=lines.slice(0,40).map(item=>{
    const row=item&&typeof item==='object'?item as Record<string,unknown>:{}
    return {
      label:clean(row.label,160),
      amount:parseTaxAmount(row.amount),
      iban:normalizeIban(row.iban).slice(0,34),
      fiscalId:clean(row.fiscalId,32).replace(/\s/g,''),
      recipient:clean(row.recipient,160),
      description:clean(row.description,300),
      due:validDate(row.due),
    }
  }).filter(row=>row.label||row.amount!==null||row.iban)
  return {company:clean(raw.company,160),period:clean(raw.period,100),subjectPeriod:clean(raw.subjectPeriod,100),payments,warnings:(Array.isArray(raw.warnings)?raw.warnings:[]).slice(0,12).map(x=>clean(x,300)).filter(Boolean)}
}
export function paymentIssues(payment:ExtractedPayment):string[] {
  const issues:string[]=[]
  if(!payment.label)issues.push('tipul obligației lipsește')
  if(payment.amount===null)issues.push('suma lipsește')
  if(!payment.iban)issues.push('IBAN lipsește')
  else if(!validIban(payment.iban))issues.push('IBAN invalid sau incomplet')
  if(!payment.fiscalId)issues.push('CUI/CIF de plată lipsește')
  if(!payment.recipient)issues.push('beneficiarul trebuie confirmat')
  return issues
}

// Parser local pentru formatul emailurilor contabile. Textul OCR rămâne editabil înainte de import.
export function parseTaxEmail(text:string):TaxDraft {
  const source=text.replace(/\u00a0/g,' ').replace(/[–—]/g,'-').replace(/\s+-\s+(?=\d[\d .]*\s*(?:lei|ron))/gi,'\n- ')
  const lines=source.split(/\r?\n/).map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean)
  const intro=source.match(/\b(?:Pentru|La)\s+(.{2,100}?)\s+(?:e|este)\s+de\s+pl[ăa]tit(?:[ăa])?\b/i)?.[1]?.trim()||''
  const company=intro.replace(/\s*\(\s*(?:CUI|CIF)\s*(?:RO\s*)?\d{5,14}\s*\)\s*$/i,'').trim()||source.match(/^\s*([A-Z0-9 &.-]+(?:SRL|S\.R\.L\.))\s*[-–]/im)?.[1]?.trim()||''
  const subjectPeriod=lines.find(line=>/\bOBLIGATI/i.test(fold(line)))?.match(/\b([A-Za-zĂÂÎȘȚăâîșț]+\s+20\d{2})\b/)?.[1]?.trim()||''
  const period=source.match(/(?:pentru\s+)?luna\s+([A-Za-zĂÂÎȘȚăâîșț]+\s+20\d{2})/i)?.[1]?.trim()||subjectPeriod
  const payments:ExtractedPayment[]=[]
  const warnings:string[]=[]
  let fiscalId=''
  for(let i=0;i<lines.length;i++){
    const line=lines[i]
    if(/^(?:total|sum[ăa] total[ăa]|de plat[ăa] total)\b/i.test(line))continue
    const heading=line.match(/\b(?:pe\s+)?(?:CUI|CIF)\s*[:#-]?\s*((?:RO\s*)?\d{5,14})\b/i)
    if(heading)fiscalId=heading[1].replace(/\s/g,'').toUpperCase()
    const amountMatch=line.match(/(?:^|\D)(\d[\d .]*(?:,\d{1,2})?)\s*(?:lei|ron)\b/i)
    if(!amountMatch)continue
    const amount=parseTaxAmount(amountMatch[1])
    if(amount===null)continue
    let block=line
    for(let j=i+1;j<Math.min(lines.length,i+4);j++){
      if(/\b(?:CUI|CIF)\s*[:#-]?\s*(?:RO\s*)?\d{5,14}\b/i.test(lines[j])||/\d[\d .]*(?:,\d{1,2})?\s*(?:lei|ron)\b/i.test(lines[j]))break
      block+=' '+lines[j]
      if(/\bRO[0-9OIL]{2}[A-Z0-9]{10,30}\b/i.test(lines[j]))break
    }
    const spaced=block.match(/\bRO[0-9OIL]{2}(?:\s+[A-Z0-9]{4}){4,7}\b/i)?.[0]
    const compact=block.match(/\bRO[0-9OIL]{2}[A-Z0-9]{10,30}\b/i)?.[0]
    const rawIban=normalizeIban(spaced||compact||'')
    const iban=rawIban?rawIban.slice(0,2)+rawIban.slice(2,4).replace(/O/g,'0').replace(/[IL]/g,'1')+rawIban.slice(4):''
    const tail=block.slice(block.indexOf(amountMatch[0])+amountMatch[0].length)
    const label=tail.split(/\b(?:in|în)\s+cont(?:ul)?\b|\bIBAN\b|\bRO\d{2}/i)[0].replace(/^[-:.,\s]+|[-:.,\s]+$/g,'').replace(/-\+/g,'+').slice(0,160)
    const recipient=block.match(/\bbeneficiar\s*[:\-]\s*([^,;]+)/i)?.[1]?.trim()||''
    const dueMatch=block.match(/(?:scaden[țt][aă]?|p[aâ]n[aă]\s+la)\s*[:\-]?\s*(\d{1,2})[./-](\d{1,2})[./-](20\d{2})/i)
    const due=dueMatch?validDate(dueMatch[3]+'-'+dueMatch[2].padStart(2,'0')+'-'+dueMatch[1].padStart(2,'0')):null
    const qualifier=block.match(/\(([^)]{2,80})\)/)?.[1]?.trim()
    const payment={label:label||'Obligație neidentificată',amount,iban,fiscalId,recipient,description:[(label||block.slice(0,180))+(qualifier?' ('+qualifier+')':''),period?'luna '+period:''].filter(Boolean).join(' — '),due}
    payments.push(payment)
    if(rawIban&&rawIban!==iban)warnings.push('Plata '+payments.length+': primele două cifre ale IBAN-ului au fost corectate din OCR ('+rawIban.slice(0,4)+' → '+iban.slice(0,4)+'). Compară cu emailul original.')
    if(!iban)warnings.push('Plata '+payments.length+': contul IBAN nu a fost citit.')
    else if(!validIban(iban))warnings.push('Plata '+payments.length+': IBAN-ul necesită verificare.')
    if(!fiscalId)warnings.push('Plata '+payments.length+': CUI/CIF nu a fost găsit.')
  }
  if(!payments.length)warnings.push('Nu am identificat linii de plată. Verifică textul OCR sau lipește emailul integral.')
  return {company,period,subjectPeriod,payments,warnings}
}
