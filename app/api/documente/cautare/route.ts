import { NextRequest, NextResponse } from 'next/server'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co/rest/v1'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }

function sectionFromPath(path: string): string {
  const p = String(path || '')
  if (p.includes('/dispozitii-plata/')) return 'Dispoziție de plată'
  if (p.includes('/facturi-chitanta/')) return 'Facturi + chitanță'
  if (p.includes('/facturi-restante/')) return 'Facturi restante'
  if (p.includes('/booking-facturi/')) return 'Booking · Facturi'
  if (p.includes('/booking-borderou/')) return 'Booking · Borderou'
  if (p.includes('/airbnb-facturi/')) return 'Airbnb · Facturi'
  if (p.includes('/airbnb-borderou/')) return 'Airbnb · Borderou'
  if (p.includes('/5stardesk/')) return '5StarDesk'
  if (p.includes('/trendyol/')) return 'Trendyol'
  if (p.includes('/emag-calcul/') || p.includes('/emag-avize/') || p.includes('/emag-facturi/')) return 'eMAG Facturi'
  if (p.includes('/acte-contabile/')) return 'Acte contabile'
  if (p.includes('/angajati/')) return 'Documente angajați'
  if (p.includes('/tx/') || p.includes('/extras/')) return 'Extras de cont'
  return 'Altele'
}

// Data introdusa de utilizator (DD.MM.YYYY sau YYYY-MM-DD) -> format ISO pentru comparatie in baza de date
function parseDateQuery(q: string): string | null {
  const iso = q.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return q
  const ro = q.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (ro) return `${ro[3]}-${ro[2].padStart(2, '0')}-${ro[1].padStart(2, '0')}`
  return null
}

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (!firmaId || q.length < 2) return NextResponse.json([])

  const escaped = q.replace(/[%,()]/g, '')
  const orParts = [
    `fisier_nume.ilike.*${escaped}*`,
    `furnizor.ilike.*${escaped}*`,
    `numar_document.ilike.*${escaped}*`,
    `locatie.ilike.*${escaped}*`,
    `utilitate.ilike.*${escaped}*`,
  ]
  const numeric = Number(q.replace(',', '.'))
  if (Number.isFinite(numeric) && q.trim() !== '') orParts.push(`suma.eq.${numeric}`)
  const dateQuery = parseDateQuery(q)
  if (dateQuery) orParts.push(`data_document.eq.${dateQuery}`)

  const url = `${SB}/documente?firma_id=eq.${encodeURIComponent(firmaId)}&or=(${orParts.join(',')})` +
    `&select=id,fisier_nume,furnizor,numar_document,suma,locatie,utilitate,data_document,fisier_path,luna_id,created_at` +
    `&order=created_at.desc&limit=40`
  const res = await fetch(url, { headers: H })
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 })
  const docs = await res.json()
  if (!Array.isArray(docs) || !docs.length) return NextResponse.json([])

  const lunaIds = [...new Set(docs.map((d: any) => d.luna_id).filter(Boolean))]
  const luniById = new Map<string, string>()
  if (lunaIds.length) {
    const lRes = await fetch(`${SB}/luni_contabile?id=in.(${lunaIds.join(',')})&select=id,luna`, { headers: H })
    if (lRes.ok) {
      const luni = await lRes.json()
      for (const l of luni) luniById.set(l.id, l.luna)
    }
  }

  return NextResponse.json(docs.map((d: any) => ({
    id: d.id,
    fisierNume: d.fisier_nume,
    furnizor: d.furnizor && !/^(DP_DATA:|Ata(ș|s)ament )/.test(String(d.furnizor)) ? d.furnizor : null,
    numarDocument: d.numar_document || null,
    suma: d.suma,
    locatie: d.locatie,
    utilitate: d.utilitate,
    dataDocument: d.data_document,
    sectiune: sectionFromPath(d.fisier_path),
    luna: luniById.get(d.luna_id) || null,
  })))
}
