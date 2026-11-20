'use client'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { deschideDocument } from '@/lib/vizualizare'

interface Semnat { id: string; fisier_nume: string; fisier_marime: number | null; created_at: string }
interface Raport { id: string | null; fisier_nume: string; fisier_marime: number | null; created_at: string; luna: string; semnat: Semnat | null }
const marime = (b: number | null) => !b ? '' : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`
const data = (s: string) => new Date(s).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' })
const titlu = (n: string) => n.replace(/\.[a-z0-9]+$/i, '')
const EV_SEMNAT = 'cf:raport-semnat'

// Lista rapoartelor salvate, recitita dupa fiecare salvare a editorului si dupa fiecare incarcare a unei variante semnate.
function useRapoarte(firmaId: string) {
  const [rapoarte, setRapoarte] = useState<Raport[] | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const incarca = useCallback(() => {
    fetch(`/api/proiect-documente/rapoarte?firmaId=${encodeURIComponent(firmaId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).then(d => { if (d?.rapoarte) setRapoarte(d.rapoarte) }).catch(() => {})
  }, [firmaId])
  useEffect(() => {
    incarca()
    // editorul salveaza automat: dupa fiecare salvare reciteste lista (cu o mica intarziere, ca sa nu se repete la fiecare tasta)
    const dupaSalvare = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(incarca, 1500) }
    window.addEventListener('cf:raport-salvat', dupaSalvare)
    window.addEventListener(EV_SEMNAT, incarca)
    return () => { window.removeEventListener('cf:raport-salvat', dupaSalvare); window.removeEventListener(EV_SEMNAT, incarca); if (timer.current) clearTimeout(timer.current) }
  }, [incarca])
  return { rapoarte, incarca }
}

// Incarca varianta semnata a unei luni: URL semnat → fisierul direct in storage → inregistrare. Inlocuieste o varianta semnata mai veche.
async function incarcaSemnat(firmaId: string, luna: string, f: File) {
  const tip = f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : '')
  const r1 = await fetch('/api/proiect-documente/rapoarte', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, luna, nume: f.name, tip, marime: f.size }) })
  const d1 = await r1.json().catch(() => ({}))
  if (!r1.ok || !d1.url) throw new Error(d1.error || 'Încărcarea nu a putut fi pregătită.')
  const up = await fetch(d1.url, { method: 'PUT', headers: { 'Content-Type': tip || 'application/octet-stream' }, body: f }).catch(() => null)
  if (!up?.ok) throw new Error('Fișierul nu a putut fi încărcat. Verifică internetul și reîncearcă.')
  const r2 = await fetch('/api/proiect-documente/rapoarte', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, luna, path: d1.path, tip, marime: f.size, nume: f.name }) })
  const d2 = await r2.json().catch(() => ({}))
  if (!r2.ok) throw new Error(d2.error || 'Raportul semnat nu a putut fi salvat.')
  window.dispatchEvent(new Event(EV_SEMNAT))
}

// Buton „Adaugă semnat” / „Înlocuiește” cu selectorul de fisier ascuns.
function IncarcaSemnatBtn({ firmaId, luna, label, className }: { firmaId: string; luna: string; label: string; className: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  async function ales(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy(true)
    try { await incarcaSemnat(firmaId, luna, f) } catch (err) { alert(err instanceof Error ? err.message : 'Încărcarea a eșuat.') } finally { setBusy(false) }
  }
  return (
    <>
      <input ref={input} type="file" accept="application/pdf,.pdf,image/*" hidden onChange={ales} />
      <button type="button" className={className} disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Se încarcă…' : label}</button>
    </>
  )
}

// Cererea de dupa generare: raportul lunii din editor nu are inca varianta semnata → „Încarcă raportul semnat”.
// Dispare cand varianta semnata e salvata (ramane apoi in Istoric, langa raportul generat).
export function CerereRaportSemnat({ firmaId, fisierNume }: { firmaId: string; fisierNume: string | null }) {
  const { rapoarte } = useRapoarte(firmaId)
  const r = rapoarte?.find(x => x.id && x.fisier_nume === fisierNume)
  if (!r || !r.luna || r.semnat) return null
  return (
    <section className="card card-pad" aria-label="Raport semnat" style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', borderColor: 'color-mix(in srgb, var(--warning) 40%, transparent)' }}>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-md)', fontWeight: 650, color: 'var(--text-primary)' }}>✍ Adaugă raportul semnat · {titlu(r.fisier_nume).replace('Raport implementare ', '')}</div>
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: '2px 0 0' }}>Raportul e generat. După ce îl tipărești și îl semnezi, încarcă-l aici (PDF sau poză). Rămâne salvat în Istoric, separat de cel generat, și nu se pierde la regenerare.</p>
      </div>
      <IncarcaSemnatBtn firmaId={firmaId} luna={r.luna} label="Încarcă raportul semnat" className="btn btn-primary" />
    </section>
  )
}

