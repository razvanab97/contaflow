import JSZip from 'jszip'
import templates from '@/lib/proiect-templates.json'
import {validateDraft,type Draft,type FormKind} from '@/lib/proiect-workflow'
import {purchaseAmounts} from '@/lib/achizitii-vat'
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const text=(s:string)=>esc(s).replace(/\r?\n/g,'</w:t><w:br/><w:t xml:space="preserve">')
const money=(n:number)=>n.toLocaleString('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2})
// Anexa 1 urmeaza 1 la 1 documentul aprobat (dosar "23. aer conditionat", 12.10.2026) - vezi templates/proiect/README.md.
const grupat=(n:number)=>{const [i,d]=n.toFixed(2).split('.');return i.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+d}
// "altex.ro" / "www.altex.ro" -> "https://www.altex.ro/", ca in referinta; adresele complete raman cum sunt.
const siteComplet=(s:string)=>{const t=s.trim().replace(/^\(|\)$/g,'');if(!t)return '';if(/^https?:\/\//i.test(t))return t;const host=t.startsWith('www.')?t:'www.'+t;return 'https://'+host+(host.includes('/')?'':'/')}
// Fiecare specificatie pe randul ei, cu "- " in fata (formatul din referinta).
const specificatii=(s:string)=>s.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(x=>/^[-–•]/.test(x)?x.replace(/^[–•]\s*/,'- '):'- '+x).join('\n')
// Justificarea: "NR n" si "<valoare> lei fara TVA" ingrosate, exact ca in referinta (restul textului normal).
function runsJustificare(xml:string,valoare:string){
 // rPr temperat: nu are voie sa treaca peste alt </w:rPr> (altfel ar prinde XML din runurile anterioare).
 const m=xml.match(/<w:r(?:\s[^>]*)?>(<w:rPr>(?:(?!<\/w:rPr>)[^])*<\/w:rPr>)?<w:t xml:space="preserve">%%justificare%%<\/w:t><\/w:r>/)
 if(!m)return xml
 const normal=m[1]||'<w:rPr></w:rPr>'
 // Ordinea din schema OOXML (si din referinta): rStyle, rFonts, apoi b/bCs.
 const bold=normal.replace(/^(<w:rPr>(?:<w:rStyle[^>]*\/>)?(?:<w:rFonts[^>]*\/>)?)/,'$1<w:b/><w:bCs/>')
 // In referinta valoarea are doar <w:b/><w:bCs/> (fara marimea paragrafului) - iese putin mai mare, ca in original.
 const boldValoare='<w:rPr><w:rFonts w:cstheme="minorHAnsi"/><w:b/><w:bCs/></w:rPr>'
 const run=(rpr:string,t:string)=>`<w:r>${rpr}<w:t xml:space="preserve">${text(t)}</w:t></w:r>`
 const parti=valoare.split(/(\bNR\.?\s*\d+|\d[\d.]*,\d{2}\s*lei\s+f[aă]r[aă]\s+TVA ?)/i).filter(Boolean)
 return xml.replace(m[0],()=>parti.map(x=>run(/^NR\.?\s*\d+$/i.test(x)?bold:/^\d[\d.]*,\d{2}\s*lei\s+f[aă]r[aă]\s+TVA ?$/i.test(x)?boldValoare:normal,x)).join(''))
}
export async function generateProjectDoc(kind:FormKind,draft:Draft,profile:Record<string,string>) {
 const missing=validateDraft(kind,draft,profile)
 if(missing.length)throw new Error('Completează: '+missing.join('; '))
 const zip=await JSZip.loadAsync(Buffer.from(templates[kind],'base64'))
 let xml=await zip.file('word/document.xml')!.async('string')
 // Match individual rows so the table header can never be swallowed by the editable row.
 const styledNoteRow=kind==='nota'?xml.match(/<w:tr(?:\s[^>]*)?>[^]*?<\/w:tr>/g)?.find(row=>row.includes('%%line_index%%')):undefined
 if(kind==='nota'&&!styledNoteRow)throw new Error('Lipsește rândul standard al Anexei 1')
 const rows=draft.lines.map((l,i)=>{
  const amounts=purchaseAmounts(l.price,l.qty,l.rate,l.priceMode||'net')
  const price=amounts?.netUnit||0;const total=amounts?.netTotal||0
  const vat=amounts?`\nValoare fără TVA: ${money(amounts.netTotal)} lei\nTVA 21%: ${money(amounts.vatTotal)} lei\nTotal cu TVA: ${money(amounts.grossTotal)} lei`:''
  const operator=l.supplier+(l.website?`\n(${l.website})`:'')
  if(styledNoteRow){
   const line:Record<string,string>={index:String(i+1),operator:l.supplier.trim()+(siteComplet(l.website||'')?`\n(${siteComplet(l.website||'')})`:''),product:l.product,specs:specificatii(l.specs),qty:l.qty,price:grupat(price),total:grupat(total)}
   return styledNoteRow.replace(/%%line_([a-z]+)%%/g,(_,key)=>text(line[key]))
  }
  const cells=kind==='nota'?[String(i+1),operator,l.product,l.specs,l.qty,money(price),money(total)]:kind==='oferta'?[String(i+1),l.product,`${l.specs}${vat}`,l.unit,l.qty]:[l.product,`${l.specs}${vat}`,l.qty,money(price),money(total)]
  return '<w:tr>'+cells.map(c=>`<w:tc><w:tcPr><w:tcBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/></w:tcBorders></w:tcPr><w:p><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${text(c)}</w:t></w:r></w:p></w:tc>`).join('')+'</w:tr>'
 }).join('')
 xml=styledNoteRow?xml.replace(styledNoteRow,()=>rows):xml.replace('%%ROWS%%',()=>rows)
 if(kind==='nota')xml=runsJustificare(xml,draft.fields.justificare||'')
 const selectedType=(draft.fields.tip||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()
 const values:Record<string,string>={...profile,...draft.fields,nr_oferte:String(draft.lines.length),tip:(draft.fields.tip||'').trim(),tip_produse:selectedType==='produse'?'☒':'☐',tip_servicii:selectedType==='servicii'?'☒':'☐',tip_lucrari:selectedType==='lucrari'?'☒':'☐',semnatura_furnizor:draft.fields.comanda_online==='da'?'':'Prestator / Furnizor,\nSemnătura: ____________________'}
 xml=xml.replace(/%%([a-z_]+)%%/g,(_,key)=>text(values[key]||''))
 if(/%%\w+%%/.test(xml))throw new Error('Șablonul conține câmpuri necompletate')
 zip.file('word/document.xml',xml)
 return zip.generateAsync({type:'nodebuffer'})
}
