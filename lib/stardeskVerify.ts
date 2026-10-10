import { getServiceSupabase } from '@/lib/supabase/server'
import { workMonthLabel } from '@/lib/accounting-period'

function normalizeCode(v: string) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '') }
function normalizeName(v: string) {
  return String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s]/g, '').trim()
}

export function codesMatch(codeA: string, codeB: string) {
  const a = normalizeCode(codeA)
  const b = normalizeCode(codeB)
  return a.length >= 6 && b.length >= 6 && (a.includes(b) || b.includes(a))
}

// Un nume citit de AI cu caractere non-latine (chirilice etc.) se poate reduce, dupa normalizare,
// la un singur cuvant scurt ramas (ex. "Elena Погореловская" -> "elena") - fara prag minim, acel
// cuvant s-ar potrivi prin substring cu orice alt nume care il contine intamplator ("Carmen Elena
// Ilie"), producand o asociere gresita intre doua persoane diferite. Cerem minim 6 caractere pe
// varianta mai scurta, ca sa nu conteze un singur prenume comun ca potrivire sigura.
function namesLikelyMatch(a: string, b: string) {
  if (!a || !b) return false
  const short = a.length <= b.length ? a : b
  const long = a.length <= b.length ? b : a
  return short.length >= 6 && long.includes(short)
}

function sameAmount(a: number|null, b: number|null) { return a != null && b != null && Math.abs(a - b) < 1 }

// O factura e "aceeasi rezervare" daca se potriveste codul SAU numele oaspetelui - indiferent
// de suma. Suma se verifica separat, ca sa distingem "nicio factura gasita" de "factura gasita,
// dar suma nu corespunde" (discrepanta de pret - trebuie adusa in fata, nu ascunsa/ignorata).
function isStardeskCandidate(rez: { cod_rezervare:string; nume_oaspete:string|null }, factura: { id_rezervare:string|null; nume_client:string|null }) {
  if (codesMatch(rez.cod_rezervare, factura.id_rezervare || '')) return true
  return namesLikelyMatch(normalizeName(rez.nume_oaspete || ''), normalizeName(factura.nume_client || ''))
}

type Candidat<F> = { factura: F; sumaCorecta: boolean } | null

// Cauta printre facturile candidate (cod SAU nume potrivit) una cu suma identica; daca nu exista
// nicio potrivire exacta, intoarce primul candidat oricum, marcat ca discrepanta de pret.
function gasesteCandidat<F extends { suma: number|null }>(rez: { cod_rezervare:string; nume_oaspete:string|null; suma:number|null }, facturi: F[], esteCandidat: (f:F)=>boolean): Candidat<F> {
  const candidati = facturi.filter(esteCandidat)
  if (!candidati.length) return null
  const exact = candidati.find(f => sameAmount(rez.suma, f.suma))
  return exact ? { factura: exact, sumaCorecta: true } : { factura: candidati[0], sumaCorecta: false }
}