// Rapoartele lunare salvate in platforma, cate unul pe luna raportata: „Raport implementare <Luna> <An>”. Documentul de sus
// (editorul) e cel curent, se inlocuieste la fiecare generare; aici ramane fiecare luna, cu previzualizare si descarcare,
// plus varianta semnata a lunii (incarcata de utilizator, pastrata separat).
export default function RapoarteSalvate({ firmaId, curent, actualizatLa, gol }: { firmaId: string; curent?: string | null; actualizatLa?: string | null; gol?: ReactNode }) {
  const { rapoarte, incarca } = useRapoarte(firmaId)

  async function sterge(id: string, nume: string) {
    if (!confirm(`Ștergi „${nume}” din rapoartele salvate?`)) return
    const res = await fetch(`/api/proiect-documente/rapoarte?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (res.ok) incarca(); else alert('Raportul nu a putut fi șters.')
  }

  if (!rapoarte) return null
  if (!rapoarte.length) return <>{gol ?? null}</>
  return (
    <section className="card card-pad" aria-label="Rapoarte salvate">
      <div style={{ fontSize: 'var(--fs-md)', fontWeight: 650, color: 'var(--text-primary)' }}>Rapoarte salvate, pe luni</div>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: '2px 0 10px' }}>Fiecare lună raportată rămâne aici, la îndemână. Regenerarea aceleiași luni îl înlocuiește doar pe al ei; varianta semnată rămâne neatinsă.</p>
      <div className="module-list">
        {rapoarte.map(r => {
          const eCurent = !!(r.id && curent && r.fisier_nume === curent)
          return (
            <div key={r.id || `s-${r.luna}`} className="module-item" style={{ cursor: 'default', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 340px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{titlu(r.fisier_nume)}</span>
                  {eCurent && <span className="badge badge-success" title="Documentul din editor">În editare</span>}
                  {r.semnat ? <span className="badge badge-success" title={r.semnat.fisier_nume}>✍ Semnat</span> : <span className="badge badge-warning">Nesemnat</span>}
                </div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {[r.id ? marime(r.fisier_marime) : 'raportul generat a fost șters', r.id ? (eCurent && actualizatLa ? `actualizat ${data(actualizatLa)}` : `salvat ${data(r.created_at)}`) : '', r.semnat ? `semnat încărcat ${data(r.semnat.created_at)}${r.semnat.fisier_marime ? ` (${marime(r.semnat.fisier_marime)})` : ''}` : ''].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="module-item-actions" style={{ flexWrap: 'wrap' }}>
                {r.id && <>
                  <button type="button" className="btn btn-sm" onClick={() => deschideDocument(`/api/chitante/document?id=${r.id}`, r.fisier_nume)}>Vezi</button>
                  <a className="btn btn-sm btn-ghost" href={`/api/chitante/document?id=${r.id}`}>Descarcă</a>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => sterge(r.id!, r.fisier_nume)} aria-label={`Șterge ${r.fisier_nume}`}>Șterge</button>
                </>}
                {r.semnat ? <>
                  <button type="button" className="btn btn-sm" onClick={() => deschideDocument(`/api/chitante/document?id=${r.semnat!.id}`, r.semnat!.fisier_nume)}>Vezi semnat</button>
                  <a className="btn btn-sm btn-ghost" href={`/api/chitante/document?id=${r.semnat.id}`}>Descarcă semnat</a>
                  {r.luna && <IncarcaSemnatBtn firmaId={firmaId} luna={r.luna} label="Înlocuiește" className="btn btn-sm btn-ghost" />}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => sterge(r.semnat!.id, r.semnat!.fisier_nume)} aria-label={`Șterge ${r.semnat.fisier_nume}`}>Șterge semnat</button>
                </> : r.luna && <IncarcaSemnatBtn firmaId={firmaId} luna={r.luna} label="✍ Adaugă semnat" className="btn btn-sm btn-primary" />}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
