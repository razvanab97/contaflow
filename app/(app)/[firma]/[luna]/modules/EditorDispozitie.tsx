'use client'
import { useEffect, useRef, useState } from 'react'
import { deschideDocument } from '@/lib/vizualizare'

export interface EditorFactura { id: string; fisier_nume: string; data_document?: string | null; locatie?: string | null; utilitate?: string | null; suma?: number | null }
export interface EditorDP { id: string; numar_document: string; locatie?: string | null; data?: Record<string, string | number>; attachments?: EditorFactura[] }
interface Firma { id: string; nume: string; cif: string; nrRegCom: string; adresa: string; judet: string; tara: string }

// Randul unei facturi in editor: valorile editabile tin textul din campuri; `initial` = ce era salvat (pentru a trimite doar ce s-a schimbat).
interface Rand { id: string; fisier_nume: string; sumaTxt: string; utilitateTxt: string; locatieTxt: string; dataTxt: string }
const rand = (f: EditorFactura): Rand => ({ id: f.id, fisier_nume: f.fisier_nume, sumaTxt: f.suma != null ? String(f.suma) : '', utilitateTxt: f.utilitate || '', locatieTxt: f.locatie || '', dataTxt: String(f.data_document || '').slice(0, 10) })
const num = (t: string) => { const v = Number(String(t).replace(',', '.')); return Number.isFinite(v) && String(t).trim() !== '' ? v : null }
const r2 = (n: number) => Math.round(n * 100) / 100
const money = (n: number) => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const sumaFacturi = (l: Rand[]) => r2(l.reduce((a, f) => a + (num(f.sumaTxt) || 0), 0))

