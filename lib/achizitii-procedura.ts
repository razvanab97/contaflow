// Procedura de achizitii a PROIECTULUI AB TEXTILE (FSE+, Programul Incluziune si Demnitate Sociala,
// PIDS/83/PIDS_P3/OP4/ESO4.1/PIDS_A12 - schema PROSOCIAL, cod SMIS 316148), reconstituita din
// documentele standard folosite in achizitiile deja facute (Anexa 2 cerere de oferta, Anexa 1 nota de
// estimare, Anexa 3 proces-verbal de receptie, Anexa 4 restituire) si din bugetul planului de afaceri
// (Act aditional nr. 3). Date pure, fara dependinte de server - folosite si in componente client.

export const PROIECT = {
  beneficiar: 'AB TEXTILE S.R.L.',
  cui: '52575850',
  reprezentant: 'Abunei Elena',
  contract: 'Contract de subvenție nr. D395/30.09.2025',
  administrator: 'PROSOCIAL — Asociația Institutul pentru Orașe Vizionare (lider), Asociația Clubul Sportiv Smart Atletic, 2BE Group S.R.L.',
  program: 'FSE+, Programul Incluziune și Demnitate Socială — PIDS/83/PIDS_P3/OP4/ESO4.1/PIDS_A12, cod SMIS 316148',
  temeiNota: 'cap. 4, art. 4.4, alin. (3) din Ordinul nr. 1284/2016',
  bugetSubventie: 307642.70,
  bugetCofinantare: 46213.98,
  transe: 'Tranșa 1 = 70% din subvenție (215.349,89 lei); pentru tranșa 2 (30%) trebuie cheltuit minimum 70% din tranșa 1 (150.744,92 lei) și minimum 70% din cofinanțare (32.349,79 lei).',
}

export type SursaBuget = 'grant' | 'cofinantare'
export interface LinieBuget { cod: string; denumire: string; sursa: SursaBuget; categorie: string; cantitate: number; um: string; valoare: number }

