import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'
import PachetTrimisToggle from '@/components/PachetTrimisToggle'
import { getActiveFirme } from '@/lib/queries'
import { getServiceSupabase } from '@/lib/supabase/server'
import { getStareFirma, getFolderLocalDeRezolvat, type StareFirma } from '@/lib/sistem-lucru'
import { accountingFullLabel, currentWorkMonthKey } from '@/lib/accounting-period'

export const dynamic = 'force-dynamic'

// "Sistem de lucru": CE, CUM si IN CE ORDINE se lucreaza la cele 3 firme - reguli la sursa, rutina
// saptamanala si inchiderea lunii, cu bifele calculate din datele reale ale lunii curente.

type Celula = { ok: boolean | null; text: string; href?: string }
const NA: Celula = { ok: null, text: '—' }
const lei = (v: number) => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

function Stare({ c }: { c: Celula }) {
  const continut = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--fs-sm)', fontWeight: 600, color: c.ok === null ? 'var(--text-muted)' : c.ok ? 'var(--success)' : 'var(--warning)' }}>
      {c.ok === null ? '—' : c.ok ? '✓' : '●'} <span style={{ fontWeight: 500, color: c.ok === null ? 'var(--text-muted)' : 'var(--text-secondary)' }}>{c.ok === null ? '' : c.text}</span>
    </span>
  )
  return c.href && c.ok !== null ? <Link href={c.href} style={{ textDecoration: 'none' }}>{continut}</Link> : continut
}

function Sectiune({ nr, titlu, sub, children }: { nr: string; titlu: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <div className="eyebrow">{nr}</div>
        <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>{titlu}</div>
        {sub && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '2px' }}>{sub}</div>}
      </div>
      {children}
    </section>
  )
}

const REGULI: { titlu: string; cum: string; deCe: string }[] = [
  { titlu: 'Factura 5StarDesk pe prețul complet, la check-out', cum: 'Airbnb: suma din borderou + comisionul Airbnb (= ce a plătit clientul). Booking: suma încasată. Lista gata calculată: 5StarDesk → „De facturat”.', deCe: 'Elimină refacturările de diferențe cerute lunar de contabil (21 de cazuri în septembrie).' },
  { titlu: 'La orice plată OP: numărul facturii + furnizorul în detalii', cum: 'Ex. „Fact WIN 1414 Winner Global Trade”, nu doar „155”.', deCe: 'Plata se asociază singură cu factura; nu mai rămân tranzacții neidentificate (RADMAN, D.M.R.O.).' },
  { titlu: 'Plățile cash: factură + chitanță, pe loc, în folderul local', cum: 'Poză/PDF în ~/Desktop/Facturi ContaFlow imediat după plată; apar apoi la „Facturi + chitanță” → „Recomandate din fișiere”.', deCe: 'Nu se mai pierd chitanțe; contabilul nu mai cere „furnizori neachitați”.' },
  { titlu: 'Comenzi online: factura fiscală, nu avizul', cum: 'eMAG/PayU: butonul „Factura …” din comandă, nu „Aviz de însoțire”.', deCe: 'Avizul „nu reprezintă factură fiscală” — contabilul îl respinge.' },
]

