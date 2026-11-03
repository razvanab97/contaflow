'use client'
import { useState } from 'react'
import { FORM_FIELDS, PROFILE_FIELDS, emptyLine, validateDraft, type Draft, type FormKind, type Line, type Workflow } from '@/lib/proiect-workflow'
import { PURCHASE_FIELD_HELP, type FieldRecommendation, type PurchaseContext } from '@/lib/achizitii-form-recommendations'
import { purchaseAmounts } from '@/lib/achizitii-vat'
import { deschideDocument } from '@/lib/vizualizare'
import PurchaseOfferPrefill from '@/components/proiect/PurchaseOfferPrefill'
import PurchaseReceptionPrefill from '@/components/proiect/PurchaseReceptionPrefill'
import PurchaseAiRecommendations from '@/components/proiect/PurchaseAiRecommendations'
import s from '@/components/proiect/PurchaseForm.module.css'

// Formularele unei achizitii (cerere de oferta / nota de estimare / PV receptie) intr-un flux simplu
// in 3 pasi: 1) completare automata, 2) verificarea datelor, 3) produsele - plus bara de generare.
// Tot ce e secundar (date beneficiar, ajutor, exemplu, campuri rare ale produsului) e ascuns pana
// e nevoie de el. Logica (salvare, generare, recomandari) ramane in ProiectWorkflow.