// Airbnb factureaza clientul cu suma BRUTA (inainte de comisionul retinut), iar borderoul arata
// suma NETA primita de gazda - deci "factura - borderou" ar trebui sa fie exact comisionul Airbnb
// al acelei rezervari. Daca se potriveste, discrepanta e explicata (nu e o eroare de facturare,
// doar TVA/comision normal) si nu mai trebuie sa apara ca "problema" de rezolvat.
//
// Cand NU se potriveste (sau nu exista deloc comision de verificat), construim un mesaj de
// diagnostic - ca utilizatorul sa nu mai trebuiasca sa investigheze manual de fiecare data de ce
// anume nu se explica diferenta (comision lipsa / comision gasit dar suma nu se potriveste /
// platforma fara comision per rezervare).
function comisionDiagnostic(
  rez: { cod_rezervare:string; suma:number|null; platforma:string },
  facturaClient: { suma:number|null },
  comisionAirbnb: { numar_factura:string|null; cod_rezervare:string|null; suma:number|null }[],
) {
  const diferentaAsteptata = (facturaClient.suma != null && rez.suma != null) ? facturaClient.suma - rez.suma : null
  // Factura mai MICA decat borderoul: o parte din rezervare nu e facturata deloc - de facturat diferenta.
  if (diferentaAsteptata != null && diferentaAsteptata < -0.99) {
    return { explicat: false, comision: null, mesaj: `Nefacturat: ${(-diferentaAsteptata).toFixed(2)} RON — factura e mai mică decât suma din borderou; de emis factură pentru diferență.` }
  }
  if (rez.platforma !== 'airbnb') {
    return { explicat: false, comision: null, mesaj: 'Booking nu emite comision per rezervare - diferența nu poate fi verificată automat, necesită verificare manuală.' }
  }
  const comision = comisionAirbnb.find(c => codesMatch(rez.cod_rezervare, c.cod_rezervare || ''))
  if (!comision || comision.suma == null) {
    return { explicat: false, comision: null, mesaj: `Factura e mai mare cu ${diferentaAsteptata != null ? diferentaAsteptata.toFixed(2) : '?'} RON decât borderoul — ar trebui să fie comisionul Airbnb, dar factura de comision pentru acest cod lipsește (adu-o în Airbnb · Facturi).` }
  }
  if (diferentaAsteptata == null) {
    return { explicat: false, comision, mesaj: 'Sumă lipsă pe factura clientului sau pe borderou - diferența nu poate fi calculată.' }
  }
  const gap = diferentaAsteptata - comision.suma
  const explicat = Math.abs(gap) < 1
  return {
    explicat, comision,
    mesaj: explicat
      ? 'Diferența e explicată de comisionul Airbnb.'
      : `Comision găsit (${comision.numar_factura || 'fără număr'}): ${comision.suma.toFixed(2)} RON, dar diferența așteptată (factură minus borderou) e ${diferentaAsteptata.toFixed(2)} RON - diferență neexplicată de ${gap.toFixed(2)} RON.`,
  }
}

