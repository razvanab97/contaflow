'use client'
import { useState, useEffect } from 'react'
import Sparkline from '@/components/ui/Sparkline'
import CountUp from '@/components/ui/CountUp'
import type { FluxLunar } from '@/lib/flux-lunar'
import { getFirmaModules } from '@/lib/firma-config'
import type { ConcluzieEmag } from '@/lib/emag-concluzie'
import { areAchizitiiProduse } from '@/lib/achizitii-produse'
import AchizitiiProduse from './AchizitiiProduse'

interface Punct { luna: string; label: string; incasari: number; plati: number; pct: number; initializata: boolean }

function money(v: number, d = 2) { return new Intl.NumberFormat('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v || 0) }
function curs(v: number) { return new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(v) }

// "Concluzia lunară" din TOATE conturile (RON, EUR, ...): totalul in lei (valuta convertita la cursul
// BNR din ziua fiecarei tranzactii), defalcarea pe monede si tendinta pe 6 luni. Schimburile valutare
// intre conturile proprii nu intra in total (ar dubla aceiasi bani) - sunt aratate separat.
export default function LunaSummary({ lunaId, firmaId, firmaSlug, luna, lunaLabel }: { lunaId: string; culoare: string; firmaId: string; firmaSlug: string; luna: string; lunaLabel?: string }) {
  const [flux, setFlux] = useState<FluxLunar | null>(null)
  const [achOpen, setAchOpen] = useState(false)
  // Costul net eMAG vine din „Concluzia eMAG” (avize + curierat + Dante); undefined = se calculeaza
  const [emagC, setEmagC] = useState<ConcluzieEmag | null | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const [istoric, setIstoric] = useState<Punct[]>([])
  // "Cost net eMAG" are sens doar la firmele cu modulul eMAG (azi doar AB Homes Invest).
  const areEmag = getFirmaModules(firmaSlug).some(m => m.slug === 'emag')

  useEffect(() => {
    setLoaded(false)
    setEmagC(areEmag ? undefined : null)
    fetch(`/api/luna/flux?lunaId=${encodeURIComponent(lunaId)}`).then(r => r.ok ? r.json() : null).then(d => setFlux(d?.flux || null)).catch(() => {}).finally(() => setLoaded(true))
    // separat: prima calculare a concluziei eMAG poate dura (citeste avizele) - nu tine pe loc restul
    if (areEmag) fetch(`/api/emag/concluzie?lunaId=${encodeURIComponent(lunaId)}`).then(r => r.ok ? r.json() : null).then(d => setEmagC(d?.concluzie || null)).catch(() => setEmagC(null))
    fetch(`/api/luna/istoric?firmaId=${encodeURIComponent(firmaId)}&firmaSlug=${encodeURIComponent(firmaSlug)}&luna=${encodeURIComponent(luna)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (Array.isArray(data?.istoric)) setIstoric(data.istoric) })
      .catch(() => {})
  }, [lunaId, firmaId, firmaSlug, luna, areEmag])

  // dupa o corectie manuala in fereastra Achizitii produse: doar fluxul se reciteste (fara skeleton)
  const reloadFlux = () => { fetch(`/api/luna/flux?lunaId=${encodeURIComponent(lunaId)}`).then(r => r.ok ? r.json() : null).then(d => { if (d?.flux) setFlux(d.flux) }).catch(() => {}) }

  if (!loaded) {
    return (
      <div className="stat-grid" style={{ marginBottom: '28px' }} aria-busy="true">
        {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '150px', borderRadius: 'var(--r-lg)' }} />)}
      </div>
    )
  }
  if (!flux && !emagC) return null

  const serie = istoric.filter(p => p.initializata)
  const spark = (key: 'incasari' | 'plati' | 'cashflow') => serie.map(p => key === 'cashflow' ? p.incasari - p.plati : p[key])
  const range = serie.length > 1 ? `${serie[0].label} – ${serie[serie.length - 1].label}` : ''
  const monede = flux ? Object.entries(flux.peMoneda).sort(([a], [b]) => (a === 'RON' ? -1 : b === 'RON' ? 1 : a.localeCompare(b))) : []
  const multiMoneda = monede.length > 1

  type Tile = { label: string; value: number; color: string; spark?: number[]; sparkColor?: string; rows?: { v: string; suma: number; curs?: number | null }[]; detalii?: { label: string; suma: number; semn: '+' | '−' }[]; gol?: string; title?: string; nota?: string; onClick?: () => void }
  const tiles: Tile[] = []
  if (flux) {
    const c = flux.consolidat
    // Dispozitiile de plata sunt plati in numerar (nu apar in extras): intra in Plati si scad din Cashflow,
    // ca toti banii care pleaca din firma sa fie numarati. Randurile pe monede raman cele din extras (se reconciliaza cu banca).
    const disp = c.dispozitii || { total: 0, numar: 0 }
    const platiTotal = Math.round((c.plati + disp.total) * 100) / 100
    const netTotal = Math.round((c.net - disp.total) * 100) / 100
    const rows = (fn: (m: FluxLunar['peMoneda'][string]) => number) => monede.map(([v, m]) => ({ v, suma: fn(m), curs: v !== 'RON' ? m.cursMediu : null }))
    tiles.push(
      { label: 'Încasări', value: c.incasari, color: 'var(--success)', spark: spark('incasari'), sparkColor: 'var(--success)', rows: rows(m => m.incasari - m.schimbIn) },
      {
        label: 'Plăți', value: platiTotal, color: 'var(--danger)', spark: spark('plati'), sparkColor: 'var(--danger)', rows: rows(m => m.plati - m.schimbOut),
        title: disp.numar ? `Plăți din extrasele bancare (${money(c.plati)} lei) + ${disp.numar} ${disp.numar === 1 ? 'dispoziție de plată' : 'dispoziții de plată'} în numerar (${money(disp.total)} lei).` : undefined,
        detalii: disp.numar ? [
          { label: 'Din extras (bancă)', suma: c.plati, semn: '−' as const },
          { label: `Dispoziții de plată (${disp.numar})`, suma: disp.total, semn: '−' as const },
        ] : undefined,
      },
      { label: 'Cashflow', value: netTotal, color: netTotal >= 0 ? 'var(--success)' : 'var(--danger)', spark: spark('cashflow'), sparkColor: 'var(--accent)', rows: rows(m => (m.incasari - m.schimbIn) - (m.plati - m.schimbOut)), title: disp.numar ? `Încasări − Plăți, după scăderea dispozițiilor de plată în numerar (${money(disp.total)} lei).` : undefined },
    )
  }
  if (flux) {
    // Incasarile reale: fara imprumuturi de la asociat si fara schimburi valutare intre conturile proprii
    const r = flux.consolidat.incasariReale
    tiles.push({
      label: 'Încasări reale', value: r.total, color: 'var(--success)',
      title: `Încasări din vânzări și de la clienți (toate conturile, lei la curs BNR), fără împrumuturi și schimburi valutare.${r.alteLista.length ? ` Alte încasări: ${r.alteLista.map(a => `${a.platitor} ${money(a.suma)}`).join(', ')}` : ''}`,
      detalii: [
        ...(areEmag || r.emag ? [{ label: 'eMAG', suma: r.emag, semn: '+' as const }] : []),
        ...(r.trendyol || getFirmaModules(firmaSlug).some(m => m.slug === 'trendyol') ? [{ label: 'Trendyol', suma: r.trendyol, semn: '+' as const }] : []),
        { label: r.alteLista.length === 1 ? `Alte · ${r.alteLista[0].platitor}` : `Alte încasări${r.alteLista.length ? ` (${r.alteLista.length})` : ''}`, suma: r.alte, semn: '+' },
      ],
      gol: 'Nicio încasare reală luna aceasta',
    })
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
  if (flux && areAchizitiiProduse(firmaSlug)) {
    // Achizitii de produse: plati catre furnizorii de marfa (lib/achizitii-produse.ts), parte din Plati.
    const a = flux.consolidat.achizitiiProduse
    const top = a.perFurnizor.slice(0, 5)
    const altii = a.perFurnizor.slice(5)
    const platiCuDispozitii = flux.consolidat.plati + (flux.consolidat.dispozitii?.total || 0)
    const pondere = platiCuDispozitii > 0 ? Math.round((a.total / platiCuDispozitii) * 1000) / 10 : 0
    tiles.push({
      label: 'Achiziții produse', value: a.total, color: 'var(--text-primary)',
      title: `Plăți către furnizorii de marfă (Jumbo, Maxy, Verk, i-Want, Importio + ce marchezi manual), lei la curs BNR. Sunt incluse și în Plăți. Click pentru tranzacții și perioade.`,
      detalii: a.numar ? [
        ...top.map(f => ({ label: f.furnizor, suma: f.suma, semn: '−' as const })),
        ...(altii.length ? [{ label: `Alți furnizori (${altii.length})`, suma: Math.round(altii.reduce((x, f) => x + f.suma, 0) * 100) / 100, semn: '−' as const }] : []),
      ] : undefined,
      nota: a.numar ? `${pondere}% din Plăți · ${a.numar} ${a.numar === 1 ? 'plată' : 'plăți'}` : undefined,
      gol: 'Nicio achiziție de produse luna aceasta',
      onClick: () => setAchOpen(true),
    })
  }
  if (areEmag && emagC !== null) {
    // cost net = tot ce s-a dus pe drum intre vanzari si rezultatul net (comisioane, transport + curierat, restul)
    const c = emagC
    const cost = c ? Math.round((c.vanzari - c.rezultat) * 100) / 100 : 0
    const comision = c ? -c.retineri.comision : 0
    const transport = c ? Math.round((-c.retineri.transport + c.curierat.total) * 100) / 100 : 0
    const alte = Math.round((cost - comision - transport) * 100) / 100
    tiles.push({
      label: 'Cost net eMAG', value: cost, color: 'var(--danger)',
      title: c ? `Din Concluzia eMAG: vânzări ${money(c.vanzari)} lei − cost ${money(cost)} lei = rezultat net ${money(c.rezultat)} lei (${c.vanzari ? Math.round((cost / c.vanzari) * 1000) / 10 : 0}% din vânzări).` : 'Se calculează din Concluzia eMAG…',
      detalii: c && c.vanzari ? [
        { label: 'Comisioane', suma: comision, semn: '−' },
        { label: 'Transport + curierat', suma: transport, semn: '−' },
        { label: 'Alte (vouchere, taxe, Dante)', suma: Math.abs(alte), semn: alte >= 0 ? '−' : '+' },
        { label: `Rezultat net · ${Math.round((c.rezultat / c.vanzari) * 1000) / 10}%`, suma: c.rezultat, semn: '+' },
      ] : undefined,
      gol: c === undefined ? 'Se calculează din Concluzia eMAG…' : 'Niciun aviz eMAG luna aceasta',
    })
  }

  const schimburi = monede.filter(([, m]) => m.schimbIn || m.schimbOut)

  return (
    <div style={{ marginBottom: '28px' }}>
      <div className="stat-grid stagger">
        {tiles.map(t => (
          <div key={t.label} className="stat" title={t.title || (t.rows ? `Toate conturile, total în lei la cursul BNR${range ? ` · tendință ${range}` : ''}` : 'Luna curentă')}
            {...(t.onClick ? { role: 'button', tabIndex: 0, onClick: t.onClick, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.onClick?.() } }, style: { cursor: 'pointer' } } : {})}>
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
            {t.nota && <div style={{ marginTop: '4px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{t.nota}</div>}
            {t.onClick && <div style={{ marginTop: '6px', fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--accent)' }}>Vezi tranzacțiile →</div>}
            {t.gol !== undefined
              ? (!t.detalii && <div style={{ marginTop: '10px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{t.gol}</div>)
              : t.spark && t.spark.length > 1
              ? <Sparkline values={t.spark} color={t.sparkColor} title={`${t.label} pe ultimele luni`} />
              : <div style={{ height: '28px', marginTop: '10px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'flex-end' }}>{t.rows ? 'fără istoric încă' : 'RON, luna curentă'}</div>}
          </div>
        ))}
      </div>
      {achOpen && <AchizitiiProduse firmaId={firmaId} lunaId={lunaId} lunaLabel={lunaLabel} onClose={() => setAchOpen(false)} onChanged={reloadFlux} />}
      {flux && (
        <p style={{ marginTop: '10px', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', lineHeight: 1.55 }}>
          {multiMoneda
            ? <>Totalurile includ toate conturile ({monede.map(([v]) => v).join(' + ')}); valuta e convertită la cursul BNR din ziua fiecărei tranzacții (sub sumă: cursul mediu folosit).</>
            : <>Totalurile includ contul {monede[0]?.[0] || 'RON'}.</>}
          {flux.consolidat.dispozitii?.numar > 0 && <> Plățile includ și {flux.consolidat.dispozitii.numar} {flux.consolidat.dispozitii.numar === 1 ? 'dispoziție de plată' : 'dispoziții de plată'} în numerar ({money(flux.consolidat.dispozitii.total)} lei), care nu apar în extras.</>}
          {schimburi.length > 0 && <> Schimburile valutare între conturile proprii nu intră în total, ca banii să nu fie numărați de două ori: {schimburi.map(([v, m]) => `${v} ${m.schimbIn ? `+${money(m.schimbIn)}` : ''}${m.schimbIn && m.schimbOut ? ' / ' : ''}${m.schimbOut ? `−${money(m.schimbOut)}` : ''}`).join(' · ')}.</>}
          {(flux.cursIndisponibil || flux.faraCurs > 0) && <span style={{ color: 'var(--warning)' }}> ⚠ {flux.cursIndisponibil ? 'Cursul BNR nu a putut fi descărcat — tranzacțiile în valută nu sunt incluse în total.' : `${flux.faraCurs} tranzacții în valută fără curs BNR nu sunt incluse în total.`}</span>}
        </p>
      )}
    </div>
  )
}
