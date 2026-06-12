'use client'
import { useEffect, useState } from 'react'

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

function SectionLabel({ text }: { text: string }) {
  return (
    <span style={{ fontSize: '10px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.1em', display: 'block', marginBottom: '10px' }}>
      {text}
    </span>
  )
}

function CatRow({ label, value, color, indent }: { label: string; value: number; color: string; indent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: indent ? '5px 0 5px 16px' : '7px 0', borderBottom: '1px solid #131313' }}>
      <span style={{ fontSize: '13px', color: indent ? '#777' : '#BBB', fontWeight: indent ? 400 : 500 }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>{fmt(value)}</span>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#111', border: '1px solid #1E1E1E', borderRadius: '12px', padding: '20px 24px' }}>
      {children}
    </div>
  )
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

  if (loading) return <div style={{ color: '#555', fontSize: '14px', padding: '32px 0' }}>Se calculează...</div>
  if (error) return <div style={{ color: '#F87171', fontSize: '13px', padding: '24px 0' }}>{error}</div>
  if (!data) return null

  const { flux, emag, documente } = data
  const ron = flux?.RON
  const eur = flux?.EUR
  const hasDante = emag?.danteNetCost > 0 || emag?.danteReductions > 0
  const hasOtherDocs = Object.entries(documente || {}).some(([k, v]) => k !== 'emag' && (v as number) > 0)

  const netRon = ron?.net || 0
  const netIsPositive = netRon >= 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Summary */}
      <Card>
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '10px' }}>
            Sold net luna · RON
          </div>
          <div style={{ fontSize: '36px', fontWeight: 800, color: netIsPositive ? '#6EE7B0' : '#F87171', letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums' }}>
            {netIsPositive ? '+' : ''}{fmt(netRon)}
          </div>
          {ron && (
            <div style={{ fontSize: '13px', color: '#666', marginTop: '8px' }}>
              <span style={{ color: '#6EE7B0' }}>↑ {fmt(ron.incasari.total)}</span>
              <span style={{ color: '#444', margin: '0 10px' }}>—</span>
              <span style={{ color: '#F87171' }}>↓ {fmt(ron.cheltuieli.total)}</span>
            </div>
          )}
          {eur && (
            <div style={{ fontSize: '12px', color: '#555', marginTop: '8px' }}>
              EUR: {eur.net >= 0 ? '+' : ''}{fmt(eur.net)} &nbsp;·&nbsp; ↑{fmt(eur.incasari.total)} ↓{fmt(eur.cheltuieli.total)}
            </div>
          )}
        </div>
      </Card>

      {/* Flux numerar RON */}
      {ron && (
        <Card>
          <SectionLabel text="Flux numerar · RON" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Intrări */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#6EE7B0' }}>INTRĂRI</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#6EE7B0', fontVariantNumeric: 'tabular-nums' }}>{fmt(ron.incasari.total)}</span>
              </div>
              {Object.entries(ron.incasari.by_categorie as Record<string, number>)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, val]) => (
                  <CatRow key={cat} label={CAT_LABELS[cat] || cat} value={val as number} color='#9CA3AF' indent />
                ))}
            </div>
            {/* Ieșiri */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#F87171' }}>IEȘIRI</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#F87171', fontVariantNumeric: 'tabular-nums' }}>{fmt(ron.cheltuieli.total)}</span>
              </div>
              {Object.entries(ron.cheltuieli.by_categorie as Record<string, number>)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, val]) => (
                  <CatRow key={cat} label={CAT_LABELS[cat] || cat} value={val as number} color='#9CA3AF' indent />
                ))}
            </div>
          </div>
        </Card>
      )}

      {/* EUR flux (dacă există) */}
      {eur && (
        <Card>
          <SectionLabel text="Flux numerar · EUR" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#6EE7B0' }}>INTRĂRI</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#6EE7B0' }}>{fmt(eur.incasari.total)}</span>
              </div>
              {Object.entries(eur.incasari.by_categorie as Record<string, number>).sort(([,a],[,b]) => b-a).map(([cat, val]) => (
                <CatRow key={cat} label={CAT_LABELS[cat] || cat} value={val} color='#9CA3AF' indent />
              ))}
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#F87171' }}>IEȘIRI</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#F87171' }}>{fmt(eur.cheltuieli.total)}</span>
              </div>
              {Object.entries(eur.cheltuieli.by_categorie as Record<string, number>).sort(([,a],[,b]) => b-a).map(([cat, val]) => (
                <CatRow key={cat} label={CAT_LABELS[cat] || cat} value={val} color='#9CA3AF' indent />
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* eMAG Reconciliere */}
      {hasDante && (
        <Card>
          <SectionLabel text="eMAG · Reconciliere costuri Dante" />
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '14px', lineHeight: '1.5' }}>
            Sumele de mai jos sunt <strong style={{ color: '#888' }}>deja deduse</strong> de eMAG înainte de plată. Nu se adaugă la ieșiri — sunt documentate suplimentar.
          </div>
          <CatRow label="Costuri totale documentate" value={emag.danteExpenses} color='#F5C96A' />
          {emag.danteReductions > 0 && <CatRow label="Reduceri / storno" value={-emag.danteReductions} color='#6EE7B0' />}
          <CatRow label="Cost net Dante" value={emag.danteNetCost} color='#E0E0E0' />
          {Object.keys(emag.categories).length > 0 && (
            <div style={{ marginTop: '14px' }}>
              <span style={{ fontSize: '11px', color: '#444', display: 'block', marginBottom: '6px' }}>Detaliu categorie</span>
              {Object.entries(emag.categories as Record<string, number>).sort(([,a],[,b]) => Math.abs(b)-Math.abs(a)).map(([cat, val]) => (
                <CatRow key={cat} label={DANTE_CAT_LABELS[cat] || cat} value={val} color='#888' indent />
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
              <div key={sec} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #131313' }}>
                <span style={{ fontSize: '13px', color: '#BBB' }}>{SECTION_LABELS[sec] || sec}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#888', background: '#1A1A1A', padding: '2px 10px', borderRadius: '20px' }}>
                  {cnt} {(cnt as number) === 1 ? 'document' : 'documente'}
                </span>
              </div>
            ))}
        </Card>
      )}

      {!ron && !eur && (
        <Card>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: '13px', color: '#555' }}>Nu există tranzacții bancare înregistrate pentru această lună.</div>
            <div style={{ fontSize: '12px', color: '#444', marginTop: '6px' }}>Încarcă un extras de cont în modulul <strong style={{ color: '#888' }}>Extras de cont</strong>.</div>
          </div>
        </Card>
      )}
    </div>
  )
}