// Bugetul planului de afaceri in vigoare (Act aditional nr. 3 din 01.07.2026, sheet 2.0_buget integral) -
// doar liniile care se cumpara prin procedura de achizitii (fara salarii, contabilitate, chirie - acelea
// sunt obligatii lunare). Codurile sunt cele din bugetul AA3. Valorile sunt cu TVA inclus, ca in buget.
const CAT3 = '3. Servicii specializate'
const CAT4 = '4. Active fixe, obiecte de inventar, materiale'
const CAT6 = '6. Leasing operațional'
export const VERSIUNE_BUGET = 'AA3 (01.07.2026)'
export const BUGET_ACHIZITII: LinieBuget[] = [
  { cod: '3.2', denumire: 'Site prezentare întreprindere', sursa: 'cofinantare', categorie: CAT3, cantitate: 1, um: 'buc', valoare: 3300 },
  { cod: '3.3', denumire: 'Montare aer condiționat', sursa: 'cofinantare', categorie: CAT3, cantitate: 1, um: 'buc', valoare: 1000 },
  { cod: '4.1', denumire: 'Mașină de spălat profesională', sursa: 'grant', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 38522.77 },
  { cod: '4.2', denumire: 'Uscător profesional', sursa: 'grant', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 17985.44 },
  { cod: '4.3', denumire: 'Calandru', sursa: 'grant', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 23270.72 },
  { cod: '4.4', denumire: 'Masă de călcat', sursa: 'grant', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 22783.09 },
  { cod: '4.5', denumire: 'Masă de scos pete', sursa: 'grant', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 11566.39 },
  { cod: '4.6', denumire: 'Manechin (AA3: diferența peste buget o suportă antreprenorul)', sursa: 'grant', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 2280.29 },
  { cod: '4.7', denumire: 'Compresor', sursa: 'cofinantare', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 649.98 },
  { cod: '4.8', denumire: 'Birou FrontDesk', sursa: 'cofinantare', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 399.99 },
  { cod: '4.9', denumire: 'Scaun birou', sursa: 'cofinantare', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 329 },
  { cod: '4.10', denumire: 'Set 4 scaune zonă așteptare', sursa: 'cofinantare', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 476 },
  { cod: '4.11', denumire: 'Etajeră documente + decorațiuni', sursa: 'cofinantare', categorie: CAT4, cantitate: 2, um: 'buc', valoare: 370 },
  { cod: '4.12', denumire: 'Suport depozitare haine', sursa: 'cofinantare', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 169 },
  { cod: '4.13', denumire: 'Kit alarmă', sursa: 'cofinantare', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 741.99 },
  { cod: '4.14', denumire: 'Casă de marcat', sursa: 'cofinantare', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 525 },
  { cod: '4.15', denumire: 'Imprimantă', sursa: 'cofinantare', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 971.91 },
  { cod: '4.16', denumire: 'Laptop', sursa: 'cofinantare', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 4299.99 },
  { cod: '4.17', denumire: 'Masă de lucru', sursa: 'cofinantare', categorie: CAT4, cantitate: 2, um: 'buc', valoare: 890 },
  { cod: '4.18', denumire: 'Cărucior transport', sursa: 'cofinantare', categorie: CAT4, cantitate: 2, um: 'buc', valoare: 998 },
  { cod: '4.19', denumire: 'Cărucior rufe curate', sursa: 'cofinantare', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 759 },
  { cod: '4.20', denumire: 'Umerașe', sursa: 'cofinantare', categorie: CAT4, cantitate: 2, um: 'set', valoare: 452 },
  { cod: '4.21', denumire: 'Huse transparente haine', sursa: 'cofinantare', categorie: CAT4, cantitate: 2, um: 'set', valoare: 155.80 },
  { cod: '4.22', denumire: 'Aer condiționat', sursa: 'cofinantare', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 1338.08 },
  { cod: '4.23', denumire: 'Set detergenți profesionali', sursa: 'cofinantare', categorie: CAT4, cantitate: 1, um: 'set', valoare: 2944.30 },
  { cod: '4.24', denumire: 'Pachet materiale instalație electrică', sursa: 'cofinantare', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 4887.96 },
  { cod: '4.25', denumire: 'Boiler', sursa: 'cofinantare', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 498 },
  { cod: '4.26', denumire: 'Covor cauciuc', sursa: 'cofinantare', categorie: CAT4, cantitate: 16, um: 'ml', valoare: 1180.96 },
  { cod: '4.27', denumire: 'Pachet elemente decorative polistiren interior', sursa: 'cofinantare', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 388.89 },
  { cod: '4.28', denumire: 'Vopsea lavabilă', sursa: 'cofinantare', categorie: CAT4, cantitate: 15, um: 'l', valoare: 264 },
  { cod: '4.29', denumire: 'Aspirator cu spălare', sursa: 'cofinantare', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 566.65 },
  { cod: '4.30', denumire: 'Aparat de curățat cu abur', sursa: 'cofinantare', categorie: CAT4, cantitate: 1, um: 'buc', valoare: 1121.48 },
  { cod: '6.1', denumire: 'Autoturism — leasing operațional (6 luni × 3.260 lei)', sursa: 'grant', categorie: CAT6, cantitate: 6, um: 'luni', valoare: 19560 },
]
export const linieDupaCod = (cod: string) => BUGET_ACHIZITII.find(l => l.cod === cod)
export const coduriDin = (v: string | null | undefined) => String(v || '').split(',').map(x => x.trim()).filter(c => linieDupaCod(c))

