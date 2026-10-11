// Planul de afaceri AB TEXTILE (PROSOCIAL, Act aditional nr. 3 din 01.07.2026), structurat: perioade,
// activitatile A1-A18 din graficul de implementare (Plan III.10), indicatorii asumati si obligatiile care
// decurg din plan + contract. Date pure (fara server) - folosite in modulul "Plan & AI proiect" si ca
// context pentru AI-ul "Intreaba proiectul". Starea fiecarui element (facut / in curs...) se tine in
// tabelul proiect_plan_stari; ce se poate deduce din date (luna curenta, termen depasit) se calculeaza aici.

export const PERIOADA = {
  start: '2025-10-01',              // L1 = octombrie 2025 (prima zi dupa semnarea contractului de subventie)
  sfarsitImplementare: '2027-03-31', // L18
  startSustenabilitate: '2027-04-01',
  sfarsitSustenabilitate: '2028-04-30', // 13 luni
}

// Luna proiectului (L1 = oct 2025) pentru o data; < 1 inainte de start.
export function lunaProiect(d: Date = new Date()): number {
  return (d.getFullYear() - 2025) * 12 + (d.getMonth() + 1 - 10) + 1
}
const LUNI_RO = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'noi', 'dec']
export function etichetaLuna(l: number): string {
  const idx = 9 + (l - 1) // 0-based luna calendaristica, de la oct 2025
  return `${LUNI_RO[((idx % 12) + 12) % 12]} ${2025 + Math.floor(idx / 12)}`
}
export function etapaProiect(d: Date = new Date()): { eticheta: string; luna: number } {
  const l = lunaProiect(d)
  if (l < 1) return { eticheta: 'înainte de start', luna: l }
  if (l <= 18) return { eticheta: `implementare — luna L${l} din 18`, luna: l }
  if (l <= 31) return { eticheta: `sustenabilitate — luna ${l - 18} din 13`, luna: l }
  return { eticheta: 'după sustenabilitate', luna: l }
}

// amanat = nu e necesar momentan (scos din "De confirmat", se poate relua oricand).
export type StatusPlan = 'facut' | 'in_curs' | 'urmeaza' | 'amanat' | 'nu_se_aplica'
export const STATUS_PLAN: Record<StatusPlan, string> = { facut: 'Făcut', in_curs: 'În curs', urmeaza: 'Urmează', amanat: 'Amânat (nu e necesar momentan)', nu_se_aplica: 'Nu se aplică' }
export interface StarePlan { cheie: string; status: StatusPlan; nota?: string | null; data_realizare?: string | null }

