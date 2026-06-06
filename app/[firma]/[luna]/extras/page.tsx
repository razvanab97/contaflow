import { notFound } from 'next/navigation'
import Link from 'next/link'
import UploadExtras from './UploadExtras'
import TranzactiiSection from './TranzactiiSection'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co/rest/v1'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbG11b2FhaXBiYW5qZHB0bGVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDY2NzE2OCwiZXhwIjoyMDk2MjQzMTY4fQ.VCnFDYSfxcbS9Hb9g12di7npy5plSvHpMrb6E2FEdfU'
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }

async function get(path: string) {
  const r = await fetch(`${SB}/${path}`, { headers: H, cache: 'no-store' })
  if (!r.ok) return []
  return r.json()
}

export default async function ExtrasPage({ params }: { params: Promise<{ firma: string; luna: string }> }) {
  const { firma: slug, luna } = await params

  const firme = await get(`firme?slug=eq.${encodeURIComponent(slug)}&select=*`)
  const firma = firme[0]
  if (!firma) notFound()

  const luni = await get(`luni_contabile?firma_id=eq.${firma.id}&select=*&order=luna.desc`)
  const lunaData = luni.find((l: { luna: string }) => l.luna.startsWith(luna))
  if (!lunaData) notFound()

  // Get extrase
  const extrase = await get(`extrase?luna_id=eq.${lunaData.id}&select=*&order=valuta`)

  // Get ALL tranzactii pentru firma + luna (prin extras_id IN)
  let tranzactii: any[] = []
  if (extrase.length > 0) {
    const ids = extrase.map((e: any) => e.id)
    // Fetch pentru fiecare extras separat ca sa evitam probleme cu IN()
    for (const id of ids) {
      const txs = await get(
        `tranzactii?extras_id=eq.${id}&select=id,extras_id,data_tranzactie,descriere,descriere_curatata,tip,suma,valuta,categorie,document_id,note,documente(id,tip_document,furnizor,numar_document,fisier_nume)&order=data_tranzactie`
      )
      tranzactii = [...tranzactii, ...txs]
    }
  }

  // Sort: nerezolvate primul
  tranzactii.sort((a, b) => {
    const aR = !!a.document_id || a.note === 'na'
    const bR = !!b.document_id || b.note === 'na'
    if (aR === bR) return new Date(a.data_tranzactie).getTime() - new Date(b.data_tranzactie).getTime()
    return aR ? 1 : -1
  })

  const [y, m] = luna.split('-')
  const LUNI = ['', 'Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const ll = `${LUNI[+m]} ${y}`
  const rez = tranzactii.filter(t => !!t.document_id || t.note === 'na').length
  const pct = tranzactii.length > 0 ? Math.round((rez / tranzactii.length) * 100) : 0

  const CULOARE = firma.culoare || '#F27A1A'

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0A0A0A' }}>
      <aside style={{ width: '220px', flexShrink: 0, background: '#0D0D0D', borderRight: '1px solid #1E1E1E', display: 'flex', flexDirection: 'column', padding: '20px 0', position: 'sticky', top: 0, height: '100vh' }}>
        <div style={{ padding: '4px 18px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', background: '#FFF', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" fill="none" stroke="#111" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
          </div>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#FFF' }}>ContaFlow</span>
        </div>
        <Link href={`/${slug}/${luna}`} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 18px', fontSize: '13px', color: '#888' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          {firma.nume.replace(' SRL', '')}
        </Link>
        <div style={{ height: '1px', background: '#1E1E1E', margin: '8px 14px' }} />
        <div style={{ padding: '8px 18px 4px', fontSize: '13px', fontWeight: 600, color: '#DDD' }}>Extras de cont</div>
        {extrase.map((e: any) => (
          <div key={e.id} style={{ padding: '3px 18px 3px 28px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: '#777' }}>{e.valuta}</span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#4ADE80' }}>{e.nr_tranzactii} tx</span>
          </div>
        ))}
        {tranzactii.length > 0 && (
          <>
            <div style={{ height: '1px', background: '#1E1E1E', margin: '12px 14px' }} />
            <div style={{ padding: '0 18px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#555', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '.08em' }}>Progres</div>
              <div style={{ height: '3px', background: '#1E1E1E', borderRadius: '2px', marginBottom: '6px' }}>
                <div style={{ height: '3px', background: CULOARE, borderRadius: '2px', width: `${pct}%` }} />
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFF' }}>{rez}/{tranzactii.length}</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{pct}% rezolvate</div>
            </div>
          </>
        )}
        <div style={{ marginTop: 'auto', padding: '12px 18px', fontSize: '11px', color: '#555' }}>{ll}</div>
      </aside>

      <main style={{ flex: 1, padding: '40px 44px', background: '#0F0F0F' }}>
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: CULOARE }} />
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#FFF' }}>Extras de cont</h1>
          </div>
          <p style={{ fontSize: '13px', color: '#888', marginLeft: '17px' }}>{firma.nume} · {ll}</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '40px' }}>
          {['RON', 'EUR'].map(v => (
            <UploadExtras key={v} valuta={v} firmaId={firma.id} lunaId={lunaData.id}
              extras={extrase.find((x: any) => x.valuta === v) || null} culoare={CULOARE} />
          ))}
        </div>

        {tranzactii.length > 0 ? (
          <TranzactiiSection tranzactii={tranzactii} firmaId={firma.id} lunaId={lunaData.id} culoare={CULOARE} />
        ) : (
          <div style={{ padding: '32px', background: '#161616', border: '1px solid #242424', borderRadius: '12px', textAlign: 'center' }}>
            <p style={{ fontSize: '13px', color: '#888' }}>
              {extrase.length > 0 ? 'Importă un CSV sau încarcă un PDF pentru a vedea tranzacțiile.' : 'Importă CSV sau PDF mai sus.'}
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
