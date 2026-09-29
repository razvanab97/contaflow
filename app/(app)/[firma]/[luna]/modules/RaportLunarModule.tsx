'use client'
import { useEffect, useState } from 'react'
import type { CurrencyFlow, PeriodException } from '@/lib/raport-lunar'

interface Firma { id: string; slug: string; nume: string; culoare: string }
interface Props { firma: Firma; lunaId: string }

const CAT_LABELS: Record<string, string> = {
  client: 'Clienți', furnizor: 'Furnizori', taxa: 'Taxe & impozite',
  angajat: 'Salariați', transfer: 'Transfer intern', comision: 'Comisioane',
  banca: 'Comision bancă', altele: 'Altele', necategorizate: 'Necategorizate',
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
    {(transferIn>0||transferOut>0)&&<p style={{fontSize:12,color:'var(--c-777777)',marginTop:14}}>În totaluri sunt incluse transferuri: +{fmt(transferIn)} / −{fmt(transferOut)} {valuta}. Ele nu sunt automat venituri sau cheltuieli ale firmei.</p>}
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

  const { flux, emag, documente } = data
  const currencies=(Object.entries(flux||{}) as [string,CurrencyFlow][]).sort(([a],[b])=>a==='RON'?-1:b==='RON'?1:a==='EUR'?-1:b==='EUR'?1:a.localeCompare(b))
  const control=data.control as {period:string;extrase:number;tranzactii:number;incluse:number;asteptate:number;inAfaraLunii:PeriodException[];invalide:number}
  const hasDante = emag?.danteNetCost > 0 || emag?.danteReductions > 0
  const hasOtherDocs = Object.entries(documente || {}).some(([k, v]) => k !== 'emag' && (v as number) > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      <Card>
        <SectionLabel text={'Concluzia lunară · ' + lunaLabel(control.period)} />
        <div style={{ fontSize: '13px', color: 'var(--c-888888)', marginBottom: '16px' }}>
          {control.incluse} tranzacții bancare din {control.extrase} extrase, încadrate după data tranzacției.
        </div>
        {currencies.length === 0
          ? <div style={{ fontSize: '14px', color: 'var(--c-777777)' }}>Nu există încasări sau plăți bancare valide în această lună.</div>
          : currencies.map(([valuta, flow]) => (
            <div key={valuta} style={{ padding: '12px 0', borderTop: '1px solid var(--c-1e1e1e)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '14px', color: 'var(--c-e0e0e0)' }}>{valuta}</strong>
                <strong style={{ fontSize: '22px', fontVariantNumeric: 'tabular-nums', color: flow.net >= 0 ? 'var(--accent-mint)' : 'var(--accent-red)' }}>
                  Flux net {flow.net >= 0 ? '+' : ''}{fmt(flow.net)} {valuta}
                </strong>
              </div>
              <div style={{ fontSize: '12px', marginTop: '5px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--accent-mint)' }}>Încasări {fmt(flow.incasari.total)} {valuta}</span>
                <span style={{ color: 'var(--accent-red)' }}>Plăți {fmt(flow.cheltuieli.total)} {valuta}</span>
              </div>
            </div>
          ))}
        <p style={{ fontSize: '12px', color: 'var(--c-777777)', lineHeight: '1.5', marginTop: '14px' }}>
          Fluxul net este diferența dintre încasările și plățile din extrase. Nu reprezintă soldul final al conturilor sau profitul contabil. Totalurile pot include transferuri între conturi.
        </p>
      </Card>

      {control.asteptate !== control.tranzactii && (
        <Card>
          <SectionLabel text="Verificare extrase" />
          <div style={{ fontSize: '13px', color: 'var(--accent-red)' }}>
            Extrasele indică {control.asteptate} tranzacții, dar raportul a găsit {control.tranzactii}. Verifică importurile înainte de a folosi concluzia lunară.
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

      {currencies.map(([valuta, flow]) => <FluxCard key={valuta} valuta={valuta} flow={flow} />)}

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
