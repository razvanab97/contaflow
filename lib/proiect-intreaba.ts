import type { SupabaseClient } from '@supabase/supabase-js'
import { DOCUMENTE_PROIECT, VERSIUNE_DOCUMENTE } from '@/lib/proiect-cunostinte-date'
import { BUGET_ACHIZITII, PASI_PROCEDURA, PROIECT, coduriDin } from '@/lib/achizitii-procedura'
import { ACTIVITATI, OBLIGATII, STATUS_PLAN, etapaProiect, etichetaLuna, lunaProiect, statusImplicitActivitate, termenDepasit, type StarePlan } from '@/lib/proiect-plan'

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
1. Sursa de adevăr sunt documentele oficiale de mai jos, versiunea în vigoare: ${VERSIUNE_DOCUMENTE} (Act adițional nr. 3 din 01.07.2026). Versiunile anterioare (AA1, AA2) nu mai contează decât istoric.
2. Citează sursa după fiecare afirmație importantă, scurt, în paranteză: (Plan ${VERSIUNE_DOCUMENTE}, pag. N), (Buget ${VERSIUNE_DOCUMENTE}, linia 4.6), (Act adițional ${VERSIUNE_DOCUMENTE}), (Memoriu ${VERSIUNE_DOCUMENTE}), (Date ContaFlow) sau (Procedura internă ContaFlow). Paginile planului sunt marcate în text cu [pag. N].
3. Nu inventa reguli, sume sau termene. Dacă ceva nu reiese din documente sau din date, spune clar „nu reiese din documentele proiectului” și recomandă să fie întrebat administratorul schemei (PROSOCIAL — Asociația Institutul pentru Orașe Vizionare, prosocial@iov.ro; manager de proiect Păunică Ionela), eventual cu textul exact al întrebării.
4. Sumele din buget sunt cu TVA inclus. Calculele le faci explicit (ex. „38.522,77 − 37.000 = 1.522,77 lei”).
5. Când întrebarea cere o acțiune (ex. „pot cumpăra X?”, „ce am de făcut luna asta?”), răspunde cu: verdict scurt → de ce (cu surse) → pașii concreți, în ordine.
6. O cheltuială în afara bugetului aprobat sau peste valoarea liniei necesită acordul PROSOCIAL / act adițional înainte de cumpărare (cum s-a făcut prin AA3 la manechin și chirie).
7. Procedura internă de achiziții (de mai jos) e reconstituită în ContaFlow din dosarele reale — nu e document oficial; spune asta când te bazezi pe ea.
8. Formatare: paragrafe scurte și liste; fără tabele mari; maximum ~250 de cuvinte, dacă nu se cere detaliu.

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

  const [{ data: ach }, { data: raport }] = await Promise.all([
    sb.from('proiect_achizitii').select('*').eq('firma_id', firmaId).order('created_at'),
    sb.from('proiect_raport_campuri').select('*').eq('firma_id', firmaId).order('updated_at', { ascending: false }).limit(1),
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

  return `DATE CONTAFLOW (live, ${azi.toLocaleDateString('ro-RO')})
Azi: ${azi.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })} — proiectul e în ${etapa.eticheta}. Implementare: 01.10.2025–31.03.2027 (L1–L18); sustenabilitate: 01.04.2027–30.04.2028.

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
