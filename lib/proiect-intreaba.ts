import type { SupabaseClient } from '@supabase/supabase-js'
import { listaMemorie, memorieText } from '@/lib/proiect-memorie'
import { DOCUMENTE_PROIECT, VERSIUNE_DOCUMENTE } from '@/lib/proiect-cunostinte-date'
import { BUGET_ACHIZITII, PASI_PROCEDURA, PROIECT, coduriDin } from '@/lib/achizitii-procedura'
import { ACTIVITATI, CHELTUIELI_BUGET_LUNAR, OBLIGATII, STATUS_PLAN, VENITURI_PLAN_LUNAR, etapaProiect, etichetaLuna, lunaProiect, statusImplicitActivitate, termenDepasit, type StarePlan } from '@/lib/proiect-plan'

// "Intreaba proiectul": AI-ul proiectului PROSOCIAL (AB TEXTILE). Raspunde DOAR pe baza documentelor
// oficiale (plan de afaceri, buget, act aditional, memoriu - generate in proiect-cunostinte-date.ts) si
// a datelor reale din ContaFlow (achizitii, starea obligatiilor, ultimul raport lunar).

export const MODEL_PROIECT = process.env.PROIECT_AI_MODEL || 'claude-sonnet-5'

const lei = (n: number) => n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Partea fixa (documentele) - aceeasi la fiecare intrebare, deci se cache-uieste (prompt caching).
export function promptFix(): string {
  const docs = DOCUMENTE_PROIECT.map(d => `<document id="${d.id}" titlu="${d.titlu}">\n${d.text}\n</document>`).join('\n\n')
  const procedura = PASI_PROCEDURA.map(p => `${p.nr}. ${p.titlu}: ${p.ce} Reguli: ${p.reguli.join(' ')}`).join('\n')
  return `Ești asistentul proiectului european al firmei AB TEXTILE S.R.L. — schema de minimis PROSOCIAL (${PROIECT.program}), ${PROIECT.contract}, reprezentant legal ${PROIECT.reprezentant}. Răspunzi utilizatorului (administratorul firmei) în limba română, practic și la obiect.

REGULI
1. Sursa de adevăr sunt documentele de mai jos: cele oficiale (plan, buget, act adițional, memoriu) și documentele locale ale proiectului (rapoartele lunare trimise, cererile de tranșă, dosarul AJOFM, contracte, constatările din scanări) — din cele locale afli CE S-A FĂCUT DEJA. Planul oficial e în versiunea în vigoare: ${VERSIUNE_DOCUMENTE} (Act adițional nr. 3 din 01.07.2026). Versiunile anterioare (AA1, AA2) nu mai contează decât istoric.
2. Citează sursa după fiecare afirmație importantă, scurt, în paranteză: (Plan ${VERSIUNE_DOCUMENTE}, pag. N), (Buget ${VERSIUNE_DOCUMENTE}, linia 4.6), (Act adițional ${VERSIUNE_DOCUMENTE}), (Memoriu ${VERSIUNE_DOCUMENTE}), (Date ContaFlow) sau (Procedura internă ContaFlow). Paginile planului sunt marcate în text cu [pag. N].
3. Nu inventa reguli, sume sau termene. Dacă ceva nu reiese din documente sau din date, spune clar „nu reiese din documentele proiectului” și recomandă să fie întrebat administratorul schemei (PROSOCIAL — Asociația Institutul pentru Orașe Vizionare, prosocial@iov.ro; manager de proiect Păunică Ionela), eventual cu textul exact al întrebării.
4. Sumele din buget sunt cu TVA inclus. Calculele le faci explicit (ex. „38.522,77 − 37.000 = 1.522,77 lei”).
5. Când întrebarea cere o acțiune (ex. „pot cumpăra X?”, „ce am de făcut luna asta?”): verdict în „Pe scurt” → de ce (1–3 puncte cu surse) → pașii concreți, în ordine.
6. O cheltuială în afara bugetului aprobat sau peste valoarea liniei necesită acordul PROSOCIAL / act adițional înainte de cumpărare (cum s-a făcut prin AA3 la manechin și chirie).
7. Procedura internă de achiziții (de mai jos) e reconstituită în ContaFlow din dosarele reale — nu e document oficial; spune asta când te bazezi pe ea.
8. Răspunsuri SCURTE, PUNCTUALE, STRUCTURATE — dar concrete, nu generale: cifre, date, nume, numere de document reale pentru AB TEXTILE. Nu reformula titlurile din plan, nu adăuga paragrafe de „context” sau explicații pe care nu le-a cerut, nu repeta informația, nu încheia cu oferte generice („dacă ai nevoie, pot…”).
9. Când citezi un document local, folosește titlul lui (ex. „Raport lunar — iunie 2026”), niciodată id-ul intern (local1, local2…). Ultimul raport lunar completat în ContaFlow (secțiunea DATE CONTAFLOW) e o sursă separată de rapoartele din dosarul local — spune „(Raport lunar în ContaFlow, perioada …)”.
10. Format obligatoriu:
   - Prima linie: **Pe scurt:** răspunsul direct, în 1–2 propoziții.
   - Apoi 2–4 secțiuni cu titlu scurt (##), fiecare cu maximum 5 puncte de o singură linie. Secțiuni tipice, doar cele relevante: „Ce prevede planul”, „Ce s-a făcut”, „Ce lipsește / e întârziat”, „De făcut acum” (pași numerotați, cu termen).
   - Sursa la finalul fiecărui punct, scurt, în paranteză: (Plan AA3, pag. 11), (Raport iunie 2026), (Certificat ISI), (ContaFlow).
   - **Bold** doar pentru cifre, sume și termene. Tabel doar dacă compari cifre (max. 4 coloane, 6 rânduri).
   - Lungime: maximum ~180 de cuvinte; până la ~300 doar dacă utilizatorul cere explicit detalii, un plan complet sau o listă lungă.

11. MEMORIA PROIECTULUI (în DATE CONTAFLOW) e jurnalul cu ce s-a întâmplat efectiv — e cea mai recentă sursă; are prioritate față de rapoartele vechi când se contrazic. Folosește-o la orice întrebare despre stadiu.
12. Când utilizatorul îți spune un FAPT NOU despre proiect (ceva ce s-a întâmplat sau s-a decis: „am primit autorizația de mediu azi”, „am semnat contract cu pensiunea X”, „am făcut atelierul de igienă pe 10 octombrie”), răspunde normal, iar la final adaugă pe rânduri separate, câte unul pe fapt: [[MEMORIE: AAAA-LL-ZZ | categorie | fapt scurt, complet, cu cifre/nume]] — categorie una din: Autorizații, Personal, Achiziții, Activitate și clienți, Social, Financiar, Raportare, Altele. Data = data faptului (dacă nu e spusă, data de azi). Nu marca întrebări, intenții sau lucruri deja aflate în memorie.

PROCEDURA INTERNĂ DE ACHIZIȚII (ContaFlow)
${procedura}

DOCUMENTELE OFICIALE ALE PROIECTULUI
${docs}`
}