export async function computeVerification(sb: ReturnType<typeof getServiceSupabase>, lunaId: string) {
  const { data: allRez } = await sb.from('borderou_rezervari').select('*').eq('luna_id', lunaId)
  const { data: allFact } = await sb.from('stardesk_facturi').select('*').eq('luna_id', lunaId)
  const { data: allComision } = await sb.from('comision_facturi').select('*').eq('luna_id', lunaId)

  const rezervari = allRez || []
  const stardeskFacturi = allFact || []
  const comisionFacturi = allComision || []
  const comisionAirbnb = comisionFacturi.filter(f => f.platforma === 'airbnb')

  // Facturile de comision incarcate in Airbnb · Facturi au codul rezervarii citit la incarcare
  // (documente.cod_rezervare_airbnb) - le folosim direct, ca verificarea sa fie mereu la zi cu
  // modulul Airbnb, fara un "Verifica" separat. Cele deja citite si aici nu se dubleaza.
  const { data: docsComisionAirbnb } = await sb.from('documente').select('id,luna_id,firma_id,numar_document,suma,cod_rezervare_airbnb')
    .eq('luna_id', lunaId).like('fisier_path', '%/airbnb-facturi/%').not('cod_rezervare_airbnb', 'is', null)
  for (const d of docsComisionAirbnb || []) {
    const cod = String(d.cod_rezervare_airbnb || '')
    if (!cod || cod === '-' || comisionAirbnb.some(c => codesMatch(c.cod_rezervare || '', cod))) continue
    comisionAirbnb.push({ id: d.id, luna_id: d.luna_id, firma_id: d.firma_id, document_id: d.id, platforma: 'airbnb', numar_factura: d.numar_document || '', cod_rezervare: cod, suma: d.suma } as any)
  }

  // O rezervare a acestei luni poate fi deja facturata intr-o alta luna contabila (facturata mai
  // devreme/mai tarziu decat perioada borderoului) - cautam si acolo, pe toata firma, inainte sa o
  // consideram "fara factura". La fel pentru comisionul Airbnb.
  const firmaId: string | undefined = rezervari[0]?.firma_id
  let stardeskFacturiAlteLuni: typeof stardeskFacturi = []
  let comisionAirbnbAlteLuni: typeof comisionAirbnb = []
  let lunaLabelById = new Map<string, string>()
  if (firmaId) {
    const [{ data: factAlteLuni }, { data: comisionAlteLuni }] = await Promise.all([
      sb.from('stardesk_facturi').select('*').eq('firma_id', firmaId).neq('luna_id', lunaId),
      sb.from('comision_facturi').select('*').eq('firma_id', firmaId).eq('platforma', 'airbnb').neq('luna_id', lunaId),
    ])
    stardeskFacturiAlteLuni = factAlteLuni || []
    comisionAirbnbAlteLuni = comisionAlteLuni || []
    const lunaIds = [...new Set([...stardeskFacturiAlteLuni, ...comisionAirbnbAlteLuni].map(f => f.luna_id))]
    if (lunaIds.length) {
      const { data: luniRows } = await sb.from('luni_contabile').select('id,luna').in('id', lunaIds)
      lunaLabelById = new Map((luniRows || []).map(l => [l.id, workMonthLabel(String(l.luna).slice(0, 7))]))
    }
  }

  // Perioada sejurului (din CSV-ul Airbnb) - o rezervare cu check-out dupa sfarsitul lunii contabile
  // se factureaza, de regula, la check-out, deci luna viitoare: nu e o problema acum.
  const { data: lunaRow } = await sb.from('luni_contabile').select('luna').eq('id', lunaId).single()
  const [ly, lm] = String(lunaRow?.luna || '').slice(0, 7).split('-').map(Number)
  const sfarsitPerioada = ly ? new Date(Date.UTC(ly, lm - 1, 0)).toISOString().slice(0, 10) : '9999-12-31'
  const inceputPerioada = ly ? new Date(Date.UTC(ly, lm - 2, 1)).toISOString().slice(0, 10) : '0000-01-01'
  const lunaNume = (iso: string) => new Intl.DateTimeFormat('ro-RO', { month: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'))
  const ziRo = (iso: string) => iso.split('-').reverse().slice(0, 2).join('.')
  const coduriAirbnb = rezervari.filter(r => r.platforma === 'airbnb').map(r => r.cod_rezervare).filter(Boolean)
  const { data: sejururi } = firmaId && coduriAirbnb.length
    ? await sb.from('airbnb_facturi_asteptate').select('cod_confirmare,data_start,data_sfarsit,taxa_servicii').eq('firma_id', firmaId).in('cod_confirmare', coduriAirbnb)
    : { data: [] as { cod_confirmare: string; data_start: string | null; data_sfarsit: string | null; taxa_servicii: number | null }[] }
  const sejur = new Map((sejururi || []).map(s => [normalizeCode(s.cod_confirmare), s]))
  // Pretul complet de facturat clientului (Airbnb): suma neta din borderou + comisionul Airbnb al
  // rezervarii - din CSV-ul Airbnb (taxa de servicii) sau, altfel, din factura de comision.
  const pretComplet = (r: { cod_rezervare: string; suma: number | null; platforma: string }) => {
    if (r.platforma !== 'airbnb') return { comision: null, total: null }
    const csv = sejur.get(normalizeCode(r.cod_rezervare))?.taxa_servicii
    const com = csv != null ? Number(csv) : comisionAirbnb.find(c => codesMatch(c.cod_rezervare || '', r.cod_rezervare))?.suma ?? null
    return { comision: com != null ? Number(com) : null, total: com != null && r.suma != null ? Math.round((Number(r.suma) + Number(com)) * 100) / 100 : null }
  }

  const faraFacturaClient: typeof rezervari = []
  const seFactureazaLunaViitoare: typeof rezervari = []
  const discrepanteClient: { rezervare:typeof rezervari[number]; factura:typeof stardeskFacturi[number]; mesaj:string; potrivire:'cod'|'nume' }[] = []
  const discrepanteExplicateComision: { rezervare:typeof rezervari[number]; factura:typeof stardeskFacturi[number]; comision:typeof comisionAirbnb[number] }[] = []
  const facturateAlteLuni: { rezervare:typeof rezervari[number]; factura:typeof stardeskFacturiAlteLuni[number] }[] = []
  for (const rez of rezervari) {
    if (rez.rezolvat_client) continue
    // Codul rezervarii are prioritate; numele oaspetelui e doar plasa de siguranta (cod lipsa/citit gresit).
    const candidat = gasesteCandidat(rez, stardeskFacturi, f => codesMatch(rez.cod_rezervare, f.id_rezervare || ''))
      || gasesteCandidat(rez, stardeskFacturi, f => isStardeskCandidate(rez, f))
    if (!candidat) {
      const altaLuna = stardeskFacturiAlteLuni.find(f => isStardeskCandidate(rez, f))
      if (altaLuna) facturateAlteLuni.push({ rezervare: rez, factura: altaLuna })
      else if ((sejur.get(normalizeCode(rez.cod_rezervare))?.data_sfarsit || '') > sfarsitPerioada) seFactureazaLunaViitoare.push(rez)
      else faraFacturaClient.push(rez)
      continue
    }
    if (candidat.sumaCorecta) continue
    const diagnostic = comisionDiagnostic(rez, candidat.factura, comisionAirbnb)
    if (diagnostic.explicat && diagnostic.comision) discrepanteExplicateComision.push({ rezervare: rez, factura: candidat.factura, comision: diagnostic.comision })
    else discrepanteClient.push({ rezervare: rez, factura: candidat.factura, mesaj: diagnostic.mesaj, potrivire: codesMatch(rez.cod_rezervare, candidat.factura.id_rezervare || '') ? 'cod' : 'nume' })
  }

  // Verificare inversă: facturi 5StarDesk care nu se potrivesc cu nicio rezervare din borderoul lunii
  // (rezervare lipsă din borderou, cod citit greșit, sau lună diferită)
  const facturiFaraRezervare = stardeskFacturi.filter(f => !rezervari.some(rez => isStardeskCandidate(rez, f)))
  // ...cautate si in borderourile celorlalte luni (rezervarea poate fi platita/raportata in alta luna).
  const { data: rezAlteLuni } = firmaId && facturiFaraRezervare.length
    ? await sb.from('borderou_rezervari').select('luna_id,cod_rezervare,nume_oaspete').eq('firma_id', firmaId).neq('luna_id', lunaId)
    : { data: [] as { luna_id: string; cod_rezervare: string; nume_oaspete: string | null }[] }
  const luniRezIds = [...new Set((rezAlteLuni || []).map(r => r.luna_id))]
  const { data: luniRez } = luniRezIds.length ? await sb.from('luni_contabile').select('id,luna').in('id', luniRezIds) : { data: [] as { id: string; luna: string }[] }
  const lunaRez = new Map((luniRez || []).map(l => [l.id, workMonthLabel(String(l.luna).slice(0, 7))]))

  // Comisionul e doar o fractiune din suma rezervarii, nu aceeasi suma - deci aici verificam
  // NUMAI daca exista o factura de comision pentru cod, fara sa comparam sume (comparatia de suma
  // relevanta e deja facuta mai sus, ca parte din explicarea discrepantei facturii de client).
  const rezervariAirbnb = rezervari.filter(r => r.platforma === 'airbnb')
  const faraComisionAirbnb: typeof rezervariAirbnb = []
  const comisionAlteLuni: { rezervare:typeof rezervariAirbnb[number]; factura:typeof comisionAirbnbAlteLuni[number] }[] = []
  for (const rez of rezervariAirbnb) {
    if (rez.rezolvat_comision) continue
    if (comisionAirbnb.some(f => codesMatch(rez.cod_rezervare, f.cod_rezervare || ''))) continue
    const altaLuna = comisionAirbnbAlteLuni.find(f => codesMatch(rez.cod_rezervare, f.cod_rezervare || ''))
    if (altaLuna) comisionAlteLuni.push({ rezervare: rez, factura: altaLuna })
    else faraComisionAirbnb.push(rez)
  }

  const rezervariBooking = rezervari.filter(r => r.platforma === 'booking')
  const comisionBookingExista = comisionFacturi.some(f => f.platforma === 'booking')

  return {
    totalRezervari: rezervari.length,
    totalFacturiClient: stardeskFacturi.length,
    totalFacturiComision: comisionFacturi.length,
    faraFacturaClient: faraFacturaClient.map(r => { const s = sejur.get(normalizeCode(r.cod_rezervare)); return { id: r.id, codRezervare: r.cod_rezervare, numeOaspete: r.nume_oaspete, suma: r.suma, platforma: r.platforma, dataStart: s?.data_start || null, dataSfarsit: s?.data_sfarsit || null, ...pretComplet(r) } }),
    discrepanteClient: discrepanteClient.map(d => ({ id: d.rezervare.id, codRezervare: d.rezervare.cod_rezervare, numeOaspete: d.rezervare.nume_oaspete, suma: d.rezervare.suma, platforma: d.rezervare.platforma, numarFactura: d.factura.numar_factura, sumaFactura: d.factura.suma, mesaj: d.mesaj, potrivire: d.potrivire, codRezervareFactura: d.factura.id_rezervare })),
    discrepanteExplicateComision: discrepanteExplicateComision.map(d => ({ id: d.rezervare.id, codRezervare: d.rezervare.cod_rezervare, numeOaspete: d.rezervare.nume_oaspete, suma: d.rezervare.suma, platforma: d.rezervare.platforma, numarFactura: d.factura.numar_factura, sumaFactura: d.factura.suma, numarComision: d.comision.numar_factura, sumaComision: d.comision.suma })),
    facturateAlteLuni: facturateAlteLuni.map(d => ({ id: d.rezervare.id, codRezervare: d.rezervare.cod_rezervare, numeOaspete: d.rezervare.nume_oaspete, suma: d.rezervare.suma, platforma: d.rezervare.platforma, numarFactura: d.factura.numar_factura, sumaFactura: d.factura.suma, luna: lunaLabelById.get(d.factura.luna_id) || '?' })),
    facturiFaraRezervare: facturiFaraRezervare.map(f => {
      const r = (rezAlteLuni || []).find(x => isStardeskCandidate({ cod_rezervare: x.cod_rezervare, nume_oaspete: x.nume_oaspete }, f))
      // Fara rezervare in borderou: check-out-ul de pe factura spune unde ar trebui sa fie.
      const co: string = f.data_sfarsit || ''
      const motiv = r ? `rezervarea e în borderoul din ${lunaRez.get(r.luna_id) || 'altă lună'}`
        : !co ? 'rezervarea nu apare în niciun borderou încărcat (perioada sejurului nu a putut fi citită din factură)'
        : co > sfarsitPerioada ? `check-out ${ziRo(co)}, după ${ziRo(sfarsitPerioada)} — intră în borderoul lunii următoare, nu e o problemă acum`
        : co < inceputPerioada ? `check-out ${ziRo(co)}, înainte de ${ziRo(inceputPerioada)} — trebuia să fie în borderoul din ${lunaNume(co)}; nu e găsită acolo, verifică luna trecută`
        : `⚠ check-out ${ziRo(co)}, în perioada borderoului — dar rezervarea lipsește din el, de verificat`
      return { id: f.id, numarFactura: f.numar_factura, numeClient: f.nume_client, suma: f.suma, idRezervare: f.id_rezervare,
        dataStart: f.data_start || null, dataSfarsit: co || null, motiv, unde: r ? 'alta-luna' : !co ? 'necunoscut' : co > sfarsitPerioada ? 'viitoare' : co < inceputPerioada ? 'trecuta' : 'lipsa' }
    }),
    seFactureazaLunaViitoare: seFactureazaLunaViitoare.map(r => { const s = sejur.get(normalizeCode(r.cod_rezervare)); return { id: r.id, codRezervare: r.cod_rezervare, numeOaspete: r.nume_oaspete, suma: r.suma, platforma: r.platforma, dataStart: s?.data_start || null, dataSfarsit: s?.data_sfarsit || null, ...pretComplet(r) } }),
    faraComisionAirbnb: faraComisionAirbnb.map(r => ({ id: r.id, codRezervare: r.cod_rezervare, numeOaspete: r.nume_oaspete, suma: r.suma, platforma: r.platforma })),
    comisionAlteLuni: comisionAlteLuni.map(d => ({ id: d.rezervare.id, codRezervare: d.rezervare.cod_rezervare, numeOaspete: d.rezervare.nume_oaspete, suma: d.rezervare.suma, platforma: d.rezervare.platforma, numarFactura: d.factura.numar_factura, sumaFactura: d.factura.suma, luna: lunaLabelById.get(d.factura.luna_id) || '?' })),
    comisionBookingLipsa: rezervariBooking.length > 0 && !comisionBookingExista,
    totalRezervariBooking: rezervariBooking.length,
  }
}

export type VerificareResult = Awaited<ReturnType<typeof computeVerification>>

// Numarul de "probleme" (discrepante de pret) de aratat pe Dashboard, ca sa fie vizibile fara sa
// intri manual in modulul 5StarDesk al fiecarei firme - trebuie sesizate la timp, cat mai poate fi
// emisa o factura corectata.
export async function getStardeskDiscrepanteCount(lunaId: string): Promise<number> {
  const sb = getServiceSupabase()
  const result = await computeVerification(sb, lunaId)
  return result.discrepanteClient.length
}

// ---------------------------------------------------------------------------------------------
// "De facturat" - rezervarile (din borderourile TUTUROR lunilor) care nu au inca factura client
// 5StarDesk, cu check-out-ul trecut, si pretul complet de facturat (Airbnb: suma neta din borderou +
// comisionul Airbnb). Folosit ca lista de lucru saptamanala (facturare la check-out) si pe Dashboard.
export interface DeFacturat {
  ids: string[]; codRezervare: string; numeOaspete: string | null; platforma: string; luna: string | null
  suma: number | null; comision: number | null; total: number | null; dataStart: string | null; dataSfarsit: string | null
}

export async function getDeFacturat(sb: ReturnType<typeof getServiceSupabase>, firmaId: string): Promise<DeFacturat[]> {
  const [{ data: rez }, { data: fact }, { data: csv }, { data: com }, { data: docsCom }, { data: luni }] = await Promise.all([
    sb.from('borderou_rezervari').select('id,luna_id,platforma,cod_rezervare,nume_oaspete,suma,rezolvat_client').eq('firma_id', firmaId).limit(5000),
    sb.from('stardesk_facturi').select('id_rezervare,nume_client').eq('firma_id', firmaId).limit(5000),
    sb.from('airbnb_facturi_asteptate').select('cod_confirmare,data_start,data_sfarsit,taxa_servicii').eq('firma_id', firmaId).limit(5000),
    sb.from('comision_facturi').select('cod_rezervare,suma').eq('firma_id', firmaId).eq('platforma', 'airbnb').limit(5000),
    sb.from('documente').select('cod_rezervare_airbnb,suma').eq('firma_id', firmaId).like('fisier_path', '%/airbnb-facturi/%').not('cod_rezervare_airbnb', 'is', null).limit(5000),
    sb.from('luni_contabile').select('id,luna').eq('firma_id', firmaId),
  ])
  const facturi = fact || []
  const csvDupaCod = new Map((csv || []).map(c => [normalizeCode(c.cod_confirmare), c]))
  const comisioane = [...(com || []).map(c => ({ cod: c.cod_rezervare, suma: c.suma })), ...(docsCom || []).map(d => ({ cod: d.cod_rezervare_airbnb, suma: d.suma }))]
  const lunaKey = new Map((luni || []).map(l => [l.id, String(l.luna).slice(0, 7)]))
  const azi = new Date().toISOString().slice(0, 10)

  // O rezervare poate avea mai multe randuri in borderou (ex. ajustare Booking cu minus) - pe cod.
  const grupuri = new Map<string, NonNullable<typeof rez>>()
  for (const r of rez || []) {
    const k = normalizeCode(r.cod_rezervare) || `id:${r.id}`
    grupuri.set(k, [...(grupuri.get(k) || []), r])
  }
  const out: DeFacturat[] = []
  for (const [k, randuri] of grupuri) {
    if (randuri.some(r => r.rezolvat_client)) continue
    const r0 = randuri[0]
    if (facturi.some(f => isStardeskCandidate(r0, f))) continue
    const c = csvDupaCod.get(k)
    if (c?.data_sfarsit && c.data_sfarsit > azi) continue  // inca nu a facut check-out
    const suma = Math.round(randuri.reduce((s, r) => s + Number(r.suma || 0), 0) * 100) / 100
    let comision: number | null = null
    if (r0.platforma === 'airbnb') {
      const x = c?.taxa_servicii != null ? Number(c.taxa_servicii) : comisioane.find(cm => codesMatch(cm.cod || '', r0.cod_rezervare))?.suma
      comision = x != null ? Number(x) : null
    }
    const lunile = randuri.map(r => lunaKey.get(r.luna_id)).filter(Boolean).sort() as string[]
    out.push({
      ids: randuri.map(r => r.id), codRezervare: r0.cod_rezervare, numeOaspete: r0.nume_oaspete, platforma: r0.platforma,
      luna: lunile[0] || null, suma, comision, total: comision != null ? Math.round((suma + comision) * 100) / 100 : r0.platforma === 'airbnb' ? null : suma,
      dataStart: c?.data_start || null, dataSfarsit: c?.data_sfarsit || null,
    })
  }
  return out.sort((a, b) => String(a.dataSfarsit || a.luna || '').localeCompare(String(b.dataSfarsit || b.luna || '')))
}
