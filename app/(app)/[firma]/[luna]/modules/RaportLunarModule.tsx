'use client'
import { useEffect, useState } from 'react'
import type { CurrencyAnalysis, CurrencyFlow, PeriodException, ReportEntry } from '@/lib/raport-lunar'

interface Firma { id: string; slug: string; nume: string; culoare: string }
interface Props { firma: Firma; lunaId: string }

const CAT_LABELS: Record<string, string> = {
  client: 'Clienți', furnizor: 'Furnizori', taxa: 'Taxe & impozite',
  angajat: 'Salariați', transfer: 'Transfer intern', comision: 'Comisioane',
  banca: 'Comision bancă', schimb_valutar: 'Schimb valutar', altele: 'Altele', necategorizate: 'Necategorizate',
}
const SECTION_LABELS: Record<string, string> = {
  'facturi-chitanta': 'Facturi + chitanță', 'facturi-restante': 'Facturi restante',
  emag: 'Facturi Dante / eMAG', trendyol: 'Documente Trendyol',
  'booking-facturi': 'Facturi Booking', 'booking-borderou': 'Borderou Booking',
  'airbnb-facturi': 'Facturi Airbnb', 'airbnb-borderou': 'Borderou Airbnb',
  '5stardesk': 'Facturi 5StarDesk',
}
const DANTE_CAT_LABELS: Record<string, string> = {
  comision: 'Comisioane', cupoane: 'Cupoane / vouchere', publicitate: 'Publicitate',
  transport: 'Transport', servicii: 'Servicii', altele: 'Altele',
}

function fmt(n: number) {
  return new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function lunaLabel(period:string){
  const [year,month]=period.split('-').map(Number)
  return new Intl.DateTimeFormat('ro-RO',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1)))
}

function SectionLabel({ text }: { text: string }) {
  return (
    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--c-555555)', textTransform: 'uppercase', letterSpacing: '.1em', display: 'block', marginBottom: '10px' }}>
      {text}
    </span>
  )
}

function CatRow({ label, value, color, indent }: { label: string; value: number; color: string; indent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: indent ? '5px 0 5px 16px' : '7px 0', borderBottom: '1px solid var(--c-131313)' }}>
      <span style={{ fontSize: '13px', color: indent ? 'var(--c-777777)' : 'var(--c-bbbbbb)', fontWeight: indent ? 400 : 500 }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>{fmt(value)}</span>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', padding: '20px 24px' }}>
      {children}
    </div>
  )
}
function FluxCard({valuta,flow}:{valuta:string;flow:CurrencyFlow}){
  const transferIn=flow.incasari.by_categorie.transfer||0
  const transferOut=flow.cheltuieli.by_categorie.transfer||0
  const fxIn=flow.incasari.by_categorie.schimb_valutar||0
  const fxOut=flow.cheltuieli.by_categorie.schimb_valutar||0
  return <Card>
    <SectionLabel text={'Flux bancar · '+valuta}/>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:24}}>
      {(['incasari','cheltuieli'] as const).map(side=><div key={side}>
        <div style={{display:'flex',justifyContent:'space-between',gap:8,marginBottom:10}}>
          <strong style={{fontSize:12,color:side==='incasari'?'var(--accent-mint)':'var(--accent-red)'}}>{side==='incasari'?'ÎNCASĂRI':'PLĂȚI'}</strong>
          <strong style={{fontSize:14,color:side==='incasari'?'var(--accent-mint)':'var(--accent-red)',fontVariantNumeric:'tabular-nums'}}>{fmt(flow[side].total)}</strong>
        </div>
        {Object.entries(flow[side].by_categorie).sort(([,a],[,b])=>b-a).map(([cat,value])=><CatRow key={cat} label={CAT_LABELS[cat]||cat} value={value} color='var(--c-999999)' indent/>)}
      </div>)}
    </div>
    {(transferIn>0||transferOut>0||fxIn>0||fxOut>0)&&<p style={{fontSize:12,color:'var(--c-777777)',marginTop:14}}>În totaluri sunt incluse transferuri (+{fmt(transferIn)} / −{fmt(transferOut)}) și schimburi valutare (+{fmt(fxIn)} / −{fmt(fxOut)}) {valuta}. Sunt evidențiate separat în analiza cheltuielilor.</p>}
  </Card>
}