// Partea variabila: data de azi, luna proiectului si datele reale din ContaFlow.
export async function contextLive(sb: SupabaseClient, firmaId: string, stari: StarePlan[]): Promise<string> {
  const azi = new Date()
  const etapa = etapaProiect(azi)
  const L = lunaProiect(azi)
  const stare = (cheie: string) => stari.find(s => s.cheie === cheie)

  const [{ data: ach }, { data: raport }, { memorie }] = await Promise.all([
    sb.from('proiect_achizitii').select('*').eq('firma_id', firmaId).order('created_at'),
    sb.from('proiect_raport_campuri').select('*').eq('firma_id', firmaId).order('updated_at', { ascending: false }).limit(1),
    listaMemorie(sb, firmaId, { limit: 200 }),
  ])
  const achizitii = (ach || []) as { denumire: string; valoare: number | null; sursa: string | null; status: string; linie_buget?: string | null }[]
  const linieAch = achizitii.map(a => `- ${a.denumire} | linia ${a.linie_buget || '— (fără linie)'} | ${a.sursa || '?'} | ${a.valoare != null ? lei(a.valoare) + ' lei' : 'fără valoare'} | status: ${a.status}`).join('\n') || '- (nicio achiziție)'
  const folosite = new Set(achizitii.flatMap(a => coduriDin(a.linie_buget)))
  const necumparate = BUGET_ACHIZITII.filter(l => !folosite.has(l.cod)).map(l => `${l.cod} ${l.denumire} (${lei(l.valoare)} lei, ${l.sursa === 'grant' ? 'subvenție' : 'cofinanțare'})`).join('; ')
  const angajat = (s: string) => achizitii.filter(a => coduriDin(a.linie_buget).some(c => BUGET_ACHIZITII.find(l => l.cod === c)?.sursa === s)).reduce((t, a) => t + (a.valoare || 0), 0)
  const plan = (s: string) => BUGET_ACHIZITII.filter(l => l.sursa === s).reduce((t, l) => t + l.valoare, 0)

  const act = ACTIVITATI.map(a => {
    const st = stare(a.cheie)
    const impl = statusImplicitActivitate(a, L)
    const s = st ? STATUS_PLAN[st.status] : impl.intarziere ? 'nemarcat — termenul din plan a trecut' : `nemarcat (după calendar: ${STATUS_PLAN[impl.status].toLowerCase()})`
    return `- ${a.cod} ${a.titlu} | plan L${a.luni[0]}–L${a.luni[1]} (${etichetaLuna(a.luni[0])} – ${etichetaLuna(a.luni[1])}) | ${s}${st?.nota ? ` | notă: ${st.nota}` : ''}`
  }).join('\n')
  const obl = OBLIGATII.map(o => {
    const st = stare(o.cheie)
    const s = st ? STATUS_PLAN[st.status] : termenDepasit(o, azi) ? 'nemarcat — termen depășit' : 'nemarcat'
    return `- ${o.titlu}${o.termen ? ` | termen ${o.termen}` : ''} | ${s}${st?.nota ? ` | notă: ${st.nota}` : ''}`
  }).join('\n')
  const r = (raport || [])[0] as Record<string, unknown> | undefined
  const rap = r ? Object.entries(r).filter(([k, v]) => v && !['id', 'firma_id', 'updated_at'].includes(k)).map(([k, v]) => `${k}: ${String(v).slice(0, 600)}`).join('\n') : '(niciun raport completat)'

  const planLuna = (l: number) => l >= 1 && l <= 31
    ? `L${l} (${etichetaLuna(l)}): venituri încasate planificate ${lei(VENITURI_PLAN_LUNAR[l - 1] || 0)} lei; cheltuieli bugetate din proiect ${l <= 18 ? lei(CHELTUIELI_BUGET_LUNAR[l - 1] || 0) + ' lei' : '— (sustenabilitate)'}; activități programate: ${ACTIVITATI.filter(a => l >= a.luni[0] && l <= a.luni[1]).map(a => a.cod).join(', ') || '—'}`
    : ''
  const luniPlan = [L - 1, L, L + 1].map(planLuna).filter(Boolean).join('\n')

  return `DATE CONTAFLOW (live, ${azi.toLocaleDateString('ro-RO')})
Azi: ${azi.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })} — proiectul e în ${etapa.eticheta}. Implementare: 01.10.2025–31.03.2027 (L1–L18); sustenabilitate: 01.04.2027–30.04.2028.

MEMORIA PROIECTULUI (ce s-a întâmplat efectiv, cele mai noi primele)
${memorieText(memorie)}

PLANUL PE LUNI (luna trecută, curentă, următoare — Buget AA3, foile 3_venituri-cheltuieli și 2.0)
${luniPlan}

ACHIZIȚII ÎNREGISTRATE (din modulul Achiziții)
${linieAch}
Angajat pe liniile de achiziții: subvenție ${lei(angajat('grant'))} din ${lei(plan('grant'))} lei; cofinanțare ${lei(angajat('cofinantare'))} din ${lei(plan('cofinantare'))} lei.
Linii de achiziții din buget fără achiziție: ${necumparate || 'niciuna'}

ACTIVITĂȚILE DIN PLAN — stare (marcată de utilizator în ContaFlow)
${act}

OBLIGAȚII DIN PLAN ȘI CONTRACT — stare
${obl}

ULTIMUL RAPORT LUNAR (câmpuri completate în ContaFlow)
${rap}`
}
