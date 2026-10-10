'use client'
import { useState } from 'react'
import { BUGET_ACHIZITII, PASI_PROCEDURA, PROIECT, coduriDin, linieDupaCod, dosarAchizitie, urmatorulPas, type DocDosar, type LinieBuget } from '@/lib/achizitii-procedura'

const lei = (v: number) => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 18px' }
const STATUS_LABEL: Record<string, string> = { oferta: 'Ofertă', nota_semnata: 'Notă semnată', plata_initiata: 'Plată inițiată', dovada_trimisa: 'Dovadă trimisă', finalizat: 'Finalizat' }

export interface AchizitieSistem { id: string; denumire: string; valoare: number | null; sursa: string | null; status: string; linie_buget?: string | null }

// --- Procedura de achizitii, pas cu pas (ghid) ---------------------------------------------------
export function ProceduraAchizitii({ deschisInitial = false }: { deschisInitial?: boolean }) {
  const [deschis, setDeschis] = useState(deschisInitial)
  return (
    <div style={card}>
      <button type="button" onClick={() => setDeschis(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit' }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--text-primary)' }}>Procedura de achiziții — pas cu pas</span>
          <span style={{ display: 'block', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '2px' }}>Cum s-au făcut achizițiile proiectului și cum se face orice achiziție nouă: buget → cerere de ofertă → 3 oferte → notă → plată → factură → recepție → dovezi.</span>
        </span>
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--accent)' }}>{deschis ? 'Ascunde' : 'Arată pașii'}</span>
      </button>
      {deschis && (
        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', padding: '10px 12px', borderRadius: 'var(--r-md)', background: 'var(--surface-secondary)', lineHeight: 1.55 }}>
            <b>{PROIECT.beneficiar}</b> (CUI {PROIECT.cui}) · {PROIECT.contract} · {PROIECT.program}. Administrator: {PROIECT.administrator}. Nota de estimare se întemeiază pe {PROIECT.temeiNota}. {PROIECT.transe}
          </div>
          {PASI_PROCEDURA.map(p => (
            <div key={p.nr} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <span style={{ width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-sm)', fontWeight: 750, background: 'var(--accent-soft)', color: 'var(--accent)' }}>{p.nr}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--fs-md)', fontWeight: 650, color: 'var(--text-primary)' }}>{p.titlu}</span>
                  {p.document && <span className="badge">{p.document}</span>}
                  {p.formular && <span className="badge badge-success">se generează în aplicație</span>}
                </div>
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '2px' }}>{p.ce}</div>
                <ul style={{ margin: '4px 0 0', paddingLeft: '18px', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>{p.reguli.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Bugetul de achizitii: planificat vs. angajat, pe linii -----------------------------------
export function BugetAchizitii({ items, onPorneste, busy }: { items: AchizitieSistem[]; onPorneste: (l: LinieBuget) => void; busy: string | null }) {
  const [arata, setArata] = useState<'de_cumparat' | 'cumparate' | 'toate'>('de_cumparat')
  const peLinie = (cod: string) => items.filter(i => coduriDin(i.linie_buget).includes(cod))
  const surse: { sursa: 'grant' | 'cofinantare'; titlu: string }[] = [{ sursa: 'grant', titlu: 'Subvenție (grant)' }, { sursa: 'cofinantare', titlu: 'Cofinanțare' }]
  const fara = items.filter(i => !coduriDin(i.linie_buget).length)
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--text-primary)' }}>Bugetul de achiziții</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Liniile din bugetul planului de afaceri (Act adițional nr. 1), cu TVA. „Pornește achiziția” deschide achiziția precompletată (denumire, buget, sursă).</div>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['de_cumparat', 'cumparate', 'toate'] as const).map(k => {
            const n = k === 'toate' ? BUGET_ACHIZITII.length : BUGET_ACHIZITII.filter(l => (peLinie(l.cod).length > 0) === (k === 'cumparate')).length
            return <button key={k} type="button" className={arata === k ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setArata(k)}>{k === 'toate' ? 'Toate liniile' : k === 'cumparate' ? 'Cumpărate' : 'De cumpărat'} ({n})</button>
          })}
        </div>
      </div>
      {surse.map(({ sursa, titlu }) => {
        const linii = BUGET_ACHIZITII.filter(l => l.sursa === sursa)
        const planificat = linii.reduce((s, l) => s + l.valoare, 0)
        const achizitii = items.filter(i => coduriDin(i.linie_buget).some(c => linieDupaCod(c)?.sursa === sursa))
        const angajat = achizitii.reduce((s, i) => s + (i.valoare || 0), 0)
        const deCumparat = linii.filter(l => !peLinie(l.cod).length)
        const vizibile = arata === 'toate' ? linii : arata === 'cumparate' ? linii.filter(l => peLinie(l.cod).length) : deCumparat
        return (
          <div key={sursa}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <span style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--text-primary)' }}>{titlu}</span>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>planificat {lei(planificat)} · angajat {lei(angajat)} · <b style={{ color: planificat - angajat < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>rămas {lei(planificat - angajat)} lei</b> · {deCumparat.length} linii de cumpărat</span>
            </div>
            <div style={{ height: '6px', borderRadius: 'var(--r-full)', background: 'var(--surface-secondary)', overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{ width: `${Math.min(100, planificat ? (angajat / planificat) * 100 : 0)}%`, height: '100%', background: angajat > planificat ? 'var(--danger)' : 'var(--success)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {vizibile.map(l => {
                const ach = peLinie(l.cod)
                return (
                  <div key={l.cod} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '7px 10px', borderRadius: 'var(--r-md)', background: 'var(--surface-secondary)', fontSize: 'var(--fs-sm)' }}>
                    <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', width: '36px' }}>{l.cod}</span>
                    <span style={{ flex: '1 1 220px', minWidth: 0, color: 'var(--text-primary)', fontWeight: 550 }}>{l.denumire}{l.cantitate > 1 ? ` · ${l.cantitate} ${l.um}` : ''}</span>
                    <span className="num" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{lei(l.valoare)} lei</span>
                    {ach.length
                      ? <span className="badge badge-success" title={ach.map(a => a.denumire).join(', ')}>{STATUS_LABEL[ach[0].status] || ach[0].status}{ach.length > 1 ? ` (+${ach.length - 1})` : ''}</span>
                      : <button type="button" className="btn btn-sm btn-primary" disabled={busy === l.cod} onClick={() => onPorneste(l)}>{busy === l.cod ? '…' : 'Pornește achiziția'}</button>}
                  </div>
                )
              })}
              {!vizibile.length && <div style={{ fontSize: 'var(--fs-sm)', color: arata === 'cumparate' ? 'var(--text-secondary)' : 'var(--success)' }}>{arata === 'cumparate' ? 'Nicio linie cumpărată încă pe această sursă.' : '✓ Toate liniile au achiziție pornită.'}</div>}
            </div>
          </div>
        )
      })}
      {fara.length > 0 && (
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--warning)' }}>
          {fara.length} {fara.length === 1 ? 'achiziție nu e legată' : 'achiziții nu sunt legate'} de o linie de buget ({fara.map(f => f.denumire.split(' (')[0].split(':')[0]).join(', ')}) — alege linia în fiecare achiziție, mai jos.
        </div>
      )}
    </div>
  )
}

