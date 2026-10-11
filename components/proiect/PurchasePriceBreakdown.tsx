'use client'
import {purchaseAmounts} from '@/lib/achizitii-vat'
import type {Line} from '@/lib/proiect-workflow'
export default function PurchasePriceBreakdown({line,onMode}:{line:Line;onMode:(mode:'gross'|'net')=>void}){
 const amounts=purchaseAmounts(line.price,line.qty,line.rate,line.priceMode||'net')
 const money=(n:number)=>n.toLocaleString('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2})
 return <div style={{fontSize:'var(--fs-sm)',marginBottom:12}}>
  <label>Prețul introdus de la furnizor
   <select value={line.priceMode||'net'} onChange={e=>onMode(e.target.value as 'gross'|'net')} style={{display:'block',padding:8,marginTop:5,border:'1px solid var(--border)',borderRadius:'var(--r-md)',background:'var(--surface-sunken)',color:'var(--text-primary)'}}><option value="gross">Cu TVA inclus (21%)</option><option value="net">Fără TVA — se adaugă 21%</option></select>
  </label>
  {!line.priceMode&&<p style={{color:'var(--text-secondary)',marginTop:6}}>Poziție veche: prețul era introdus fără TVA. Schimbă modul doar dacă valoarea introdusă include deja TVA.</p>}
  {amounts&&<p role="status" style={{marginTop:8}}>Total poziție: <strong>{money(amounts.netTotal)} lei fără TVA + {money(amounts.vatTotal)} lei TVA (21%) = {money(amounts.grossTotal)} lei cu TVA</strong></p>}
 </div>
}