const KINDS: FormKind[] = ['oferta', 'nota', 'receptie']
const SHORT: Record<string, string> = { oferta: 'Cerere de ofertă', nota: 'Notă de estimare', receptie: 'PV de recepție' }
const AUTO: Record<string, { titlu: string; text: string; buton: string }> = {
  oferta: { titlu: 'Propune specificații și condiții', text: 'AI-ul propune specificațiile produselor și condițiile cererii, pe baza achiziției.', buton: 'Propune cu AI' },
  nota: { titlu: 'Completează din ofertele primite', text: 'AI-ul citește cele 3 oferte PDF din dosar și completează tabelul și justificarea.', buton: 'Completează din oferte' },
  receptie: { titlu: 'Completează din factură', text: 'AI-ul citește factura, comanda și dovada plății din dosar și propune tot procesul-verbal.', buton: 'Completează din factură' },
}
const LUNGI = new Set(['constatari', 'justificare', 'conditii'])
const money = (n: number) => n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function PurchaseFormEditor(props: {
  firmaId: string; scope: string; state: Workflow; kind: FormKind; onKind: (k: FormKind) => void
  draft: Draft; onDraft: (d: Draft) => void; onProfile: (p: Record<string, string>) => void
  recommendations: Record<string, FieldRecommendation>; productExample: Pick<Line, 'product' | 'specs'> | null
  example?: { id: string; name: string; current: boolean }; purchase: PurchaseContext | null
  disabled: boolean; onGenerate: () => void; assetUrl: (id: string) => string
}) {
  const { firmaId, scope, state, kind, draft, onDraft, recommendations } = props
  const [asistent, setAsistent] = useState(false)
  const [profil, setProfil] = useState(false)
  const [ajutor, setAjutor] = useState<string | null>(null)
  const [deschis, setDeschis] = useState<number | null>(draft.lines.some(l => l.product.trim()) ? null : 0)
  const [versiuni, setVersiuni] = useState(false)

  const campuri = Object.entries(FORM_FIELDS[kind])
  const completate = campuri.filter(([k]) => draft.fields[k]?.trim()).length
  const lipsuri = validateDraft(kind, draft, state.profile)
  const generate = state.assets.filter(a => a.task === kind)
  const ultima = generate[generate.length - 1]
  const auto = AUTO[kind]
  const setLine = (i: number, patch: Partial<Line>) => onDraft({ ...draft, lines: draft.lines.map((l, j) => j === i ? { ...l, ...patch } : l) })
  const setField = (k: string, v: string) => onDraft({ ...draft, fields: { ...draft.fields, [k]: v } })
  const alteFormulare = KINDS.filter(k => k !== kind && state.forms[k]?.lines.some(l => l.product.trim()))

  return <div className={s.flow}>
    {/* Alegerea formularului, cu starea fiecaruia */}
    <div className={s.kinds} role="tablist" aria-label="Formularul achiziției">
      {KINDS.map(k => {
        const n = state.assets.filter(a => a.task === k).length
        return <button key={k} type="button" role="tab" aria-selected={k === kind} onClick={() => { props.onKind(k); setAsistent(false); setDeschis(null) }}>
          <strong>{SHORT[k]}</strong>
          <small className={n ? s.ok : undefined}>{n ? '✓ Word generat' : state.forms[k]?.fields.numar?.trim() || state.forms[k]?.lines.some(l => l.price.trim()) ? 'În lucru' : 'De completat'}</small>
        </button>
      })}
    </div>

    {/* Pasul 1 - completare automata */}
    <section className={s.step}>
      <div className={s.stepHead}>
        <span className={s.num}>1</span>
        <div><h3>{auto.titlu}</h3><p>{auto.text}</p></div>
        <button type="button" className="btn btn-primary" disabled={props.disabled} onClick={() => setAsistent(v => !v)}>{asistent ? 'Ascunde' : auto.buton}</button>
      </div>
      {asistent && <div className={s.stepBody}>
        {kind === 'receptie' && <PurchaseReceptionPrefill key={scope} firmaId={firmaId} scope={scope} draft={draft} onApply={onDraft} />}
        {kind === 'nota' && <PurchaseOfferPrefill key={scope} firmaId={firmaId} scope={scope} draft={draft} onApply={onDraft} />}
        {kind === 'oferta' && <PurchaseAiRecommendations key={`${scope}-${kind}`} firmaId={firmaId} scope={scope} kind={kind} draft={draft} onApply={onDraft} />}
      </div>}
    </section>

    {/* Pasul 2 - datele documentului */}
    <section className={s.step}>
      <div className={s.stepHead}>
        <span className={s.num}>2</span>
        <div><h3>Verifică datele</h3><p>{completate} din {campuri.length} câmpuri completate</p></div>
      </div>
      <div className={s.stepBody}>
        <div className={s.beneficiar}>
          <span><strong>Beneficiar:</strong> {[state.profile.beneficiar, state.profile.reprezentant, state.profile.cui && `CUI ${state.profile.cui}`].filter(Boolean).join(' · ') || 'necompletat'}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setProfil(v => !v)}>{profil ? 'Gata' : 'Modifică'}</button>
        </div>
        {profil && <div className={s.fields}>{Object.entries(PROFILE_FIELDS).map(([k, label]) =>
          <label key={k} className={s.field}><span>{label}</span><input value={state.profile[k] || ''} onChange={e => props.onProfile({ ...state.profile, [k]: e.target.value })} /></label>)}</div>}
        <div className={s.fields}>
          {campuri.map(([k, label]) => {
            const val = draft.fields[k] || ''
            const rec = recommendations[k]
            return <div key={k} className={`${s.field} ${LUNGI.has(k) ? s.wide : ''}`}>
              <span>{label}{PURCHASE_FIELD_HELP[k] && <button type="button" className={s.q} aria-label={`Ajutor: ${label}`} onClick={() => setAjutor(a => a === k ? null : k)}>?</button>}</span>
              {ajutor === k && <p className={s.help}>{PURCHASE_FIELD_HELP[k]}</p>}
              {k === 'comanda_online'
                ? <select value={val || 'nu'} onChange={e => setField(k, e.target.value)}><option value="nu">nu</option><option value="da">da</option></select>
                : LUNGI.has(k)
                  ? <textarea rows={Math.min(8, Math.max(3, Math.ceil(val.length / 110)))} value={val} onChange={e => setField(k, e.target.value)} />
                  : <input value={val} onChange={e => setField(k, e.target.value)} />}
              {rec && !val.trim() && <button type="button" className={s.sugestie} onClick={() => setField(k, rec.value)} title={`Sursă: ${rec.source}`}>Preia: {rec.value.length > 70 ? rec.value.slice(0, 70) + '…' : rec.value}</button>}
            </div>
          })}
        </div>
      </div>
    </section>

    {/* Pasul 3 - produsele */}
    <section className={s.step}>
      <div className={s.stepHead}>
        <span className={s.num}>3</span>
        <div><h3>Produse</h3><p>{draft.lines.length === 1 ? '1 poziție' : `${draft.lines.length} poziții`}{kind === 'nota' ? ' · o poziție pentru fiecare ofertă' : ''}</p></div>
      </div>
      <div className={s.stepBody}>
        {draft.lines.map((l, i) => {
          const a = purchaseAmounts(l.price, l.qty, l.rate, l.priceMode || 'net')
          const open = deschis === i
          return <div key={i} className={s.line}>
            <div className={s.lineRow}>
              <div className={s.lineMain}>
                <strong>{l.product || 'Produs de completat'}</strong>
                <small>{[l.supplier, `${l.qty || '?'} ${l.unit}`, a ? `${money(a.netTotal)} lei fără TVA · ${money(a.grossTotal)} lei cu TVA` : 'preț de completat'].filter(Boolean).join(' · ')}</small>
              </div>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDeschis(open ? null : i)}>{open ? 'Gata' : 'Editează'}</button>
              <button type="button" className="btn btn-sm btn-ghost" aria-label={`Elimină poziția ${i + 1}`} onClick={() => { if (confirm('Elimini această poziție?')) { onDraft({ ...draft, lines: draft.lines.filter((_, j) => j !== i) }); setDeschis(null) } }}>✕</button>
            </div>
            {open && <div className={s.lineEdit}>
              <div className={s.fields}>
                <label className={`${s.field} ${s.wide}`}><span>Produs / serviciu</span><input value={l.product} onChange={e => setLine(i, { product: e.target.value })} /></label>
                <label className={`${s.field} ${s.wide}`}><span>Specificații tehnice</span><textarea rows={3} value={l.specs} onChange={e => setLine(i, { specs: e.target.value })} /></label>
                <label className={s.field}><span>Cantitate</span><input value={l.qty} onChange={e => setLine(i, { qty: e.target.value })} /></label>
                <label className={s.field}><span>UM</span><input value={l.unit} onChange={e => setLine(i, { unit: e.target.value })} /></label>
                <label className={s.field}><span>Preț unitar</span><input value={l.price} inputMode="decimal" onChange={e => setLine(i, { price: e.target.value })} /></label>
                <label className={s.field}><span>Prețul este</span><select value={l.priceMode || 'net'} onChange={e => setLine(i, { priceMode: e.target.value as 'gross' | 'net' })}><option value="net">fără TVA</option><option value="gross">cu TVA (21%)</option></select></label>
                <label className={`${s.field} ${s.wide}`}><span>Furnizor</span><input value={l.supplier} onChange={e => setLine(i, { supplier: e.target.value })} /></label>
              </div>
              {a && <p className={s.total}>{money(a.netTotal)} lei fără TVA + {money(a.vatTotal)} lei TVA = <strong>{money(a.grossTotal)} lei cu TVA</strong></p>}
              <details className={s.more}><summary>Mai multe: site, monedă, sursă, dată</summary>
                <div className={s.fields}>
                  <label className={s.field}><span>Site furnizor</span><input value={l.website || ''} onChange={e => setLine(i, { website: e.target.value })} /></label>
                  <label className={s.field}><span>Monedă</span><input value={l.currency} onChange={e => setLine(i, { currency: e.target.value })} /></label>
                  <label className={s.field}><span>Curs în lei (1 pentru RON)</span><input value={l.rate} onChange={e => setLine(i, { rate: e.target.value })} /></label>
                  <label className={s.field}><span>Data ofertei</span><input value={l.date} onChange={e => setLine(i, { date: e.target.value })} /></label>
                  <label className={`${s.field} ${s.wide}`}><span>Sursă / URL ofertă</span><input value={l.source} onChange={e => setLine(i, { source: e.target.value })} /></label>
                </div>
              </details>
            </div>}
          </div>
        })}
        <div className={s.lineActions}>
          <button type="button" className="btn btn-sm" onClick={() => { onDraft({ ...draft, lines: [...draft.lines, emptyLine()] }); setDeschis(draft.lines.length) }}>+ Adaugă poziție</button>
          {props.productExample && !draft.lines.some(l => l.product.trim()) && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { const lines = draft.lines.length ? draft.lines.map((l, j) => j === 0 ? { ...l, ...props.productExample } : l) : [{ ...emptyLine(), ...props.productExample }]; onDraft({ ...draft, lines }) }}>Adaugă „{props.productExample.product}” din achiziție</button>}
          {alteFormulare.map(k => <button key={k} type="button" className="btn btn-sm btn-ghost" onClick={() => { if (confirm(`Înlocuiești produsele cu cele din ${SHORT[k]}?`)) onDraft({ ...draft, lines: structuredClone(state.forms[k].lines) }) }}>Copiază din {SHORT[k]}</button>)}
        </div>
      </div>
    </section>

    {/* Ajutor - ascuns implicit */}
    {props.example && <details className={s.guide}><summary>Vezi un document completat de exemplu</summary>
      <p>{props.example.name} · {props.example.current ? 'din acest dosar' : 'din alt dosar AB Textile, doar pentru orientare'}</p>
      <button type="button" className="btn btn-sm" onClick={() => deschideDocument(`/api/chitante/document?id=${props.example!.id}`, props.example!.name)}>Deschide exemplul</button>
    </details>}

    {/* Bara de generare */}
    <div className={s.bar}>
      <button type="button" className="btn btn-primary" disabled={props.disabled} onClick={props.onGenerate}>Generează Word</button>
      <div className={s.barStatus}>
        {lipsuri.length
          ? <><strong className={s.warn}>Lipsesc {lipsuri.length}:</strong> <span>{lipsuri.slice(0, 3).join(' · ')}{lipsuri.length > 3 ? ' …' : ''}</span></>
          : <strong className={s.ok}>✓ Gata de generat</strong>}
        {ultima && <span className={s.last}>Ultima versiune: <a href={props.assetUrl(ultima.id)}>{new Date(ultima.createdAt).toLocaleDateString('ro-RO')} ↓</a>{generate.length > 1 && <button type="button" className={s.link} onClick={() => setVersiuni(v => !v)}>toate ({generate.length})</button>}</span>}
      </div>
      {versiuni && <ul className={s.versions}>{generate.slice().reverse().map(a => <li key={a.id}><a href={props.assetUrl(a.id)}>{a.name} ↓</a> <span>{new Date(a.createdAt).toLocaleString('ro-RO')}</span></li>)}</ul>}
    </div>
  </div>
}