export default async function SistemDeLucruPage() {
  const luna = currentWorkMonthKey()
  const firme = (await getActiveFirme()).filter((f: { slug: string }) => f.slug !== 'proiect-ab-textile')
  const sb = getServiceSupabase()
  const [stari, folderLocal] = await Promise.all([
    Promise.all(firme.map((f: { id: string; slug: string }) => getStareFirma(sb, f, luna).catch(() => null))),
    getFolderLocalDeRezolvat(sb),
  ])
  const F = firme.map((f: { id: string; slug: string; nume: string; culoare: string }, i: number) => ({ ...f, s: stari[i] as StareFirma | null }))
  const u = (slug: string, modul: string) => `/${slug}/${luna}/${modul}`

  // Inchiderea lunii: pasii in ordine; fiecare celula = starea reala a firmei la acel pas.
  const PASI: { zi: string; titlu: string; cum: string; cel: (f: typeof F[number]) => Celula }[] = [
    { zi: '1–2', titlu: 'Extrase bancare — toate conturile (RON + EUR)', cum: 'Extras de cont → încarcă PDF-ul/CSV-ul fiecărui cont.',
      cel: f => !f.s?.lunaId ? { ok: false, text: 'luna neîncepută', href: `/${f.slug}/${luna}` } : f.s.extrase ? { ok: true, text: `${f.s.extrase} încărcate`, href: u(f.slug, 'extras') } : { ok: false, text: 'lipsă', href: u(f.slug, 'extras') } },
    { zi: '1–2', titlu: 'Documentele platformelor', cum: 'ABXHomes: CSV Airbnb + borderoul Booking (complet). AB Homes Invest: cele 6 avize eMAG (RO/BG/HU) + facturile Dante + curierat.',
      cel: f => {
        if (!f.s?.lunaId) return NA
        if (f.s.airbnbCsv !== null) return f.s.airbnbCsv && f.s.bookingBorderou ? { ok: true, text: `Airbnb ${f.s.airbnbCsv} · Booking ${f.s.bookingBorderou}`, href: u(f.slug, 'airbnb-borderou') } : { ok: false, text: `${f.s.airbnbCsv ? '' : 'CSV Airbnb lipsă '}${f.s.bookingBorderou ? '' : 'borderou Booking lipsă'}`.trim(), href: u(f.slug, f.s.airbnbCsv ? 'booking-facturi' : 'airbnb-borderou') }
        if (f.s.avizeEmag !== null) return f.s.avizeEmag >= 6 ? { ok: true, text: `${f.s.avizeEmag} avize`, href: u(f.slug, 'emag') } : { ok: false, text: `${f.s.avizeEmag}/6 avize`, href: u(f.slug, 'emag') }
        return NA
      } },
    { zi: '2–3', titlu: '5StarDesk: tot facturat, fără discrepanțe', cum: '„De facturat” la zero; verificarea fără „Fără factură client”, fără discrepanțe și fără rezervări Booking lipsă din borderou. Ce rămâne → bifat în lista de discrepanțe, cu notă.',
      cel: f => {
        if (!f.s?.stardesk && !f.s?.deFacturat) return NA
        const p = [f.s.deFacturat?.n ? `${f.s.deFacturat.n} de facturat` : '', f.s.stardesk?.faraFactura ? `${f.s.stardesk.faraFactura} fără factură` : '', f.s.stardesk?.discrepante ? `${f.s.stardesk.discrepante} discrepanțe` : '', f.s.stardesk?.bookingLipsa ? `${f.s.stardesk.bookingLipsa} Booking lipsă` : ''].filter(Boolean)
        return { ok: !p.length, text: p.length ? p.join(' · ') : 'la zi', href: u(f.slug, '5stardesk') }
      } },
    { zi: '3–4', titlu: 'Extras: „Neasociate” la zero', cum: 'Fiecare tranzacție: document (căutare / asociere multiplă), sau notă / ignorare cu motiv.',
      cel: f => !f.s?.extrase ? NA : { ok: !f.s.txFaraDocument, text: f.s.txFaraDocument ? `${f.s.txFaraDocument} neasociate` : 'toate asociate', href: u(f.slug, 'extras') } },
    { zi: '4', titlu: 'Facturi rămase în Inbox: cash, restante sau asociate', cum: 'Cash → „Facturi + chitanță” (Recomandate din fișiere). Neplătite → Facturi restante. Plătite prin bancă → asociază în Extras.',
      cel: f => !f.s?.lunaId ? NA : { ok: !f.s.inboxNeasociateVechi, text: f.s.inboxNeasociateVechi ? `${f.s.inboxNeasociateVechi} mai vechi de 30 de zile` : 'la zi', href: u(f.slug, 'inbox-facturi') } },
    { zi: '5', titlu: 'Impozite', cum: 'Plata impozitelor lunii (termen 25 ale lunii) — bifează fiecare plată.',
      cel: f => !f.s?.lunaId ? NA : { ok: !f.s.impoziteRamase, text: f.s.impoziteRamase ? `${f.s.impoziteRamase} de plătit` : 'plătite', href: u(f.slug, 'impozite') } },
    { zi: '5', titlu: 'Raport lunar', cum: 'Rezumatul lunii verificat.',
      cel: f => !f.s?.lunaId ? NA : { ok: f.s.raportGata, text: f.s.raportGata ? 'gata' : 'de făcut', href: u(f.slug, 'raport-lunar') } },
    { zi: '5–7', titlu: 'Mail contabil: fiecare situație rezolvată sau cu notă', cum: 'Mailul contabilului → Mail contabil (lipești textul/captura) → rezolvi → „Răspuns către contabil”.',
      cel: f => !f.s?.lunaId ? NA : { ok: !f.s.mailDeschise, text: f.s.mailDeschise ? `${f.s.mailDeschise} deschise${f.s.mailVechi ? ` (${f.s.mailVechi} > 14 zile)` : ''}` : 'nimic deschis', href: u(f.slug, 'mail-contabil') } },
  ]

  return (
    <main className="page animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <PageHeader back={{ href: '/dashboard', label: 'Dashboard' }} title="Sistem de lucru"
        description={<>Ce, cum și în ce ordine — la AB Homes Invest, ABXHomes și AB Textile. Bifele sunt calculate din datele reale pentru <b>{accountingFullLabel(luna)}</b>.</>} />

      <Sectiune nr="1 · Mereu" titlu="Patru reguli la sursă" sub="Elimină cea mai mare parte din munca de la final de lună — erorile nu mai apar, deci nu mai trebuie corectate.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: '10px' }}>
          {REGULI.map((r, i) => (
            <div key={i} style={{ padding: '12px', borderRadius: 'var(--r-md)', background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 'var(--fs-md)', fontWeight: 650, color: 'var(--text-primary)' }}>{String.fromCharCode(97 + i)}) {r.titlu}</div>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '4px' }}><b>Cum:</b> {r.cum}</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '4px' }}><b>De ce:</b> {r.deCe}</div>
            </div>
          ))}
        </div>
      </Sectiune>

      <Sectiune nr="2 · Săptămânal — luni, ~30 min" titlu="Rutina săptămânală" sub="Ținută în timpul lunii, închiderea durează câteva ore în loc de zile.">
        <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <li>
            <b>Folderul local:</b> pune tot ce s-a adunat (facturi, chitanțe, bonuri) în <code>~/Desktop/Facturi ContaFlow</code>; scriptul le repartizează pe firme. Atribuie manual ce rămâne pe Dashboard.
            <div style={{ marginTop: '4px' }}><Stare c={{ ok: !folderLocal, text: folderLocal ? `${folderLocal} fișiere de procesat / atribuit` : 'nimic în așteptare', href: '/dashboard' }} /></div>
          </li>
          <li>
            <b>Facturare 5StarDesk:</b> emite facturile pentru check-out-urile săptămânii trecute, pe prețul complet (5StarDesk → „De facturat”).
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '4px' }}>{F.filter(f => f.s?.deFacturat).map(f => <span key={f.id}><span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>{f.nume.replace(' SRL', '')}: </span><Stare c={{ ok: !f.s!.deFacturat!.n, text: f.s!.deFacturat!.n ? `${f.s!.deFacturat!.n} de facturat · ${lei(f.s!.deFacturat!.total)} lei` : 'nimic de facturat', href: u(f.slug, '5stardesk') }} /></span>)}</div>
          </li>
          <li>
            <b>Note la tranzacțiile neobișnuite</b>, cât încă îți amintești ce au fost (Extras → tranzacția → notă).
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '4px' }}>{F.map(f => <span key={f.id}><span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>{f.nume.replace(' SRL', '')}: </span><Stare c={!f.s?.extrase ? NA : { ok: !f.s.txFaraDocumentVechi, text: f.s.txFaraDocumentVechi ? `${f.s.txFaraDocumentVechi} > 14 zile fără document` : 'la zi', href: u(f.slug, 'extras') }} /></span>)}</div>
          </li>
          <li><b>Verificare rapidă:</b> Dashboard → „Întreabă AI despre facturi” (ex. „ce facturi neplătite am?”) și lista „De făcut”.</li>
        </ol>
      </Sectiune>

      <Sectiune nr="3 · Lunar — zilele 1–7" titlu="Închiderea lunii, în ordine" sub="Regula de aur: nu exporți până când „Neasociate” din Extras nu e la zero. Click pe o stare deschide pagina potrivită.">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                <th style={{ padding: '6px 8px' }}>Zi</th><th style={{ padding: '6px 8px', minWidth: '260px' }}>Pas · cum</th>
                {F.map(f => <th key={f.id} style={{ padding: '6px 8px', minWidth: '150px' }}><span className="dot" style={{ background: f.culoare, width: 7, height: 7, marginRight: 6 }} />{f.nume.replace(' SRL', '')}</th>)}
              </tr>
            </thead>
            <tbody>
              {PASI.map((p, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)', verticalAlign: 'top' }}>
                  <td style={{ padding: '10px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{p.zi}</td>
                  <td style={{ padding: '10px 8px' }}><div style={{ fontWeight: 650, color: 'var(--text-primary)' }}>{i + 1}. {p.titlu}</div><div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>{p.cum}</div></td>
                  {F.map(f => <td key={f.id} style={{ padding: '10px 8px' }}><Stare c={p.cel(f)} /></td>)}
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--border-subtle)', verticalAlign: 'top' }}>
                <td style={{ padding: '10px 8px', color: 'var(--text-muted)' }}>5–7</td>
                <td style={{ padding: '10px 8px' }}><div style={{ fontWeight: 650, color: 'var(--text-primary)' }}>{PASI.length + 1}. Pachetul către contabil</div><div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>Mail contabil → „Pachet pentru contabil”: ZIP-ul lunii (include lista de discrepanțe și notele) + răspunsul la mail. Apoi marchează trimis.</div></td>
                {F.map(f => <td key={f.id} style={{ padding: '10px 8px' }}>{f.s?.lunaId ? <PachetTrimisToggle lunaId={f.s.lunaId} trimis={f.s.pachetTrimis} /> : <Stare c={NA} />}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </Sectiune>

      <Sectiune nr="4 · Cu contabilul" titlu="Ciclul cu contabilul" sub="„Se adună foarte multe situații care rămân în aer” — ținta: nicio situație mai veche de o lună.">
        <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: 'var(--fs-md)', color: 'var(--text-secondary)' }}>
          <li>Mailul contabilului intră în <b>Mail contabil</b> în ziua în care vine (text sau captură).</li>
          <li>Fiecare situație: rezolvată sau cu notă, <b>în aceeași săptămână</b>.</li>
          <li>Răspunsul pleacă cu „Răspuns către contabil”, <b>înainte de închiderea lunii următoare</b>, împreună cu pachetul lunii.</li>
          <li>Restanțele vechi (restituiri Saulea / Murgoci / Barbu, clienți neîncasați de stornat, diferențe din lunile trecute) se închid <b>o singură dată</b>, acum.</li>
        </ol>
      </Sectiune>

      <Sectiune nr="5 · Pe firme" titlu="Specificul fiecărei firme">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: '10px' }}>
          {[
            { slug: 'abxhomes', t: 'ABXHomes — cazare (cel mai mare volum)', p: ['Aproape tot efortul: Airbnb/Booking ↔ 5StarDesk. Facturarea săptămânală pe prețul complet elimină ~80% din discrepanțe.', 'Borderoul Booking: verifică să fie complet — facturile cu check-out în lună trebuie să aibă rezervarea în borderou (alertă pe Dashboard).', 'Ce rămâne: bifat în „Listă discrepanțe” cu notă — intră automat în ZIP-ul contabilului.'] },
            { slug: 'ab-homes-invest', t: 'AB Homes Invest — eMAG', p: ['Lunar: cele 6 avize eMAG (RO/BG/HU, început + jumătate de lună), facturile Dante, facturile de curierat (Sameday, Cargus, Curiera…).', '„Concluzia eMAG” arată drumul banilor: vânzări → rețineri → virat → costuri → rezultat.', 'Facturile Dante/eMAG decontate prin aviz nu se asociază cu plăți bancare.'] },
            { slug: 'ab-textile', t: 'AB Textile — volum mic', p: ['Rutina săptămânală e suficientă; închiderea lunii ≈ 1 oră.', 'Atenție la plățile între firme (ex. ABXHomes → AB Textile): factura trebuie să existe la ambele firme.'] },
          ].map(x => {
            const f = F.find(y => y.slug === x.slug)
            return (
              <div key={x.slug} style={{ padding: '12px', borderRadius: 'var(--r-md)', background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 'var(--fs-md)', fontWeight: 650, color: 'var(--text-primary)' }}>{f && <span className="dot" style={{ background: f.culoare, width: 8, height: 8, marginRight: 6 }} />}{x.t}</div>
                <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>{x.p.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
            )
          })}
        </div>
      </Sectiune>
    </main>
  )
}