// --- Activitatile din graficul de implementare (Plan AA3, cap. III.10, pag. 56-61) -----------------
export interface ActivitatePlan { cheie: string; cod: string; titlu: string; rezultat: string; luni: [number, number] }
export const ACTIVITATI: ActivitatePlan[] = [
  { cheie: 'act.A1', cod: 'A1', titlu: 'Identificarea, închirierea și amenajarea spațiului', rezultat: 'Spațiu funcțional, igienizat, cu toate utilitățile, conform cerințelor legale', luni: [1, 6] },
  { cheie: 'act.A2', cod: 'A2', titlu: 'Documentație tehnică, fluxul de lucru, avize și autorizații de funcționare', rezultat: 'Afacerea e autorizată legal, cu toate documentele pentru începerea activității', luni: [1, 6] },
  { cheie: 'act.A3', cod: 'A3', titlu: 'Achiziția utilajelor (mașini de spălat, uscătoare, mese de călcat), mobilier recepție și vestiare', rezultat: 'Spațiul e complet echipat', luni: [1, 6] },
  { cheie: 'act.A4', cod: 'A4', titlu: 'Instalarea, testarea și punerea în funcțiune a echipamentelor', rezultat: 'Sistem de operare funcțional, verificat', luni: [2, 6] },
  { cheie: 'act.A5', cod: 'A5', titlu: 'Recrutare cu accent pe persoane vulnerabile', rezultat: 'Echipă cu minimum 2 persoane din categorii defavorizate angajată', luni: [3, 4] },
  { cheie: 'act.A6', cod: 'A6', titlu: 'Formare profesională: echipamente, igienă, securitate în muncă', rezultat: 'Personal calificat și pregătit', luni: [3, 6] },
  { cheie: 'act.A7', cod: 'A7', titlu: 'Identitate vizuală, promovare (pliante, rețele sociale, parteneriate locale)', rezultat: 'Vizibilitate și primii clienți', luni: [2, 12] },
  { cheie: 'act.A8', cod: 'A8', titlu: 'Aprovizionare cu detergenți ecologici, soluții, saci, ambalaje', rezultat: 'Continuitate și standarde de calitate', luni: [2, 18] },
  { cheie: 'act.A9', cod: 'A9', titlu: 'Monitorizarea normelor de igienă, SSM, protecția mediului, eficiență energetică', rezultat: 'Funcționare legală și sustenabilă', luni: [3, 6] },
  { cheie: 'act.A10', cod: 'A10', titlu: 'Grila de prețuri, carduri de fidelitate, reduceri pentru clienți recurenți', rezultat: 'Clienți mulțumiți și fidelizați', luni: [1, 8] },
  { cheie: 'act.A11', cod: 'A11', titlu: 'Site cu formular de comandă și opțiuni de ridicare/livrare', rezultat: 'Accesibilitate și vizibilitate online', luni: [1, 8] },
  { cheie: 'act.A12', cod: 'A12', titlu: 'Soft de management al comenzilor, clienților și fluxului', rezultat: 'Operare eficientă, trasabilitatea comenzilor', luni: [7, 18] },
  { cheie: 'act.A13', cod: 'A13', titlu: 'Manualul de proceduri (igienă, manipulare textile, relații cu clienții)', rezultat: 'Standardizare și calitate', luni: [7, 18] },
  { cheie: 'act.A14', cod: 'A14', titlu: 'Dubiță / mașină mică (achiziție sau închiriere) pentru ridicare și livrare', rezultat: 'Servicii extinse', luni: [6, 18] },
  { cheie: 'act.A15', cod: 'A15', titlu: 'Contracte cu hoteluri, pensiuni, restaurante, firme de curierat', rezultat: 'Volum constant de comenzi', luni: [8, 16] },
  { cheie: 'act.A16', cod: 'A16', titlu: 'Campanii de responsabilitate socială', rezultat: 'Impact social și recunoaștere în comunitate', luni: [4, 18] },
  { cheie: 'act.A17', cod: 'A17', titlu: 'Feedback de la clienți, urmărirea indicatorilor (calitate, timpi, rentabilitate)', rezultat: 'Eficiență și satisfacție crescute', luni: [1, 18] },
  { cheie: 'act.A18', cod: 'A18', titlu: 'Canale online (Facebook, Instagram, Google Business, TikTok), conținut, campanii plătite', rezultat: 'Notorietate, clienți noi, poziționare profesionistă și socială', luni: [1, 18] },
]

// --- Indicatori asumati (Plan AA3 I.1.3, I.2.3; Buget AA3 foaia 1_identificare, 4_grafic transe) ------
export const INDICATORI = {
  locuriMunca: 4,
  vulnerabili: 2,
  cofinantareProcent: 15,
  venituri: [{ an: 2026, valoare: 166230 }, { an: 2027, valoare: 291200 }, { an: 2028, valoare: 116630, nota: 'ian–apr' }],
  profit: [{ an: 2025, valoare: -14495 }, { an: 2026, valoare: 20524 }, { an: 2027, valoare: 27422 }, { an: 2028, valoare: 16246 }],
  sociali: [
    { titlu: 'Angajarea și formarea persoanelor vulnerabile', um: 'persoane', pe_an: 2 },
    { titlu: 'Programe de voluntariat formativ (inclusiv plătit)', um: 'persoane', pe_an: 4 },
    { titlu: 'Servicii gratuite / cu reducere pentru persoane defavorizate', um: 'familii', pe_an: 6 },
    { titlu: 'Ateliere de dezvoltare personală și profesională', um: 'evenimente', pe_an: 2 },
    { titlu: 'Ziua Curățeniei Comunei', um: 'evenimente', pe_an: 1 },
  ],
  transe2: { transa1: 215349.89, minCheltuitDinT1: 150744.92, minCofinantare: 32349.79, minVenituri: 46146.40, transa2: 13864.19 },
  transe3: { transa1: 153821.35, minCheltuitDinT1: 76910.68, minCofinantare: 23106.99, transa2: 123057.08, minCheltuitT1T2: 193814.90, transa3: 30764.27 },
}