const INP: React.CSSProperties = { fontSize: 'var(--fs-sm)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '8px 10px', color: 'var(--text-primary)', outline: 'none', width: '100%' }
const LBL: React.CSSProperties = { fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }

// Editarea unei dispozitii de plata deja emise: vezi facturile atasate, le modifici (suma, utilitate,
// apartament, data), le stergi sau adaugi, apoi „Salveaza” regenereaza dispozitia cu noile date.
export default function EditorDispozitie({ dp, firma, lunaId, onClose, onSaved }: { dp: EditorDP; firma: Firma; lunaId: string; onClose: () => void; onSaved: () => void }) {
  const d = dp.data || {}
  const [beneficiar, setBeneficiar] = useState(String(d.beneficiary || ''))
  const [functie, setFunctie] = useState(String(d.function || ''))
  const [data, setData] = useState(String(d.date || '').slice(0, 10))
  const [scop, setScop] = useState(String(d.purpose || ''))
  const [suma, setSuma] = useState(String(d.amount ?? ''))
  const [serie, setSerie] = useState(String(d.identitySeries || ''))
  const [numarCi, setNumarCi] = useState(String(d.identityNumber || ''))
  const [locatie, setLocatie] = useState(dp.locatie || '')
  const [facturi, setFacturi] = useState<Rand[]>(() => (dp.attachments || []).map(rand))
  const initial = useRef<Record<string, Rand>>(Object.fromEntries((dp.attachments || []).map(f => [f.id, rand(f)])))
  const [busyId, setBusyId] = useState('')
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [eroare, setEroare] = useState('')
  const [avertizari, setAvertizari] = useState<string[]>([])
  const fisierRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose, saving])

  // Daca totalul dispozitiei era egal cu suma facturilor, ramane egal dupa orice schimbare (altfel il lasam in pace).
  function aplica(noua: Rand[]) {
    const veche = sumaFacturi(facturi), nou = sumaFacturi(noua)
    if (Math.abs((num(suma) ?? NaN) - veche) < 0.01) setSuma(String(nou))
    setFacturi(noua)
  }
  const seteaza = (id: string, patch: Partial<Rand>) => aplica(facturi.map(f => f.id === id ? { ...f, ...patch } : f))

  async function sterge(f: Rand) {
    if (!confirm(`Ștergi definitiv factura „${f.fisier_nume}"? Nu va mai putea fi recuperată. Ștergerea e imediată — apoi apasă „Salvează” ca să regenerezi dispoziția.`)) return
    setBusyId(f.id); setEroare('')
    const res = await fetch(`/api/chitante/dispozitie/analyze?id=${encodeURIComponent(f.id)}`, { method: 'DELETE' })
    const j = await res.json().catch(() => ({}))
    setBusyId('')
    if (!res.ok) { setEroare(j.error || 'Factura nu a putut fi ștearsă'); return }
    delete initial.current[f.id]
    aplica(facturi.filter(x => x.id !== f.id))
  }

  async function adauga(files: FileList) {
    setAdding(true); setEroare('')
    let lista = facturi
    let sumaCurenta = num(suma)
    const noi: string[] = []
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file); fd.append('firmaId', firma.id); fd.append('lunaId', lunaId); fd.append('number', dp.numar_document)
      fd.append('existingAttachmentIds', lista.map(f => f.id).join(','))
      const res = await fetch('/api/chitante/dispozitie/analyze', { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setEroare(j.error || 'Analiza facturii nu a reușit'); break }
      const nou = rand(j.document as EditorFactura)
      initial.current[nou.id] = nou
      const veche = sumaFacturi(lista)
      lista = [...lista, nou]
      if (Math.abs((sumaCurenta ?? NaN) - veche) < 0.01) { sumaCurenta = sumaFacturi(lista); setSuma(String(sumaCurenta)) }
      if (j.purpose) setScop(prev => prev ? `${prev}; ${j.purpose}` : j.purpose)
      if (j.duplicateWarning) noi.push(`„${nou.fisier_nume}" pare duplicat cu „${j.duplicateWarning.fisierNume}" — verifică să nu fie deja salvată.`)
    }
    setFacturi(lista)
    if (noi.length) setAvertizari(prev => [...prev, ...noi])
    setAdding(false)
  }

  async function salveaza() {
    const total = num(suma)
    if (!beneficiar.trim()) { setEroare('Completează beneficiarul'); return }
    if (!scop.trim()) { setEroare('Completează scopul plății'); return }
    if (total === null || total <= 0) { setEroare('Suma trebuie să fie mai mare decât zero'); return }
    setSaving(true); setEroare('')
    for (const f of facturi) {
      const o = initial.current[f.id]
      if (o && o.sumaTxt === f.sumaTxt && o.utilitateTxt === f.utilitateTxt && o.locatieTxt === f.locatieTxt && o.dataTxt === f.dataTxt) continue
      const r = await fetch('/api/chitante/dispozitie/factura', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: f.id, suma: num(f.sumaTxt), utilitate: f.utilitateTxt, locatie: f.locatieTxt, data_document: f.dataTxt || null }) })
      if (!r.ok) { setEroare(`„${f.fisier_nume}": ${(await r.json().catch(() => ({}))).error || 'factura nu a putut fi salvată'}`); setSaving(false); return }
    }
    const res = await fetch('/api/chitante/dispozitie', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      firmaId: firma.id, lunaId, firmaNume: firma.nume, cif: firma.cif, nrRegCom: firma.nrRegCom, adresa: firma.adresa, judet: firma.judet, tara: firma.tara,
      editId: dp.id, date: data, beneficiary: beneficiar, function: functie, amount: total, purpose: scop, identitySeries: serie, identityNumber: numarCi,
      attachmentIds: facturi.map(f => f.id), locatieEticheta: locatie.trim() || null,
    }) })
    setSaving(false)
    if (!res.ok) { setEroare((await res.json().catch(() => ({}))).error || 'Dispoziția nu a putut fi salvată'); return }
    onSaved(); onClose()
  }

  const totalFacturi = sumaFacturi(facturi)
  const diferenta = (num(suma) ?? 0) - totalFacturi
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }} role="dialog" aria-modal="true" aria-label={`Editează dispoziția ${dp.numar_document}`}>
      <div onClick={() => { if (!saving) onClose() }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)' }} />
      <div className="glass-floating" style={{ position: 'relative', width: 'min(920px, 96vw)', height: '100%', overflowY: 'auto', padding: '24px 26px', borderLeft: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>Editează dispoziția DP nr. {dp.numar_document}</h2>
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', marginTop: '2px' }}>Modifici facturile și sumele, apoi „Salvează” regenerează dispoziția cu datele noi.</p>
          </div>
          <button onClick={() => { if (!saving) onClose() }} aria-label="Închide" style={{ fontSize: 'var(--fs-base)', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>

        <div className="stack-mobile" style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          <label style={LBL}>Beneficiar<input value={beneficiar} onChange={e => setBeneficiar(e.target.value)} style={INP} /></label>
          <label style={LBL}>Calitate / funcție<input value={functie} onChange={e => setFunctie(e.target.value)} style={INP} /></label>
          <label style={LBL}>Data<input type="date" value={data} onChange={e => setData(e.target.value)} style={INP} /></label>
          <label style={LBL}>Suma totală (RON)<input inputMode="decimal" value={suma} onChange={e => setSuma(e.target.value)} style={{ ...INP, fontWeight: 700 }} /></label>
        </div>
        <label style={{ ...LBL, marginBottom: '10px' }}>Scopul plății
          <textarea value={scop} onChange={e => setScop(e.target.value)} rows={3} style={{ ...INP, resize: 'vertical', fontFamily: 'inherit' }} />
          <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>Textul nu se rescrie singur când ștergi sau schimbi o factură — verifică-l.</span>
        </label>
        <div className="stack-mobile" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '10px', marginBottom: '18px' }}>
          <label style={LBL}>Serie CI<input value={serie} onChange={e => setSerie(e.target.value.toUpperCase())} style={INP} /></label>
          <label style={LBL}>Număr CI<input value={numarCi} onChange={e => setNumarCi(e.target.value)} style={INP} /></label>
          <label style={LBL}>Proprietate / apartament<input value={locatie} onChange={e => setLocatie(e.target.value)} style={INP} /></label>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '14px', background: 'var(--surface-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <div>
              <div className="eyebrow">Facturi atașate ({facturi.length})</div>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Total facturi: <b className="num" style={{ color: 'var(--text-primary)' }}>{money(totalFacturi)} RON</b>
                {facturi.length > 0 && Math.abs(diferenta) >= 0.01 && (
                  <> · <span style={{ color: 'var(--warning)' }}>total dispoziție {diferenta > 0 ? '+' : ''}{money(diferenta)} față de facturi</span>{' '}
                    <button onClick={() => setSuma(String(totalFacturi))} className="btn btn-sm" style={{ marginLeft: '4px' }}>Folosește totalul facturilor</button></>
                )}
              </div>
            </div>
            <button onClick={() => fisierRef.current?.click()} disabled={adding} className="btn btn-sm">{adding ? 'AI analizează…' : '+ Adaugă factură'}</button>
            <input ref={fisierRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }} onChange={e => { if (e.target.files?.length) adauga(e.target.files); e.target.value = '' }} />
          </div>

          {facturi.length === 0 && <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>Nicio factură atașată.</p>}
          {avertizari.map((a, i) => <p key={i} role="alert" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)', margin: '0 0 6px' }}>⚠ {a}</p>)}
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: '720px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {facturi.map(f => (
                <div key={f.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                    <span title={f.fisier_nume} style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fisier_nume}</span>
                    <span style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button onClick={() => deschideDocument(`/api/chitante/document?id=${encodeURIComponent(f.id)}`)} className="btn btn-sm">Vezi</button>
                      <button onClick={() => sterge(f)} disabled={busyId === f.id} className="btn btn-sm" style={{ color: 'var(--danger)' }}>{busyId === f.id ? '…' : 'Șterge'}</button>
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 1fr 1fr', gap: '8px' }}>
                    <label style={LBL}>Furnizor / utilitate<input value={f.utilitateTxt} onChange={e => seteaza(f.id, { utilitateTxt: e.target.value })} style={INP} /></label>
                    <label style={LBL}>Apartament<input value={f.locatieTxt} onChange={e => seteaza(f.id, { locatieTxt: e.target.value })} style={INP} /></label>
                    <label style={LBL}>Data facturii<input type="date" value={f.dataTxt} onChange={e => seteaza(f.id, { dataTxt: e.target.value })} style={INP} /></label>
                    <label style={LBL}>Sumă (RON)<input inputMode="decimal" value={f.sumaTxt} onChange={e => seteaza(f.id, { sumaTxt: e.target.value })} style={{ ...INP, fontWeight: 700 }} /></label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {eroare && <p role="alert" style={{ fontSize: 'var(--fs-sm)', color: 'var(--danger)', marginTop: '12px' }}>{eroare}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <button onClick={onClose} disabled={saving} className="btn">Anulează</button>
          <button onClick={salveaza} disabled={saving} className="btn btn-primary">{saving ? 'Se salvează…' : 'Salvează modificările'}</button>
        </div>
      </div>
    </div>
  )
}
