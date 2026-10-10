'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { StareFirma } from '@/lib/sistem-lucru'

interface Firma { id: string; slug: string; nume: string; culoare: string }
const CHEIE_EMAIL = 'cf:email-contabil'

// Pasul final al lunii (vezi /sistem-de-lucru): verificarea ca luna e gata + tot ce pleaca la
// contabil - ZIP-ul lunii (contine si lista de discrepante si notele), raspunsul la ultimul mail,
// deschis direct in Gmail (atasezi ZIP-ul descarcat) - apoi bifa "trimis".
export default function PachetContabil({ firma, lunaId, raspuns }: { firma: Firma; lunaId: string; raspuns: string | null }) {
  const [d, setD] = useState<{ stare: StareFirma; lunaKey: string; lunaLabel: string; perioada: string } | null>(null)
  const [email, setEmail] = useState('')
  const [zipBusy, setZipBusy] = useState(false)
  const [mesaj, setMesaj] = useState('')

  const load = useCallback(async () => {
    const r = await fetch(`/api/sistem/stare?firmaId=${encodeURIComponent(firma.id)}&lunaId=${encodeURIComponent(lunaId)}`, { cache: 'no-store' }).catch(() => null)
    if (r?.ok) setD(await r.json())
  }, [firma.id, lunaId])
  useEffect(() => { load(); try { setEmail(localStorage.getItem(CHEIE_EMAIL) || '') } catch {} }, [load])

  if (!d) return <div className="skeleton" style={{ height: '120px' }} />
  const s = d.stare
  const verificari: { ok: boolean; text: string; href: string }[] = [
    { ok: s.extrase > 0, text: s.extrase ? `Extrase încărcate (${s.extrase})` : 'Extrasele lunii nu sunt încărcate', href: `/${firma.slug}/${d.lunaKey}/extras` },
    { ok: s.txFaraDocument === 0, text: s.txFaraDocument ? `${s.txFaraDocument} tranzacții neasociate în Extras` : 'Toate tranzacțiile au document / notă', href: `/${firma.slug}/${d.lunaKey}/extras` },
    ...(s.deFacturat ? [{ ok: !s.deFacturat.n, text: s.deFacturat.n ? `${s.deFacturat.n} rezervări de facturat în 5StarDesk` : 'Toate rezervările facturate', href: `/${firma.slug}/${d.lunaKey}/5stardesk` }] : []),
    ...(s.stardesk ? [{ ok: !s.stardesk.discrepante && !s.stardesk.faraFactura, text: s.stardesk.discrepante || s.stardesk.faraFactura ? `5StarDesk: ${s.stardesk.faraFactura} fără factură, ${s.stardesk.discrepante} discrepanțe (bifează-le în lista de discrepanțe, cu notă)` : '5StarDesk verificat', href: `/${firma.slug}/${d.lunaKey}/5stardesk` }] : []),
    { ok: s.mailDeschise === 0, text: s.mailDeschise ? `${s.mailDeschise} situații deschise din mailul contabilului (mai jos)` : 'Nicio situație deschisă din mailurile contabilului', href: `/${firma.slug}/${d.lunaKey}/mail-contabil` },
  ]
  const gata = verificari.every(v => v.ok)

  async function descarcaZip() {
    setZipBusy(true); setMesaj('')
    try {
      const res = await fetch('/api/export/zip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId: firma.id, firmaNume: firma.nume, firmaSlug: firma.slug, lunaId, luna: d!.lunaLabel }) })
      if (!res.ok) { const e = await res.json().catch(() => ({})); setMesaj(e.error || 'ZIP-ul nu a putut fi generat'); return }
      const b = await res.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a')
      a.href = u; a.download = `${firma.nume.replace(/[^a-zA-Z0-9]+/g, '_')}_${d!.lunaLabel.replace(/\s+/g, '_')}.zip`; a.click(); URL.revokeObjectURL(u)
      setMesaj('ZIP descărcat — atașează-l la mail.')
    } catch { setMesaj('Conexiunea s-a întrerupt') } finally { setZipBusy(false) }
  }

  const subiect = `Contabilitate ${firma.nume} — ${d.perioada}`
  const corp = `Bună ziua,\n\nVă trimit documentele pentru ${firma.nume}, ${d.perioada} (arhiva ZIP atașată: extrase, facturi în ordinea plăților, note tranzacții, lista de discrepanțe).\n\n${raspuns ? raspuns.replace(/^Bună ziua,\n\n/, '').replace(/\n\nVă mulțumim,\nO zi frumoasă!$/, '') + '\n\n' : ''}Vă mulțumim,\nO zi frumoasă!`
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subiect)}&body=${encodeURIComponent(corp)}`

  async function marcheazaTrimis() {
    const res = await fetch('/api/tasks/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lunaId, taskKey: 'sistem.pachet_trimis', completat: !s.pachetTrimis }) }).catch(() => null)
    if (res?.ok) load()
  }

  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderColor: s.pachetTrimis ? 'var(--success)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 'var(--fs-base)', fontWeight: 650, color: 'var(--text-primary)' }}>Pachet pentru contabil · {d.perioada}</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '2px' }}>Ultimul pas al lunii (vezi <Link href="/sistem-de-lucru" style={{ color: 'var(--accent)' }}>Sistem de lucru</Link>). Trimite doar când toate verificările sunt bifate.</div>
        </div>
        <span className={s.pachetTrimis ? 'badge badge-success' : gata ? 'badge badge-success' : 'badge badge-warning'}>{s.pachetTrimis ? '✓ trimis' : gata ? 'gata de trimis' : 'mai sunt pași'}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {verificari.map((v, i) => (
          <Link key={i} href={v.href} style={{ fontSize: 'var(--fs-sm)', color: v.ok ? 'var(--text-secondary)' : 'var(--warning)', textDecoration: 'none' }}>{v.ok ? '✓' : '●'} {v.text}</Link>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn" onClick={descarcaZip} disabled={zipBusy}>{zipBusy ? 'Se generează ZIP-ul…' : '1. Descarcă ZIP-ul lunii'}</button>
        <input value={email} onChange={e => { setEmail(e.target.value); try { localStorage.setItem(CHEIE_EMAIL, e.target.value) } catch {} }} placeholder="email contabil" type="email"
          style={{ fontSize: 'var(--fs-sm)', background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '7px 10px', color: 'var(--text-primary)', outline: 'none', width: '210px' }} />
        <a className="btn btn-primary" href={gmail} target="_blank" rel="noreferrer">2. Scrie mailul în Gmail</a>
        <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(corp).then(() => setMesaj('Textul mailului a fost copiat'))}>Copiază textul</button>
        <button className={s.pachetTrimis ? 'btn btn-sm' : 'btn btn-sm btn-ghost'} onClick={marcheazaTrimis}>{s.pachetTrimis ? 'Anulează „trimis”' : '3. Marchează trimis'}</button>
      </div>
      {mesaj && <div role="status" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>{mesaj}</div>}
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Gmail se deschide cu destinatarul, subiectul și textul completate {raspuns ? '(inclusiv răspunsul la ultimul mail al contabilului)' : ''}; atașezi ZIP-ul descărcat și trimiți tu.</div>
    </div>
  )
}