// Planul lunar (Buget AA3): veniturile incasate planificate L1-L31 (foaia 3_venituri-cheltuieli, randul
// "total") si cheltuielile bugetate din proiect L1-L18 (foaia 2.0_buget integral, randul TOTAL).
export const VENITURI_PLAN_LUNAR = [0, 0, 0, 3145, 3965, 6690, 12585, 15130, 15450, 17020, 19740, 18970, 16945, 17240, 19350, 14520, 15090, 26510, 30500, 29490, 24490, 24700, 24520, 26400, 23040, 24740, 27200, 26460, 28130, 29080, 32960]
export const CHELTUIELI_BUGET_LUNAR = [0, 1000, 2684, 11985, 135574.41, 49002.50, 22446, 21446, 21446, 21446, 18186, 16502, 11335, 13402, 3280.29, 1000, 1000, 1000]

// --- Obligatii care decurg din plan si contract ---------------------------------------------------
export type CategorieObligatie = 'Autorizații' | 'Personal' | 'Social (anual)' | 'Financiar și tranșe' | 'Sustenabilitate'
export interface ObligatiePlan { cheie: string; categorie: CategorieObligatie; titlu: string; ce: string; termen?: string; sursa: string; anual?: boolean }
export const OBLIGATII: ObligatiePlan[] = [
  { cheie: 'aut.primarie', categorie: 'Autorizații', titlu: 'Autorizația de funcționare (Primărie)', ce: 'Cerere + actele firmei, contractul spațiului, dovada avizelor (DSP, Mediu etc.). Taxă ~200 lei, ~30 de zile.', termen: '2026-03-31', sursa: 'Plan AA3, III.6 (pag. 52) + A2' },
  { cheie: 'aut.dsp', categorie: 'Autorizații', titlu: 'Autorizația sanitară de funcționare (DSP Iași)', ce: 'Pe baza referatului de evaluare: spațiu igienic, ventilație, apă curentă, canalizare, flux logic de lucru. ~500 lei, ~30 de zile.', termen: '2026-03-31', sursa: 'Plan AA3, III.6 (pag. 52)' },
  { cheie: 'aut.apm', categorie: 'Autorizații', titlu: 'Autorizația de mediu (APM Iași)', ce: 'Memoriu tehnic, plan de gestionare a deșeurilor, apă/canalizare conforme, zgomot și emisii. ~500 lei, ~30 de zile.', termen: '2026-03-31', sursa: 'Plan AA3, III.6 (pag. 52)' },
  { cheie: 'aut.apavital', categorie: 'Autorizații', titlu: 'Avizul Apavital', ce: 'Aviz definitiv de branșare / racordare (la schimbarea utilizatorului, pentru persoane juridice). ~532 lei.', termen: '2026-03-31', sursa: 'Plan AA3, III.6 (pag. 52)' },
  { cheie: 'aut.isu', categorie: 'Autorizații', titlu: 'Avizul PSI (ISU)', ce: 'Conformare la normele P118/3, echipamente de stingere, plan de evacuare (proiect tehnic doar la spații mari). Gratuit la spații mici.', termen: '2026-03-31', sursa: 'Plan AA3, III.6 (pag. 52)' },
  { cheie: 'aut.itm', categorie: 'Autorizații', titlu: 'ITM: contracte de muncă, regulament intern, SSM', ce: 'Contracte de muncă, regulament intern, fișe de protecția muncii / SSM, instruiri.', termen: '2026-03-31', sursa: 'Plan AA3, III.6 (pag. 52)' },
  { cheie: 'aut.onrc', categorie: 'Autorizații', titlu: 'Certificat constatator ONRC (sediu + punct de lucru)', ce: 'Declararea sediului și a punctului de lucru la Registrul Comerțului. ~140 lei, ~14 zile.', termen: '2026-03-31', sursa: 'Plan AA3, III.6 (pag. 53)' },
  { cheie: 'pers.angajare', categorie: 'Personal', titlu: '4 locuri de muncă, din care 2 pentru persoane vulnerabile', ce: 'Manager întreprindere socială (4 h/zi), asistent manager (8 h/zi), 2 lucrători necalificați (8 h/zi). Minimum 2 persoane vulnerabile până la jumătatea anului 2 de activitate.', termen: '2026-06-30', sursa: 'Plan AA3, I.1.3, I.2.2, III.2 (pag. 5, 6, 47-50) + A5' },
  { cheie: 'pers.isi', categorie: 'Personal', titlu: 'Statutul de întreprindere socială de inserție (marca socială)', ce: 'Clauză obligatorie (am bifat DA): în maximum 6 luni de la angajarea persoanelor vulnerabile, demersuri la AJOFM pentru marca socială (Legea 219/2015, cap. III). Persoanele vulnerabile trebuie să cumuleze minimum 30% din normele de muncă.', sursa: 'Plan AA3, I.3.5 și nota 5 (pag. 11-12), III.3 (pag. 50)' },
  { cheie: 'pers.formare', categorie: 'Personal', titlu: 'Formare profesională acreditată pentru 2 persoane vulnerabile', ce: 'Acces la cel puțin un program acreditat (ex. operator curățătorie) pentru minimum 2 persoane din grupuri vulnerabile, în 18 luni.', termen: '2027-03-31', sursa: 'Plan AA3, I.2.2 (pag. 6)' },
  { cheie: 'pers.regulament', categorie: 'Personal', titlu: 'Regulament intern anti-discriminare', ce: 'Interzicerea hărțuirii și excluderii, mecanism de sesizare, sesiuni anuale de informare; egalitate de gen la salarii și promovare.', sursa: 'Plan AA3, IV.4 (pag. 64)' },
  { cheie: 'soc.voluntariat', categorie: 'Social (anual)', titlu: 'Voluntariat formativ: 4 tineri / an', ce: 'Stagii de practică sau voluntariat plătit, minimum 1 stagiu pe trimestru; minimum 3 tineri din Erbiceni în primele 12 luni.', sursa: 'Plan AA3, I.2.2, I.3.2 (pag. 6, 9)', anual: true },
  { cheie: 'soc.familii', categorie: 'Social (anual)', titlu: 'Servicii gratuite / cu reducere: 6 familii / an', ce: 'Servicii gratuite sau cu reducere pentru persoane defavorizate, minimum 6 familii anual.', sursa: 'Plan AA3, I.2.3, I.3.2 (pag. 7, 9)', anual: true },
  { cheie: 'soc.ateliere', categorie: 'Social (anual)', titlu: 'Ateliere de dezvoltare: 2 / an', ce: 'Ateliere gratuite sau subvenționate (igienă, deprinderi de viață, pregătire pentru angajare).', sursa: 'Plan AA3, I.3.2 (pag. 9)', anual: true },
  { cheie: 'soc.campanie', categorie: 'Social (anual)', titlu: 'Campanie de conștientizare a incluziunii: minimum 1 / an', ce: 'Informare în școli, primărie sau comunitate; 2 evenimente de informare în primii 2 ani de funcționare.', sursa: 'Plan AA3, I.2.2, I.3.2 (pag. 6, 9)', anual: true },
  { cheie: 'soc.ziua_curateniei', categorie: 'Social (anual)', titlu: 'Ziua Curățeniei Comunei: 1 / an', ce: 'Minimum o activitate pe an.', sursa: 'Plan AA3, I.3.2 (pag. 9)', anual: true },
  { cheie: 'soc.donatii', categorie: 'Social (anual)', titlu: 'Haine donate, igienizate și redistribuite: 2 / an', ce: 'Primirea de haine donate, igienizarea și donarea lor către persoane vulnerabile, minimum 2 activități pe an.', sursa: 'Plan AA3, I.3.2 (pag. 9)', anual: true },
  { cheie: 'soc.raport_impact', categorie: 'Social (anual)', titlu: 'Raportul anual de impact social', ce: 'Publicat începând cu sfârșitul primelor 12 luni de activitate.', sursa: 'Plan AA3, I.2.2 (pag. 6)', anual: true },
  { cheie: 'fin.cofinantare', categorie: 'Financiar și tranșe', titlu: 'Cofinanțare 15%: 46.213,98 lei', ce: 'Contribuția proprie: 10% din salarii + liniile de cofinanțare din buget (site, mobilier, dotări, materiale).', sursa: 'Buget AA3, foile 2.2 și 5-sinteză' },
  { cheie: 'fin.transa2', categorie: 'Financiar și tranșe', titlu: 'Condițiile pentru tranșa următoare', ce: 'Varianta în 2 tranșe: tranșa 1 = 215.349,89 lei (70%); pentru tranșa 2 (13.864,19 lei) trebuie cheltuit minimum 150.744,92 lei din tranșa 1, minimum 32.349,79 lei cofinanțare și venituri generate de minimum 46.146,40 lei. Varianta în 3 tranșe: 50% / 40% / 10%.', sursa: 'Buget AA3, foaia 4_grafic tranșe' },
  { cheie: 'fin.manechin', categorie: 'Financiar și tranșe', titlu: 'Manechin: diferența peste 2.280,29 lei din fonduri proprii', ce: 'Prin AA3 linia a scăzut de la 12.280,29 la 2.280,29 lei (10.000 lei mutați la chirie); la cumpărare, diferența o suportă antreprenorul.', sursa: 'Memoriu justificativ AA3, linia 14' },
  { cheie: 'fin.chirie', categorie: 'Financiar și tranșe', titlu: 'Chiria: 17 luni × 1.000 lei din subvenție', ce: 'Prin AA3 chiria a crescut de la 7.000 la 17.000 lei, pentru a acoperi perioada de implementare.', sursa: 'Memoriu justificativ AA3, linia 35' },
  { cheie: 'sust.locuri', categorie: 'Sustenabilitate', titlu: 'Menținerea celor 4 locuri de muncă (2 vulnerabile) în sustenabilitate', ce: 'Perioada de sustenabilitate: 01.04.2027–30.04.2028 (13 luni). Contracte pe durată nedeterminată, minimum 30% personal din grupuri vulnerabile.', termen: '2028-04-30', sursa: 'Plan AA3, V.1–V.4 (pag. 65-67)' },
]

// Status implicit, dedus din calendar, cand nu e marcat manual.
export function statusImplicitActivitate(a: ActivitatePlan, lunaCurenta: number): { status: StatusPlan; intarziere: boolean } {
  if (lunaCurenta > a.luni[1]) return { status: 'urmeaza', intarziere: true } // termenul din plan a trecut - de confirmat
  if (lunaCurenta >= a.luni[0]) return { status: 'in_curs', intarziere: false }
  return { status: 'urmeaza', intarziere: false }
}
export function termenDepasit(o: ObligatiePlan, azi: Date = new Date()): boolean {
  return !!o.termen && new Date(o.termen + 'T23:59:59') < azi
}
