'use client'
import { useState, useEffect } from 'react'
import Sparkline from '@/components/ui/Sparkline'
import CountUp from '@/components/ui/CountUp'
import type { FluxLunar } from '@/lib/flux-lunar'
import { getFirmaModules } from '@/lib/firma-config'

interface Punct { luna: string; label: string; incasari: number; plati: number; pct: number; initializata: boolean }

function money(v: number, d = 2) { return new Intl.NumberFormat('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v || 0) }
function curs(v: number) { return new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(v) }

// "Concluzia lunară" din TOATE conturile (RON, EUR, ...): totalul in lei (valuta convertita la cursul
// BNR din ziua fiecarei tranzactii), defalcarea pe monede si tendinta pe 6 luni. Schimburile valutare
// intre conturile proprii nu intra in total (ar dubla aceiasi bani) - sunt aratate separat.
export default function LunaSummary({ lunaId, firmaId, firmaSlug, luna }: { lunaId: string; culoare: string; firmaId: string; firmaSlug: string; luna: string }) {
  const [flux, setFlux] = useState<FluxLunar | null>(null)
  const [emagNet, setEmagNet] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [istoric, setIstoric] = useState<Punct[]>([])
  // "Cost net eMAG" are sens doar la firmele cu modulul eMAG (azi doar AB Homes Invest).
  const areEmag = getFirmaModules(firmaSlug).some(m => m.slug === 'emag')

  useEffect(() => {
    setLoaded(false)
    Promise.all([
      fetch(`/api/luna/flux?lunaId=${encodeURIComponent(lunaId)}`).then(r => r.ok ? r.json() : null).then(d => setFlux(d?.flux || null)).catch(() => {}),
      areEmag
        ? fetch(`/api/emag?lunaId=${encodeURIComponent(lunaId)}`).then(r => r.ok ? r.json() : null).then(d => setEmagNet(typeof d?.summary?.emagNetCost === 'number' ? d.summary.emagNetCost : null)).catch(() => {})
        : Promise.resolve(setEmagNet(null)),
    ]).finally(() => setLoaded(true))
    fetch(`/api/luna/istoric?firmaId=${encodeURIComponent(firmaId)}&firmaSlug=${encodeURIComponent(firmaSlug)}&luna=${encodeURIComponent(luna)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (Array.isArray(data?.istoric)) setIstoric(data.istoric) })
      .catch(() => {})
  }, [lunaId, firmaId, firmaSlug, luna, areEmag])

  if (!loaded) {
    return (
      <div className="stat-grid" style={{ marginBottom: '28px' }} aria-busy="true">
        {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '150px', borderRadius: 'var(--r-lg)' }} />)}
      </div>
    )
  }
  if (!flux && emagNet == null) return null

  const serie = istoric.filter(p => p.initializata)
  const spark = (key: 'incasari' | 'plati' | 'cashflow') => serie.map(p => key === 'cashflow' ? p.incasari - p.plati : p[key])
  const range = serie.length > 1 ? `${serie[0].label} – ${serie[serie.length - 1].label}` : ''
  const monede = flux ? Object.entries(flux.peMoneda).sort(([a], [b]) => (a === 'RON' ? -1 : b === 'RON' ? 1 : a.localeCompare(b))) : []
  const multiMoneda = monede.length > 1

  type Tile = { label: string; value: number; color: string; spark?: number[]; sparkColor?: string; rows?: { v: string; suma: number; curs?: number | null }[]; detalii?: { label: string; suma: number; semn: '+' | '−' }[]; gol?: string; title?: string }
  const tiles: Tile[] = []
  if (flux) {
    const c = flux.consolidat
    const rows = (fn: (m: FluxLunar['peMoneda'][string]) => number) => monede.map(([v, m]) => ({ v, suma: fn(m), curs: v !== 'RON' ? m.cursMediu : null }))
    tiles.push(
      { label: 'Încasări', value: c.incasari, color: 'var(--success)', spark: spark('incasari'), sparkColor: 'var(--success)', rows: rows(m => m.incasari - m.schimbIn) },
      { label: 'Plăți', value: c.plati, color: 'var(--danger)', spark: spark('plati'), sparkColor: 'var(--danger)', rows: rows(m => m.plati - m.schimbOut) },
      { label: 'Cashflow', value: c.net, color: c.net >= 0 ? 'var(--success)' : 'var(--danger)', spark: spark('cashflow'), sparkColor: 'var(--accent)', rows: rows(m => (m.incasari - m.schimbIn) - (m.plati - m.schimbOut)) },
    )
  }
  if (flux) {
    // Imprumutul firmei de la asociat: intrari (imprumut primit) vs. iesiri (restituire + avans trezorerie).
    const i = flux.consolidat.imprumut
    tiles.push({
      label: 'Împrumut firmă', value: i.net, color: 'var(--text-primary)',
      title: 'Împrumuturi de la asociat: intrări = „împrumut societate”; ieșiri = „restituire împrumut” și „avans trezorerie”. Echivalent lei la cursul BNR; incluse și în Încasări/Plăți.',
      detalii: i.numar ? [
        { label: 'Primit', suma: i.primit, semn: '+' },
        { label: 'Restituit', suma: i.restituire, semn: '−' },
        { label: 'Avans trezorerie', suma: i.avansTrezorerie, semn: '−' },
      ] : undefined,
      gol: 'Nicio mișcare de împrumut luna aceasta',
    })
  }
  if (areEmag && emagNet != null) tiles.push({ label: 'Cost net eMAG', value: emagNet, color: 'var(--text-primary)' })

  const schimburi = monede.filter(([, m]) => m.schimbIn || m.schimbOut)

  return (
    <div style={{ marginBottom: '28px' }}>
      <div className="stat-grid stagger">
        {tiles.map(t => (
          <div key={t.label} className="stat" title={t.title || (t.rows ? `Toate conturile, total în lei la cursul BNR${range ? ` · tendință ${range}` : ''}` : 'Luna curentă')}>
            <div className="stat-label">{t.label}</div>
            <div className="stat-value num" style={{ color: t.color, fontSize: 'var(--fs-lg)' }} title={`${money(t.value)} lei`}>
              <CountUp value={t.value} decimals={2} /> <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>lei</span>
            </div>
            {t.rows && multiMoneda && (
              <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                {t.rows.map(r => (
                  <div key={r.v} className="num" style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
                    <span>{r.v}</span>
                    <span title={r.curs ? `curs mediu BNR ${curs(r.curs)} lei` : undefined}>{money(r.suma)}{r.curs ? <span style={{ color: 'var(--text-muted)' }}> · {curs(r.curs)}</span> : null}</span>
                  </div>
                ))}
              </div>
            )}
            {t.detalii && (
              <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                {t.detalii.map(d => (
                  <div key={d.label} className="num" style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: 'var(--fs-xs)', color: d.suma ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                    <span style={{ fontFamily: 'var(--font-inter)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{d.label}</span>
                    <span style={{ whiteSpace: 'nowrap', color: d.suma ? (d.semn === '+' ? 'var(--success)' : 'var(--danger)') : undefined }}>{d.suma ? d.semn : ''}{money(d.suma)}</span>
                  </div>
                ))}
              </div>
            )}
            {t.label === 'Împrumut firmă'
              ? (!t.detalii && <div style={{ marginTop: '10px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{t.gol}</div>)
              : t.spark && t.spark.length > 1
              ? <Sparkline values={t.spark} color={t.sparkColor} title={`${t.label} pe ultimele luni`} />
              : <div style={{ height: '28px', marginTop: '10px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'flex-end' }}>{t.rows ? 'fără istoric încă' : 'RON, luna curentă'}</div>}
          </div>
        ))}
      </div>
      {flux && (
        <p style={{ marginTop: '10px', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', lineHeight: 1.55 }}>
          {multiMoneda
            ? <>Totalurile includ toate conturile ({monede.map(([v]) => v).join(' + ')}); valuta e convertită la cursul BNR din ziua fiecărei tranzacții (sub sumă: cursul mediu folosit).</>
            : <>Totalurile includ contul {monede[0]?.[0] || 'RON'}.</>}
          {schimburi.length > 0 && <> Schimburile valutare între conturile proprii nu intră în total, ca banii să nu fie numărați de două ori: {schimburi.map(([v, m]) => `${v} ${m.schimbIn ? `+${money(m.schimbIn)}` : ''}${m.schimbIn && m.schimbOut ? ' / ' : ''}${m.schimbOut ? `−${money(m.schimbOut)}` : ''}`).join(' · ')}.</>}
          {(flux.cursIndisponibil || flux.faraCurs > 0) && <span style={{ color: 'var(--warning)' }}> ⚠ {flux.cursIndisponibil ? 'Cursul BNR nu a putut fi descărcat — tranzacțiile în valută nu sunt incluse în total.' : `${flux.faraCurs} tranzacții în valută fără curs BNR nu sunt incluse în total.`}</span>}
        </p>
      )}
    </div>
  )
}