// --- Dosarul unei achizitii: ce exista, ce lipseste, ce urmeaza + linia de buget ----------------
export function DosarAchizitie({ item, docs, onLinie, onSursa }: { item: AchizitieSistem; docs: DocDosar[]; onLinie: (v: string) => void; onSursa: (v: string) => void }) {
  const coduri = coduriDin(item.linie_buget)
  const utilaj = coduri.some(c => /^4\.[1-7]$/.test(c))
  const online = docs.some(d => /order_|dante|emag|altex|leroy|\.png$|\.jpe?g$/i.test(d.fisier_nume))
  const dosar = dosarAchizitie(docs, { utilaj, online })
  const ok = dosar.filter(e => e.ok).length
  const pas = urmatorulPas(dosar)
  const buget = coduri.reduce((s, c) => s + (linieDupaCod(c)?.valoare || 0), 0)
  return (
    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', fontSize: 'var(--fs-sm)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>Linie de buget
          <select value={item.linie_buget || ''} onChange={e => onLinie(e.target.value)} style={{ fontSize: 'var(--fs-sm)', padding: '4px 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface-sunken)', color: 'var(--text-primary)', maxWidth: '300px' }}>
            <option value="">— alege —</option>
            {item.linie_buget && coduri.length > 1 && <option value={item.linie_buget}>{coduri.join(', ')} (mai multe linii)</option>}
            {BUGET_ACHIZITII.map(l => <option key={l.cod} value={l.cod}>{l.cod} · {l.denumire.slice(0, 50)} ({l.sursa === 'grant' ? 'subvenție' : 'cofinanțare'})</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>Sursa
          <select value={item.sursa || ''} onChange={e => onSursa(e.target.value)} style={{ fontSize: 'var(--fs-sm)', padding: '4px 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface-sunken)', color: 'var(--text-primary)' }}>
            <option value="">—</option><option value="grant">Subvenție (grant)</option><option value="cofinantare">Cofinanțare</option><option value="altul">Altul</option>
          </select>
        </label>
        {buget > 0 && item.valoare != null && (
          <span style={{ color: item.valoare > buget ? 'var(--danger)' : 'var(--text-secondary)' }}>
            buget {lei(buget)} lei · {item.valoare > buget ? `depășit cu ${lei(item.valoare - buget)}` : `rămas ${lei(buget - item.valoare)}`}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', marginRight: '4px' }}>Dosar {ok}/{dosar.length}</span>
        {dosar.map(e => (
          <span key={e.cheie} title={e.detaliu} style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--r-full)', background: e.ok ? 'var(--success-soft)' : e.partial ? 'var(--warning-soft)' : 'var(--danger-soft)', color: e.ok ? 'var(--success)' : e.partial ? 'var(--warning)' : 'var(--danger)' }}>
            {e.ok ? '✓' : e.partial ? '◐' : '✕'} {e.titlu}{!e.ok && e.cheie === 'oferte' ? ` (${e.detaliu})` : ''}
          </span>
        ))}
      </div>
      {pas && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', padding: '8px 10px', borderRadius: 'var(--r-md)', background: 'var(--surface-secondary)', borderLeft: '3px solid var(--accent)' }}><b>Următorul pas:</b> {pas}</div>}
    </div>
  )
}

// --- Pasii achizitiei, interactivi: fiecare pas cu stare reala si actiune directa -----------------
// Starea vine din dosar (documentele incarcate) + linia de buget; pasul curent e primul neindeplinit.
// Etapa achizitiei (ofertă → notă → plată → dovadă) avanseaza singura pe masura ce apar documentele.
type FormKindAch = 'oferta' | 'nota' | 'receptie'
const ORDINE_STATUS = ['oferta', 'nota_semnata', 'plata_initiata', 'dovada_trimisa', 'finalizat']

export function etapaDinDosar(dosar: ReturnType<typeof dosarAchizitie>): string {
  const ok = (k: string) => dosar.find(e => e.cheie === k)?.ok
  if (ok('pv') && ok('plata') && ok('poze')) return 'dovada_trimisa'
  if (ok('plata') || ok('factura') || dosar.find(e => e.cheie === 'factura')?.partial) return 'plata_initiata'
  if (ok('nota')) return 'nota_semnata'
  return 'oferta'
}

export function PasiAchizitie({ item, docs, onLinie, onSursa, onUploaded, onGenereaza, onStatus }: {
  item: AchizitieSistem; docs: DocDosar[]
  onLinie: (v: string) => void; onSursa: (v: string) => void; onUploaded: () => void
  onGenereaza: (k: FormKindAch) => void; onStatus: (s: string) => void
}) {
  const coduri = coduriDin(item.linie_buget)
  const utilaj = coduri.some(c => /^4\.[1-7]$/.test(c))
  const online = docs.some(d => /order_|dante|emag|altex|leroy|\.png$|\.jpe?g$/i.test(d.fisier_nume))
  const dosar = dosarAchizitie(docs, { utilaj, online })
  const el = (k: string) => dosar.find(e => e.cheie === k)
  const finalizat = item.status === 'finalizat'
  const [arata, setArata] = useState(!finalizat)
  const [incarc, setIncarc] = useState<string | null>(null)
  const [mesaj, setMesaj] = useState('')
  const buget = coduri.reduce((s, c) => s + (linieDupaCod(c)?.valoare || 0), 0)

  async function incarca(tip: string, files: FileList | null) {
    if (!files?.length) return
    setIncarc(tip); setMesaj('')
    let erori = 0
    for (const f of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', f); fd.append('achizitieId', item.id); fd.append('etapa', item.status); fd.append('tipDosar', tip)
      const r = await fetch('/api/achizitii/documente', { method: 'POST', body: fd }).catch(() => null)
      if (!r?.ok) erori++
    }
    setIncarc(null)
    setMesaj(erori ? `${erori} fișier(e) nu au putut fi încărcate (doar PDF, JPG, PNG)` : `${files.length} document${files.length > 1 ? 'e încărcate' : ' încărcat'}`)
    onUploaded()
  }
  const Incarca = ({ tip, eticheta, multiplu = false, imagini = false }: { tip: string; eticheta: string; multiplu?: boolean; imagini?: boolean }) => (
    <label className="btn btn-sm" style={{ cursor: incarc ? 'wait' : 'pointer' }}>
      {incarc === tip ? 'Se încarcă…' : `↑ ${eticheta}`}
      <input type="file" multiple={multiplu} accept={imagini ? '.jpg,.jpeg,.png' : '.pdf,.jpg,.jpeg,.png'} style={{ display: 'none' }} disabled={!!incarc} onChange={e => { incarca(tip, e.target.files); e.target.value = '' }} />
    </label>
  )
  const Genereaza = ({ k, eticheta }: { k: FormKindAch; eticheta: string }) => <button type="button" className="btn btn-sm btn-primary" onClick={() => onGenereaza(k)}>✎ {eticheta}</button>

  const pasi: { cheie: string; titlu: string; ok: boolean; partial?: boolean; detaliu: string; actiuni: React.ReactNode }[] = [
    { cheie: 'buget', titlu: 'Linia de buget și sursa', ok: coduri.length > 0 && !!item.sursa, detaliu: coduri.length ? `${coduri.join(', ')} · buget ${lei(buget)} lei${item.valoare != null && buget ? (item.valoare > buget ? ` · depășit cu ${lei(item.valoare - buget)}` : ` · rămas ${lei(buget - item.valoare)}`) : ''}` : 'alege linia din bugetul planului de afaceri',
      actiuni: <>
        <select value={item.linie_buget || ''} onChange={e => onLinie(e.target.value)} style={{ fontSize: 'var(--fs-sm)', padding: '5px 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface-sunken)', color: 'var(--text-primary)', maxWidth: '320px' }}>
          <option value="">— linia de buget —</option>
          {item.linie_buget && coduri.length > 1 && <option value={item.linie_buget}>{coduri.join(', ')} (mai multe linii)</option>}
          {BUGET_ACHIZITII.map(l => <option key={l.cod} value={l.cod}>{l.cod} · {l.denumire.slice(0, 48)} ({l.sursa === 'grant' ? 'subvenție' : 'cofinanțare'})</option>)}
        </select>
        <select value={item.sursa || ''} onChange={e => onSursa(e.target.value)} style={{ fontSize: 'var(--fs-sm)', padding: '5px 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface-sunken)', color: 'var(--text-primary)' }}>
          <option value="">— sursa —</option><option value="grant">Subvenție</option><option value="cofinantare">Cofinanțare</option><option value="altul">Altul</option>
        </select>
      </> },
    { cheie: 'cerere', titlu: 'Specificații + cerere de ofertă (Anexa 2)', ok: !!el('cerere')?.ok, partial: el('cerere')?.partial, detaliu: el('cerere')!.detaliu,
      actiuni: <><Genereaza k="oferta" eticheta="Completează și generează cererea (Word)" /><Incarca tip="cerere" eticheta="Încarcă cererea semnată" /></> },
    { cheie: 'oferte', titlu: '3 oferte de la furnizori diferiți', ok: !!el('oferte')?.ok, partial: el('oferte')?.partial, detaliu: el('oferte')!.detaliu,
      actiuni: <Incarca tip="oferta" eticheta="Încarcă oferte (poți selecta mai multe)" multiplu /> },
    { cheie: 'nota', titlu: 'Notă de estimare (Anexa 1), semnată', ok: !!el('nota')?.ok, detaliu: el('nota')!.detaliu,
      actiuni: <><Genereaza k="nota" eticheta="Generează nota (Word) din cele 3 oferte" /><Incarca tip="nota" eticheta="Încarcă nota semnată" /></> },
    ...(utilaj ? [{ cheie: 'contract', titlu: 'Contract cu furnizorul', ok: !!el('contract')?.ok, detaliu: el('contract')!.detaliu, actiuni: <Incarca tip="contract" eticheta="Încarcă contractul" /> }] : []),
    { cheie: 'plata', titlu: 'Proformă / comandă + plata prin OP', ok: !!el('plata')?.ok, detaliu: el('plata')!.detaliu,
      actiuni: <><Incarca tip="proforma" eticheta="Încarcă proforma / comanda" /><Incarca tip="plata" eticheta="Încarcă dovada plății (extras / OP)" /></> },
    { cheie: 'factura', titlu: 'Factura fiscală', ok: !!el('factura')?.ok, partial: el('factura')?.partial, detaliu: el('factura')!.detaliu,
      actiuni: <Incarca tip="factura" eticheta="Încarcă factura fiscală" /> },
    { cheie: 'pv', titlu: 'Recepție — PV (Anexa 3), semnat', ok: !!el('pv')?.ok, detaliu: el('pv')!.detaliu,
      actiuni: <><Genereaza k="receptie" eticheta="Generează PV-ul de recepție (Word)" /><Incarca tip="pv" eticheta="Încarcă PV-ul semnat" /></> },
    { cheie: 'poze', titlu: 'Poze cu bunul, cu înscrisuri', ok: !!el('poze')?.ok, detaliu: el('poze')!.detaliu,
      actiuni: <Incarca tip="poza" eticheta="Încarcă poze" multiplu imagini /> },
  ]
  const curent = pasi.find(p => !p.ok)
  const facute = pasi.filter(p => p.ok).length

  // Etapa avanseaza singura dupa dosar (nu coboara si nu atinge achizitiile finalizate).
  const etapa = etapaDinDosar(dosar)
  const deAvansat = !finalizat && ORDINE_STATUS.indexOf(etapa) > ORDINE_STATUS.indexOf(item.status)

  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: finalizat ? 'var(--success)' : 'var(--text-primary)' }}>{finalizat ? '✓ Achiziție finalizată' : `Pașii achiziției · ${facute}/${pasi.length}`}</span>
        <div style={{ flex: '1 1 120px', height: '6px', borderRadius: 'var(--r-full)', background: 'var(--surface-secondary)', overflow: 'hidden', maxWidth: '240px' }}>
          <div style={{ width: `${(facute / pasi.length) * 100}%`, height: '100%', background: 'var(--success)' }} />
        </div>
        {finalizat && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>dosar {facute}/{pasi.length}{facute < pasi.length ? ' — documente de completat pentru arhivă' : ' complet'}</span>}
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setArata(v => !v)}>{arata ? 'Ascunde pașii' : 'Arată pașii'}</button>
      </div>
      {deAvansat && (
        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: 'var(--fs-sm)', padding: '8px 10px', borderRadius: 'var(--r-md)', background: 'var(--accent-soft)' }}>
          Dosarul arată că achiziția a ajuns la etapa „{STATUS_LABEL[etapa]}”.
          <button type="button" className="btn btn-sm btn-primary" onClick={() => onStatus(etapa)}>Treci la „{STATUS_LABEL[etapa]}”</button>
        </div>
      )}
      {arata && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
          {pasi.map((p, i) => {
            const esteCurent = !finalizat && curent?.cheie === p.cheie
            return (
              <div key={p.cheie} style={{ display: 'flex', gap: '12px', padding: '10px 12px', borderRadius: 'var(--r-md)', border: `1px solid ${esteCurent ? 'var(--accent)' : 'var(--border-subtle)'}`, background: esteCurent ? 'var(--accent-soft)' : 'var(--surface-secondary)' }}>
                <span style={{ width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-xs)', fontWeight: 750, background: p.ok ? 'var(--success-soft)' : p.partial ? 'var(--warning-soft)' : 'var(--surface)', color: p.ok ? 'var(--success)' : p.partial ? 'var(--warning)' : 'var(--text-secondary)', border: p.ok ? 'none' : '1px solid var(--border)' }}>{p.ok ? '✓' : i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--fs-md)', fontWeight: 650, color: 'var(--text-primary)' }}>{p.titlu}</span>
                    {esteCurent && <span className="badge badge-accent">pasul curent</span>}
                    <span style={{ fontSize: 'var(--fs-xs)', color: p.ok ? 'var(--success)' : p.partial ? 'var(--warning)' : 'var(--text-secondary)' }}>{p.detaliu}</span>
                  </div>
                  {(esteCurent || !p.ok || p.cheie === 'buget') && <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>{p.actiuni}</div>}
                </div>
              </div>
            )
          })}
          {!finalizat && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--r-md)', border: '1px dashed var(--border)' }}>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', flex: 1 }}>{curent ? `Când dosarul e complet, achiziția se marchează finalizată. Acum lipsește: ${curent.titlu.toLowerCase()}.` : 'Dosarul e complet — poți finaliza achiziția.'}</span>
              <button type="button" className={curent ? 'btn btn-sm' : 'btn btn-sm btn-primary'} onClick={() => { if (!curent || confirm('Dosarul nu e complet. Marchezi totuși achiziția ca finalizată?')) onStatus('finalizat') }}>✓ Marchează finalizată</button>
            </div>
          )}
          {mesaj && <div role="status" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>{mesaj}</div>}
        </div>
      )}
    </div>
  )
}