function TopCheltuieli({valuta,analiza}:{valuta:string;analiza:CurrencyAnalysis}){
  return <Card>
    <SectionLabel text={'Top cheltuieli pe categorii · '+valuta}/>
    <p style={{fontSize:12,color:'var(--c-777777)',marginBottom:16,lineHeight:1.5}}>
      Categoriile de plăți bancare, ordonate după sumă. Transferurile și schimburile valutare sunt separate; acest clasament nu reprezintă cheltuieli contabile.
    </p>
    {analiza.topCheltuieli.length===0
      ? <div style={{fontSize:13,color:'var(--c-777777)'}}>Nu există plăți în afara transferurilor și schimburilor valutare în această lună.</div>
      : analiza.topCheltuieli.map((item,index)=><div key={item.categorie} style={{padding:'10px 0',borderTop:'1px solid var(--c-1e1e1e)'}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',fontSize:13}}>
            <span style={{color:'var(--c-bbbbbb)'}}><strong style={{color:'var(--c-e0e0e0)',marginRight:8}}>{index+1}.</strong>{CAT_LABELS[item.categorie]||item.categorie} <span style={{color:'var(--c-777777)'}}>· {item.numar} {item.numar===1?'plată':'plăți'}</span></span>
            <strong style={{color:'var(--c-e0e0e0)',fontVariantNumeric:'tabular-nums'}}>{fmt(item.total)} {valuta} <span style={{color:'var(--c-777777)',fontWeight:400}}>({fmt(item.procent)}%)</span></strong>
          </div>
          <div style={{height:5,borderRadius:5,background:'var(--c-1e1e1e)',marginTop:8}}>
            <div style={{height:5,borderRadius:5,background:'var(--accent-red)',width:Math.max(0,Math.min(100,item.procent))+'%'}}/>
          </div>
        </div>)}
    <div style={{fontSize:12,color:'var(--c-777777)',marginTop:14}}>
      Baza procentelor: {fmt(analiza.platiAnalizate)} {valuta} plăți fără transferuri și schimburi valutare.
      {analiza.transferuriOut>0&&<> Transferuri excluse din top: {fmt(analiza.transferuriOut)} {valuta}.</>}
      {analiza.schimbValutarOut>0&&<> Schimburi valutare excluse din top: {fmt(analiza.schimbValutarOut)} {valuta}.</>}
    </div>
    {analiza.neclasificate.total>0&&<div style={{fontSize:12,color:'var(--c-bbbbbb)',marginTop:10}}>
      De verificat: {fmt(analiza.neclasificate.total)} {valuta} ({fmt(analiza.neclasificate.procent)}%) sunt încadrate la „Altele” sau „Necategorizate”; topul poate deveni mai precis după reclasificare.
    </div>}
  </Card>
}

function ListaTranzactii({valuta,tip,rows}:{valuta:string;tip:'credit'|'debit';rows:ReportEntry[]}){
  const [cautare,setCautare]=useState('')
  const [categorie,setCategorie]=useState('')
  const categorii=[...new Set(rows.map(row=>row.categorie))].sort((a,b)=>(CAT_LABELS[a]||a).localeCompare(CAT_LABELS[b]||b,'ro'))
  const text=cautare.trim().toLocaleLowerCase('ro-RO')
  const filtrate=rows.filter(row=>(!categorie||row.categorie===categorie)&&(!text||[row.data_tranzactie,row.descriere,row.referinta,CAT_LABELS[row.categorie]||row.categorie,String(row.suma)].join(' ').toLocaleLowerCase('ro-RO').includes(text)))
  const titlu=tip==='credit'?'Toate încasările':'Toate plățile'
  return <Card>
    <SectionLabel text={titlu+' · '+valuta}/>
    <div style={{fontSize:12,color:'var(--c-777777)',marginBottom:14}}>{filtrate.length} din {rows.length} operațiuni afișate · ordonate de la cea mai recentă</div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
      <input aria-label={'Caută în '+titlu.toLowerCase()+' '+valuta} value={cautare} onChange={e=>setCautare(e.target.value)} placeholder="Caută partener, referință, dată sau sumă" style={{flex:'2 1 230px',minWidth:0,padding:'9px 11px',borderRadius:8,border:'1px solid var(--c-333333)',background:'var(--c-1a1a1a)',color:'var(--c-e0e0e0)',fontSize:12}}/>
      <select aria-label={'Categorie '+titlu.toLowerCase()+' '+valuta} value={categorie} onChange={e=>setCategorie(e.target.value)} style={{flex:'1 1 170px',padding:'9px 11px',borderRadius:8,border:'1px solid var(--c-333333)',background:'var(--c-1a1a1a)',color:'var(--c-e0e0e0)',fontSize:12}}>
        <option value="">Toate categoriile</option>
        {categorii.map(cat=><option key={cat} value={cat}>{CAT_LABELS[cat]||cat}</option>)}
      </select>
    </div>
    <div style={{maxHeight:430,overflow:'auto'}}>
      <table style={{width:'100%',minWidth:590,borderCollapse:'collapse',fontSize:12}}>
        <thead><tr style={{color:'var(--c-777777)',textAlign:'left'}}>
          <th style={{padding:'8px 6px'}}>Data</th><th style={{padding:'8px 6px'}}>Descriere / referință</th><th style={{padding:'8px 6px'}}>Categorie</th><th style={{padding:'8px 6px',textAlign:'right'}}>Sumă</th>
        </tr></thead>
        <tbody>{filtrate.map(row=><tr key={row.id} style={{borderTop:'1px solid var(--c-1e1e1e)',color:'var(--c-bbbbbb)'}}>
          <td style={{padding:'9px 6px',whiteSpace:'nowrap',verticalAlign:'top'}}>{row.data_tranzactie}</td>
          <td style={{padding:'9px 6px',verticalAlign:'top'}}>{row.descriere}{row.referinta&&<div style={{color:'var(--c-777777)',marginTop:3}}>Ref: {row.referinta}</div>}</td>
          <td style={{padding:'9px 6px',verticalAlign:'top'}}>{CAT_LABELS[row.categorie]||row.categorie}</td>
          <td style={{padding:'9px 6px',textAlign:'right',whiteSpace:'nowrap',fontWeight:700,verticalAlign:'top',fontVariantNumeric:'tabular-nums',color:tip==='credit'?'var(--accent-mint)':'var(--accent-red)'}}>{fmt(row.suma)} {valuta}</td>
        </tr>)}</tbody>
      </table>
      {filtrate.length===0&&<div style={{padding:14,fontSize:12,color:'var(--c-777777)'}}>Nu există operațiuni pentru filtrul ales.</div>}
    </div>
  </Card>
}

export default function RaportLunarModule({ firma, lunaId }: Props) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/raport/lunar?lunaId=${encodeURIComponent(lunaId)}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); setLoading(false) })
      .catch(() => { setError('Eroare la încărcarea datelor'); setLoading(false) })
  }, [lunaId])

  if (loading) return <div style={{ color: 'var(--c-555555)', fontSize: '14px', padding: '32px 0' }}>Se calculează...</div>
  if (error) return <div style={{ color: 'var(--accent-red)', fontSize: '13px', padding: '24px 0' }}>{error}</div>
  if (!data) return null

  const { flux, analiza, tranzactii, emag, documente } = data
  const currencies=(Object.entries(flux||{}) as [string,CurrencyFlow][]).sort(([a],[b])=>a==='RON'?-1:b==='RON'?1:a==='EUR'?-1:b==='EUR'?1:a.localeCompare(b))
  const control=data.control as {period:string;extrase:number;tranzactii:number;incluse:number;dinAlteExtrase:number;asteptate:number;inAfaraLunii:PeriodException[];invalide:number}
  const hasDante = emag?.danteNetCost > 0 || emag?.danteReductions > 0
  const hasOtherDocs = Object.entries(documente || {}).some(([k, v]) => k !== 'emag' && (v as number) > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      <Card>
        <SectionLabel text={'Analiza lunii · ' + lunaLabel(control.period)} />
        <div style={{ fontSize: '13px', color: 'var(--c-888888)' }}>
          {control.incluse} tranzacții bancare datate în această lună; {control.extrase} extrase sunt atașate lunii de lucru. Sunt căutate și operațiuni din extrase încărcate sub altă lună. Fiecare monedă este analizată separat.
        </div>
      </Card>
      {currencies.map(([valuta, flow]) => {
        const rezumat = analiza[valuta] as CurrencyAnalysis
        const diferenta = Math.abs(flow.net)
        const principala = rezumat.topCheltuieli[0]
        return <Card key={valuta}>
          <SectionLabel text={'Concluzia lunară · ' + valuta} />
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:16}}>
            <div><div style={{fontSize:11,color:'var(--c-777777)'}}>ÎNCASĂRI · {rezumat.numarIncasari} OPERAȚIUNI</div><strong style={{fontSize:22,color:'var(--accent-mint)',fontVariantNumeric:'tabular-nums'}}>{fmt(flow.incasari.total)} {valuta}</strong></div>
            <div><div style={{fontSize:11,color:'var(--c-777777)'}}>PLĂȚI · {rezumat.numarPlati} OPERAȚIUNI</div><strong style={{fontSize:22,color:'var(--accent-red)',fontVariantNumeric:'tabular-nums'}}>{fmt(flow.cheltuieli.total)} {valuta}</strong></div>
            <div><div style={{fontSize:11,color:'var(--c-777777)'}}>FLUX NET BANCAR</div><strong style={{fontSize:22,color:flow.net>=0?'var(--accent-mint)':'var(--accent-red)',fontVariantNumeric:'tabular-nums'}}>{flow.net>=0?'+':''}{fmt(flow.net)} {valuta}</strong></div>
          </div>
          <div style={{fontSize:13,color:'var(--c-bbbbbb)',lineHeight:1.6,marginTop:18,paddingTop:14,borderTop:'1px solid var(--c-1e1e1e)'}}>
            {flow.net>0
              ? <>Încasările au depășit plățile cu <strong>{fmt(diferenta)} {valuta}</strong>.</>
              : flow.net<0
                ? <>Plățile au depășit încasările cu <strong>{fmt(diferenta)} {valuta}</strong>.</>
                : <>Încasările și plățile au fost egale.</>}
            {principala&&<> Cea mai mare categorie de plăți, după separarea transferurilor și schimburilor valutare, este <strong>{CAT_LABELS[principala.categorie]||principala.categorie}</strong>: {fmt(principala.total)} {valuta} ({fmt(principala.procent)}% din plățile analizate).</>}
          </div>
          {(rezumat.transferuriIn>0||rezumat.transferuriOut>0||rezumat.schimbValutarIn>0||rezumat.schimbValutarOut>0)&&<div style={{fontSize:12,color:'var(--c-888888)',lineHeight:1.5,marginTop:10}}>
            Transferuri: +{fmt(rezumat.transferuriIn)} / −{fmt(rezumat.transferuriOut)} {valuta}. Schimburi valutare: +{fmt(rezumat.schimbValutarIn)} / −{fmt(rezumat.schimbValutarOut)} {valuta}. Fără aceste operațiuni, fluxul ar fi {rezumat.fluxFaraMiscariInterne>=0?'+':''}{fmt(rezumat.fluxFaraMiscariInterne)} {valuta}; rezultatul depinde de corectitudinea categorisirii.
          </div>}
          <p style={{fontSize:12,color:'var(--c-777777)',lineHeight:1.5,marginTop:10}}>
            Aceasta este analiza fluxului din extrase, nu soldul final al conturilor și nici profitul contabil.
          </p>
        </Card>
      })}
      {currencies.length===0&&<Card><div style={{fontSize:13,color:'var(--c-777777)'}}>Nu există încasări sau plăți bancare valide pentru luna analizată.</div></Card>}

      {control.asteptate !== control.tranzactii && (
        <Card>
          <SectionLabel text="Verificare extrase" />
          <div style={{ fontSize: '13px', color: 'var(--accent-red)' }}>
            Extrasele indică {control.asteptate} tranzacții, dar raportul a găsit {control.tranzactii}. Verifică importurile înainte de a folosi concluzia lunară.
          </div>
        </Card>
      )}
      {control.dinAlteExtrase > 0 && (
        <Card>
          <SectionLabel text="Operațiuni găsite în alte extrase" />
          <div style={{fontSize:13,color:'var(--c-bbbbbb)',lineHeight:1.5}}>
            {control.dinAlteExtrase} {control.dinAlteExtrase===1?'tranzacție datată':'tranzacții datate'} în {lunaLabel(control.period)} se află în extrase atașate altei luni de lucru. Sunt incluse o singură dată în analiza de mai sus; verifică încadrarea extraselor.
          </div>
        </Card>
      )}
      {control.inAfaraLunii.length > 0 && (
        <Card>
          <SectionLabel text="Tranzacții din alte luni" />
          <div style={{ fontSize: '12px', color: 'var(--c-888888)', lineHeight: '1.5', marginBottom: '8px' }}>
            Aceste tranzacții se află în extrasele lunii de lucru, dar au altă dată. Sunt excluse din totalurile de mai sus; verifică încadrarea extraselor.
          </div>
          {control.inAfaraLunii.map((item, index) => (
            <div key={index} style={{ fontSize: '12px', color: 'var(--c-bbbbbb)', padding: '5px 0' }}>
              {item.luna} · {item.numar} {item.numar === 1 ? 'tranzacție' : 'tranzacții'} · {item.valuta}: încasări {fmt(item.incasari)}, plăți {fmt(item.plati)}
            </div>
          ))}
        </Card>
      )}
      {control.invalide > 0 && (
        <Card>
          <SectionLabel text="Date de verificat" />
          <div style={{ fontSize: '13px', color: 'var(--accent-red)' }}>
            {control.invalide} tranzacții fără dată, tip sau sumă validă sunt excluse din calcul.
          </div>
        </Card>
      )}

      {currencies.map(([valuta, flow]) => <TopCheltuieli key={'top-'+valuta} valuta={valuta} analiza={analiza[valuta]} />)}
      {currencies.map(([valuta, flow]) => <FluxCard key={'flux-'+valuta} valuta={valuta} flow={flow} />)}
      {currencies.flatMap(([valuta]) => [
        <ListaTranzactii key={'incasari-'+valuta} valuta={valuta} tip="credit" rows={(tranzactii as ReportEntry[]).filter((row:ReportEntry)=>row.valuta===valuta&&row.tip==='credit')} />,
        <ListaTranzactii key={'plati-'+valuta} valuta={valuta} tip="debit" rows={(tranzactii as ReportEntry[]).filter((row:ReportEntry)=>row.valuta===valuta&&row.tip==='debit')} />,
      ])}

      {/* eMAG Reconciliere */}
      {hasDante && (
        <Card>
          <SectionLabel text="eMAG · Reconciliere costuri Dante" />
          <div style={{ fontSize: '12px', color: 'var(--c-666666)', marginBottom: '14px', lineHeight: '1.5' }}>
            Sumele de mai jos sunt <strong style={{ color: 'var(--c-888888)' }}>deja deduse</strong> de eMAG înainte de plată. Nu se adaugă la ieșiri — sunt documentate suplimentar.
          </div>
          <CatRow label="Costuri totale documentate" value={emag.danteExpenses} color='#F5C96A' />
          {emag.danteReductions > 0 && <CatRow label="Reduceri / storno" value={-emag.danteReductions} color='var(--accent-mint)' />}
          <CatRow label="Cost net Dante" value={emag.danteNetCost} color='var(--c-e0e0e0)' />
          {Object.keys(emag.categories).length > 0 && (
            <div style={{ marginTop: '14px' }}>
              <span style={{ fontSize: '11px', color: 'var(--c-444444)', display: 'block', marginBottom: '6px' }}>Detaliu categorie</span>
              {Object.entries(emag.categories as Record<string, number>).sort(([,a],[,b]) => Math.abs(b)-Math.abs(a)).map(([cat, val]) => (
                <CatRow key={cat} label={DANTE_CAT_LABELS[cat] || cat} value={val} color='var(--c-888888)' indent />
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Documente atașate */}
      {(hasOtherDocs || (documente?.emag || 0) > 0) && (
        <Card>
          <SectionLabel text="Documente atașate lunii" />
          {Object.entries(documente as Record<string, number>)
            .filter(([, v]) => (v as number) > 0)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([sec, cnt]) => (
              <div key={sec} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--c-131313)' }}>
                <span style={{ fontSize: '13px', color: 'var(--c-bbbbbb)' }}>{SECTION_LABELS[sec] || sec}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--c-888888)', background: 'var(--c-1a1a1a)', padding: '2px 10px', borderRadius: '20px' }}>
                  {cnt} {(cnt as number) === 1 ? 'document' : 'documente'}
                </span>
              </div>
            ))}
        </Card>
      )}

      {currencies.length === 0 && control.tranzactii === 0 && (
        <Card>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: '13px', color: 'var(--c-555555)' }}>Nu există tranzacții bancare înregistrate pentru această lună.</div>
            <div style={{ fontSize: '12px', color: 'var(--c-444444)', marginTop: '6px' }}>Încarcă un extras de cont în modulul <strong style={{ color: 'var(--c-888888)' }}>Extras de cont</strong>.</div>
          </div>
        </Card>
      )}
    </div>
  )
}
