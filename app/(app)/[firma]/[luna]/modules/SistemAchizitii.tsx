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
  const [arata, setArata] = useState<'de_cumparat' | 'toate'>('de_cumparat')
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
          {(['de_cumparat', 'toate'] as const).map(k => <button key={k} type="button" className={arata === k ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setArata(k)}>{k === 'toate' ? 'Toate liniile' : 'De cumpărat'}</button>)}
        </div>
      </div>
      {surse.map(({ sursa, titlu }) => {
        const linii = BUGET_ACHIZITII.filter(l => l.sursa === sursa)
        const planificat = linii.reduce((s, l) => s + l.valoare, 0)
        const achizitii = items.filter(i => coduriDin(i.linie_buget).some(c => linieDupaCod(c)?.sursa === sursa))
        const angajat = achizitii.reduce((s, i) => s + (i.valoare || 0), 0)
        const deCumparat = linii.filter(l => !peLinie(l.cod).length)
        const vizibile = arata === 'toate' ? linii : deCumparat
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
              {!vizibile.length && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--success)' }}>✓ Toate liniile au achiziție pornită.</div>}
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