// --- Achizitie noua: din buget sau in afara lui ------------------------------------------------
export interface AchizitieNouaDate { denumire: string; valoare: number | null; sursa: string; linieBuget: string | null; nota: string }
export function AchizitieNoua({ items = [], onCreeaza, onAnuleaza, busy }: { items?: AchizitieSistem[]; onCreeaza: (d: AchizitieNouaDate) => void; onAnuleaza: () => void; busy: boolean }) {
  // liniile care au deja achizitie (facuta sau pornita) nu mai apar in lista
  const folosite = new Set(items.flatMap(i => coduriDin(i.linie_buget)))
  const disponibile = BUGET_ACHIZITII.filter(x => !folosite.has(x.cod))
  const [linie, setLinie] = useState('')
  const [denumire, setDenumire] = useState('')
  const [tip, setTip] = useState('Produse')
  const [sursa, setSursa] = useState('cofinantare')
  const [valoare, setValoare] = useState('')
  const [specificatii, setSpecificatii] = useState('')
  const l = linie && linie !== 'afara' ? linieDupaCod(linie) : null
  function alegeLinie(cod: string) {
    setLinie(cod)
    const x = cod && cod !== 'afara' ? linieDupaCod(cod) : null
    if (x) { setDenumire(x.denumire); setSursa(x.sursa); setValoare(String(x.valoare)) }
  }
  const valid = denumire.trim() && linie
  const inp: React.CSSProperties = { width: '100%', fontSize: 'var(--fs-md)', padding: '9px 11px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--surface-sunken)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', marginTop: '5px' }
  const lab: React.CSSProperties = { fontSize: 'var(--fs-xs)', fontWeight: 650, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em' }
  function creeaza() {
    const v = valoare ? Number(valoare.replace(',', '.')) : null
    const faraTva = v ? Math.round((v / 1.21) * 100) / 100 : null
    const parti = [
      l ? `Linia de buget ${l.cod} (${l.sursa === 'grant' ? 'subvenție' : 'cofinanțare'}): ${l.valoare.toLocaleString('ro-RO')} lei cu TVA.` : 'ÎN AFARA BUGETULUI — necesită acordul PROSOCIAL / act adițional înainte de cumpărare.',
      `Tip: ${tip}.`,
      faraTva ? `Buget maxim pentru oferte: ≈ ${faraTva.toLocaleString('ro-RO')} lei fără TVA.` : '',
      specificatii.trim() ? `Specificații tehnice minime: ${specificatii.trim()}` : '',
    ].filter(Boolean)
    onCreeaza({ denumire: denumire.trim(), valoare: v, sursa, linieBuget: l ? l.cod : null, nota: parti.join(' ') })
  }
  return (
    <div style={{ ...card, borderColor: 'var(--accent)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <div style={{ fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--text-primary)' }}>Achiziție nouă</div>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Pasul 1 al procedurii: ce cumperi, din ce linie de buget și cu ce specificații. După creare urmezi pașii: cerere de ofertă → 3 oferte → notă → plată → factură → recepție → poze.</div>
      </div>
      <label style={lab}>Linia de buget *
        <select value={linie} onChange={e => alegeLinie(e.target.value)} style={inp}>
          <option value="">— alege —</option>
          {disponibile.map(x => <option key={x.cod} value={x.cod}>{x.cod} · {x.denumire} · {lei(x.valoare)} lei ({x.sursa === 'grant' ? 'subvenție' : 'cofinanțare'})</option>)}
          <option value="afara">Altceva — în afara bugetului aprobat</option>
        </select>
        {folosite.size > 0 && <span style={{ display: 'block', marginTop: '4px', fontSize: 'var(--fs-xs)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text-muted)' }}>{BUGET_ACHIZITII.length - disponibile.length} linii ascunse — au deja achiziție (vezi Finalizate / În curs).</span>}
      </label>
      {linie === 'afara' && (
        <div role="alert" style={{ fontSize: 'var(--fs-sm)', padding: '9px 12px', borderRadius: 'var(--r-md)', background: 'var(--warning-soft)', color: 'var(--warning)', fontWeight: 600 }}>
          Ce nu e în bugetul planului de afaceri nu e eligibil automat. Înainte de cumpărare cere acordul PROSOCIAL sau include achiziția printr-un act adițional (ex. realocare din altă linie).
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: '12px' }}>
        <label style={{ ...lab, gridColumn: '1 / -1' }}>Denumire achiziție *
          <input value={denumire} onChange={e => setDenumire(e.target.value)} placeholder="ex. Aer condiționat 12000 BTU" style={inp} />
        </label>
        <label style={lab}>Tip
          <select value={tip} onChange={e => setTip(e.target.value)} style={inp}><option>Produse</option><option>Servicii</option><option>Lucrări</option></select>
        </label>
        <label style={lab}>Sursa
          <select value={sursa} onChange={e => setSursa(e.target.value)} style={inp}><option value="grant">Subvenție (grant)</option><option value="cofinantare">Cofinanțare</option><option value="altul">Altul</option></select>
        </label>
        <label style={lab}>Valoare estimată (lei, cu TVA)
          <input value={valoare} onChange={e => setValoare(e.target.value)} inputMode="decimal" placeholder="ex. 3099" style={inp} />
        </label>
        <label style={{ ...lab, gridColumn: '1 / -1' }}>Specificații tehnice minime
          <textarea value={specificatii} onChange={e => setSpecificatii(e.target.value)} rows={3} placeholder="ex. putere minim 12000 BTU, clasă energetică A++, funcție de încălzire, montaj inclus" style={{ ...inp, resize: 'vertical' }} />
        </label>
      </div>
      {l && valoare && Number(valoare) > l.valoare && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>Valoarea depășește bugetul liniei ({lei(l.valoare)} lei).</div>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" className="btn btn-primary" disabled={!valid || busy} onClick={creeaza}>{busy ? 'Se creează…' : 'Creează achiziția și deschide pașii'}</button>
        <button type="button" className="btn" onClick={onAnuleaza}>Renunță</button>
      </div>
    </div>
  )
}