// Pasii procedurii, in ordine - cum s-au facut achizitiile reale (dosarele din Firme/AB TEXTILE SRL).
export interface PasProcedura { nr: number; titlu: string; ce: string; reguli: string[]; document?: string; formular?: 'oferta' | 'nota' | 'receptie' | 'restituire' }
export const PASI_PROCEDURA: PasProcedura[] = [
  { nr: 1, titlu: 'Verifică bugetul', ce: 'Alege linia din bugetul planului de afaceri (subvenție sau cofinanțare) și suma maximă disponibilă.', reguli: ['Doar ce e în buget (sau aprobat prin act adițional) e eligibil.', 'Valorile din buget sunt cu TVA inclus; ofertele se compară fără TVA.'] },
  { nr: 2, titlu: 'Specificații tehnice minime', ce: 'Scrie specificațiile minime (capacitate, putere, dimensiuni, alimentare, uz profesional) și bugetul maxim fără TVA.', reguli: ['Specificațiile sunt aceleași în cererea de ofertă, în ofertele comparate și în nota de estimare.'] },
  { nr: 3, titlu: 'Cerere de ofertă (Anexa 2)', ce: 'Cererea de ofertă, cu număr și dată, către fiecare furnizor: denumirea achiziției, tipul (produse / servicii / lucrări), tabelul cu produse, specificații, UM și cantitate.', reguli: ['Prețurile se cer fără TVA.', 'Valabilitatea ofertei: ~30 de zile.', 'Semnată de reprezentantul legal (Abunei Elena).', 'Pentru produse online (eMAG, Altex, Leroy Merlin etc.) cererea poate lipsi — se folosesc capturile de preț cu dată.'], document: 'Anexa 2 — Cerere de ofertă', formular: 'oferta' },
  { nr: 4, titlu: '3 oferte de la furnizori diferiți', ce: 'Minimum 3 oferte (PDF de la furnizor sau capturi de pe site cu data, prețul fără TVA și specificațiile).', reguli: ['Trei operatori economici diferiți.', 'Toate ofertele trebuie să respecte specificațiile minime.', 'Ofertele recente (în valabilitate) — datate.'], document: 'Oferta 1, 2, 3' },
  { nr: 5, titlu: 'Notă privind determinarea valorii estimate (Anexa 1)', ce: 'Tabelul cu cele 3 oferte (operator, produs, specificații, cantitate, preț unitar și total fără TVA) și justificarea alegerii.', reguli: ['Temei: cap. 4, art. 4.4, alin. (3) din Ordinul nr. 1284/2016.', 'Se alege oferta cu prețul cel mai scăzut care respectă specificațiile, termenul de livrare și condițiile comerciale.', 'Semnată (digital) de reprezentantul legal, ÎNAINTE de comandă / plată.'], document: 'Anexa 1 — Notă de estimare', formular: 'nota' },
  { nr: 6, titlu: 'Contract (la echipamente mari)', ce: 'Pentru echipamente cu livrare, montaj și punere în funcțiune (ex. utilajele SDS Group): contract cu prețul, tranșele de plată (avans / rest) și garanția.', reguli: ['La achizițiile simple (online, magazin) contractul e înlocuit de comandă + factură.'], document: 'Contract' },
  { nr: 7, titlu: 'Comandă, proformă și plată prin OP', ce: 'Comanda pe AB TEXTILE (CUI 52575850); plata prin ordin de plată din contul firmei, pe baza proformei / facturii.', reguli: ['Plata din contul AB TEXTILE — nu cash, nu de pe cardul altei firme.', 'În detaliile plății: numărul facturii / proformei și furnizorul.', 'Inițierea plății nu înseamnă plată executată — confirmă din extras.'], document: 'Proformă / comandă + OP' },
  { nr: 8, titlu: 'Factura fiscală', ce: 'Factura fiscală pe AB TEXTILE S.R.L. — nu doar proforma, comanda sau avizul.', reguli: ['Proforma nu e document justificativ final — cere și factura fiscală.'], document: 'Factură fiscală' },
  { nr: 9, titlu: 'Recepție (Anexa 3)', ce: 'Procesul-verbal de recepție semnat (ce s-a livrat / prestat, constatări); la utilaje și PV de punere în funcțiune + certificat de garanție.', reguli: ['Recepția după livrare, semnată de reprezentantul legal (și de furnizor, unde e cazul).'], document: 'Anexa 3 — PV de recepție', formular: 'receptie' },
  { nr: 10, titlu: 'Dovezi: extras bancar + poze', ce: 'Extrasul cu plata executată și poze cu bunul achiziționat, la locul de muncă, cu înscrisurile / denumirile cerute de PROSOCIAL.', reguli: ['Pozele sunt cerute pentru tranșe (ex. tranșa 3: „poze cu echipamentele achiziționate prin proiect, cu înscrisuri”).'], document: 'Extras + poze' },
  { nr: 11, titlu: 'Raportare și (dacă e cazul) restituire', ce: 'Dosarul complet intră în raportul lunar (Anexa 5) către PROSOCIAL. Dacă s-a plătit temporar din surse proprii, cererea de restituire (Anexa 4).', reguli: ['Dosarul complet în ordinea pașilor de mai sus (vezi „Dosarul achiziției”).'], document: 'Anexa 5 / Anexa 4', formular: 'restituire' },
]

