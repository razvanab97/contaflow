import JSZip from 'jszip'
import templates from '@/lib/proiect-templates.json'
import {validateDraft,type Draft,type FormKind} from '@/lib/proiect-workflow'
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const text=(s:string)=>esc(s).replace(/\r?\n/g,'</w:t><w:br/><w:t xml:space="preserve">')
const money=(n:number)=>n.toLocaleString('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2})
export async function generateProjectDoc(kind:FormKind,draft:Draft,profile:Record<string,string>) {
 const missing=validateDraft(kind,draft,profile)
 if(missing.length)throw new Error('Completează: '+missing.join('; '))
 const zip=await JSZip.loadAsync(Buffer.from(templates[kind],'base64'))
 let xml=await zip.file('word/document.xml')!.async('string')
 const rows=draft.lines.map((l,i)=>{
  const price=Number(l.price)*Number(l.rate);const total=price*Number(l.qty)
  const source=`Sursă: ${l.source}\nData: ${l.date}${l.currency!=='RON'?`\n${l.price} ${l.currency} × ${l.rate} lei/${l.currency}`:''}`
  const cells=kind==='nota'?[String(i+1),l.supplier,l.product,`${l.specs}\n${source}`,l.qty,money(price),money(total)]:kind==='oferta'?[String(i+1),l.product,l.specs,l.unit,l.qty]:[l.product,l.specs,l.qty,money(price),money(total)]
  return '<w:tr>'+cells.map(c=>`<w:tc><w:tcPr><w:tcBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${text(c)}</w:t></w:r></w:p></w:tc>`).join('')+'</w:tr>'
 }).join('')
 xml=xml.replace('%%ROWS%%',()=>rows)
 const values:Record<string,string>={...profile,...draft.fields,semnatura_furnizor:draft.fields.comanda_online==='da'?'':'Prestator / Furnizor,\nSemnătura: ____________________'}
 xml=xml.replace(/%%([a-z_]+)%%/g,(_,key)=>text(values[key]||''))
 if(/%%\w+%%/.test(xml))throw new Error('Șablonul conține câmpuri necompletate')
 zip.file('word/document.xml',xml)
 return zip.generateAsync({type:'nodebuffer'})
}