// Dosarul unei achizitii: ce documente exista si ce lipseste, dedus din numele/etapa documentelor.
export interface DocDosar { fisier_nume: string; tip_document: string | null; fisier_tip?: string | null; furnizor?: string | null }
export interface ElementDosar { cheie: string; titlu: string; ok: boolean; partial?: boolean; detaliu: string }
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function dosarAchizitie(docs: DocDosar[], opts: { utilaj?: boolean; online?: boolean } = {}): ElementDosar[] {
  const n = docs.map(d => ({ ...d, n: norm(d.fisier_nume) }))
  const are = (re: RegExp) => n.filter(d => re.test(d.n))
  const cerere = are(/cerere (de )?oferta|anexa 2/)
  const oferte = n.filter(d => /ofert|discutie oferta/.test(d.n) && !/cerere (de )?oferta|anexa 2/.test(d.n))
  const nrOferte = new Set(oferte.map((d,index)=>d.n.match(/\[furnizor=([a-z0-9_]+)\]/)?.[1]||(/^oferta [1-3]\.pdf$/.test(d.n)&&d.furnizor?norm(d.furnizor).replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''):`legacy-${index}`))).size
  const nota = are(/anexa 1|nota privind|determinare|nota de estimare/)
  const factura = are(/factur|dante|sdsis-f/).filter(d => !/proforma/.test(d.n))  // facturile eMAG/Dante nu au "factura" in nume
  const proforma = are(/proforma|order_|comanda|deviz/)
  const contract = are(/contract/)
  const pv = are(/\bpv\b|proces verbal|anexa 3/)
  const plata = are(/extras|ordin de plata|\bop\b|dovada plat|confirmare plat/)
  const poze = n.filter(d => /^image\//.test(String(d.fisier_tip || '')) && /poz|foto/.test(d.n))
  const out: ElementDosar[] = [
    // Cererea de ofertă s-a folosit la achizițiile mari (utilaje, servicii, rețea electrică); la cele mici,
    // cele 3 oferte de pe site-uri au fost suficiente - fără cerere nu e o lipsă dacă există 3 oferte.
    { cheie: 'cerere', titlu: 'Cerere de ofertă (Anexa 2)', ok: cerere.length > 0 || nrOferte >= 3 || !!opts.online, partial: !cerere.length, detaliu: cerere.length ? `${cerere.length} document${cerere.length > 1 ? 'e' : ''}` : nrOferte >= 3 || opts.online ? 'nu e în dosar — la achizițiile mici, ofertele de pe site-uri au fost suficiente' : 'lipsește' },
    { cheie: 'oferte', titlu: '3 oferte', ok: nrOferte >= 3, partial: nrOferte > 0 && nrOferte < 3, detaliu: `${nrOferte} din 3 oferte · ${oferte.length} documente${oferte.some(d=>!d.n.includes('[furnizor=')&&!(/^oferta [1-3]\.pdf$/.test(d.n)&&d.furnizor))?' (fișiere vechi negrupate; verifică furnizorii)':''}` },
    { cheie: 'nota', titlu: 'Notă de estimare (Anexa 1)', ok: nota.length > 0, detaliu: nota.length ? 'există' : 'lipsește' },
    ...(opts.utilaj ? [{ cheie: 'contract', titlu: 'Contract', ok: contract.length > 0, detaliu: contract.length ? 'există' : 'lipsește (necesar la echipamente cu montaj)' }] : []),
    { cheie: 'factura', titlu: 'Factură fiscală', ok: factura.length > 0, partial: !factura.length && proforma.length > 0, detaliu: factura.length ? `${factura.length} factur${factura.length > 1 ? 'i' : 'ă'}` : proforma.length ? 'doar proformă / comandă — cere factura fiscală' : 'lipsește' },
    { cheie: 'plata', titlu: 'Dovada plății (extras / OP)', ok: plata.length > 0, detaliu: plata.length ? 'există' : 'lipsește — adaugă extrasul cu plata' },
    { cheie: 'pv', titlu: 'PV de recepție (Anexa 3)', ok: pv.length > 0, detaliu: pv.length ? 'există' : 'lipsește' },
    { cheie: 'poze', titlu: 'Poze cu bunul (cu înscrisuri)', ok: poze.length > 0, detaliu: poze.length ? `${poze.length} poze` : 'lipsesc — cerute de PROSOCIAL la tranșă' },
  ]
  return out
}

// Ce e de facut acum pentru o achizitie (primul element lipsa din dosar, in ordinea procedurii).
export function urmatorulPas(dosar: ElementDosar[]): string | null {
  const lipsa = dosar.find(e => !e.ok)
  if (!lipsa) return null
  const t: Record<string, string> = {
    cerere: 'Trimite cererea de ofertă (Anexa 2) la cel puțin 3 furnizori — o poți genera din „Formulare achiziție”.',
    oferte: 'Strânge 3 oferte de la furnizori diferiți (PDF sau capturi cu dată și preț fără TVA).',
    nota: 'Completează și semnează nota de estimare (Anexa 1) — generează-o din „Formulare achiziție”.',
    contract: 'Încheie contractul cu furnizorul (preț, tranșe de plată, garanție).',
    factura: 'Cere și încarcă factura fiscală pe AB TEXTILE (proforma nu ajunge).',
    plata: 'Încarcă dovada plății (extrasul sau OP-ul executat). Dacă nu e plătită încă: plătește prin OP din contul AB TEXTILE.',
    pv: 'Semnează procesul-verbal de recepție (Anexa 3) — generează-l din „Formulare achiziție”.',
    poze: 'Fă poze cu bunul la locul de muncă, cu înscrisurile cerute, și încarcă-le.',
  }
  return t[lipsa.cheie] || null
}
