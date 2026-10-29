import { BUGET_INTEGRAL, type LinieBugetIntegral } from '@/lib/proiect-buget-date'
import { lunaProiect, etichetaLuna, INDICATORI } from '@/lib/proiect-plan'

// Executia bugetului PROIECT AB Textile: bugetul AA3 (proiect-buget-date.ts) minus platile reale din registrul
// proiect_plati. Calcule pure - folosite si in pagina, si in API / asistentul AI.

export type SursaPlata = 'subventie' | 'cofinantare'
export interface PlataProiect {
  id: string; linie_cod: string; data: string; suma: number; sursa: SursaPlata | null
  descriere: string | null; beneficiar: string | null; fisier_path?: string | null; fisier_nume?: string | null; created_at?: string
}

export const CATEGORII_SCURT: Record<string, string> = {
  '1': 'Salarii și contribuții', '3': 'Servicii specializate', '4': 'Echipamente, mobilier, materiale', '5': 'Chirie', '6': 'Leasing operațional',
}
export const categorieScurta = (cod: string) => CATEGORII_SCURT[cod.split('.')[0]] || 'Altele'

// Conditiile pentru transa 2. Transa 1 primita a fost 153.821,35 lei = varianta in 3 transe (50% / 40% / 10%,
// Buget AA3 foaia 4_grafic transe): pentru transa 2 se cheltuie minimum 50% din transa 1 si din cofinantare.
export const TRANSA1 = INDICATORI.transe3.transa1
export const PRAG_TRANSA2 = { subventie: INDICATORI.transe3.minCheltuitDinT1, cofinantare: INDICATORI.transe3.minCofinantare }

const r2 = (n: number) => Math.round(n * 100) / 100

// Fiecare plata se imparte intre subventie si cofinantare dupa sursa aleasa; fara sursa, dupa procentele liniei.
export function impartePlata(p: PlataProiect, linie?: LinieBugetIntegral): { subventie: number; cofinantare: number } {
  if (p.sursa === 'subventie') return { subventie: p.suma, cofinantare: 0 }
  if (p.sursa === 'cofinantare') return { subventie: 0, cofinantare: p.suma }
  const k = linie && linie.valoare ? linie.subventie / linie.valoare : 1
  return { subventie: r2(p.suma * k), cofinantare: r2(p.suma * (1 - k)) }
}

export interface ExecutieLinie extends LinieBugetIntegral {
  platit: number; platitSubventie: number; platitCofinantare: number; ramas: number; procent: number
  depasit: boolean; plati: PlataProiect[]; planPanaAcum: number
}
export interface PlataUrmatoare { cod: string; denumire: string; categorie: string; luna: number; eticheta: string; termen: string; suma: number; intarziat: boolean }

// Termenul de plata, dupa tipul liniei: salariile lunii L se platesc pana pe 20 a lunii urmatoare, contributiile
// pana pe 25 a lunii urmatoare, chiria la inceputul lunii, restul pana la sfarsitul lunii din plan.
function termen(cod: string, luna: number): string {
  const idx = 9 + (luna - 1), an = 2025 + Math.floor(idx / 12), lunaCal = ((idx % 12) + 12) % 12
  const d = (y: number, m: number, zi: number) => { const x = new Date(Date.UTC(y, m, zi)); return x.toISOString().slice(0, 10) }
  if (cod.startsWith('1.1')) return d(an, lunaCal + 1, 20)
  if (cod.startsWith('1.3')) return d(an, lunaCal + 1, 25)
  if (cod.startsWith('5.')) return d(an, lunaCal, 5)
  return d(an, lunaCal + 1, 0)
}

export function executieBuget(plati: PlataProiect[], azi: Date = new Date()) {
  const L = Math.max(1, Math.min(18, lunaProiect(azi)))
  const linii: ExecutieLinie[] = BUGET_INTEGRAL.map(l => {
    const pl = plati.filter(p => p.linie_cod === l.cod).sort((a, b) => a.data.localeCompare(b.data))
    const split = pl.map(p => impartePlata(p, l))
    const platit = r2(pl.reduce((s, p) => s + Number(p.suma), 0))
    return {
      ...l, plati: pl, platit,
      platitSubventie: r2(split.reduce((s, x) => s + x.subventie, 0)), platitCofinantare: r2(split.reduce((s, x) => s + x.cofinantare, 0)),
      ramas: r2(l.valoare - platit), procent: l.valoare ? Math.min(100, Math.round(platit / l.valoare * 100)) : 0,
      depasit: platit > l.valoare + 0.01, planPanaAcum: r2(l.luni.slice(0, L).reduce((a, b) => a + b, 0)),
    }
  })

  // Ce urmeaza: platile planificate inca neacoperite, luna cu luna. Platile facute acopera intai lunile cele mai vechi;
  // o luna din trecut ramasa neacoperita apare ca intarziata (fata de planul estimativ din buget).
  const urmatoare: PlataUrmatoare[] = []
  for (const l of linii) {
    if (l.ramas <= 0.01) continue
    let cum = 0
    l.luni.forEach((v, i) => {
      const prev = cum; cum += v
      const neacoperit = r2(Math.min(v, Math.max(0, cum - Math.max(l.platit, prev))))
      if (neacoperit > 0.01) urmatoare.push({ cod: l.cod, denumire: l.denumire, categorie: categorieScurta(l.cod), luna: i + 1, eticheta: etichetaLuna(i + 1), termen: termen(l.cod, i + 1), suma: neacoperit, intarziat: i + 1 < L })
    })
  }
  urmatoare.sort((a, b) => a.termen.localeCompare(b.termen) || a.cod.localeCompare(b.cod, 'ro', { numeric: true }))

  const sum = (f: (l: ExecutieLinie) => number) => r2(linii.reduce((s, l) => s + f(l), 0))
  const total = { aprobat: sum(l => l.valoare), platit: sum(l => l.platit), ramas: sum(l => l.ramas) }
  const subventie = { aprobat: sum(l => l.subventie), platit: sum(l => l.platitSubventie) }
  const cofinantare = { aprobat: sum(l => l.cofinantare), platit: sum(l => l.platitCofinantare) }
  const categorii = [...new Set(linii.map(l => categorieScurta(l.cod)))].map(nume => {
    const ls = linii.filter(l => categorieScurta(l.cod) === nume)
    return { nume, aprobat: r2(ls.reduce((s, l) => s + l.valoare, 0)), platit: r2(ls.reduce((s, l) => s + l.platit, 0)), linii: ls }
  })
  return {
    luna: L, total, categorii, linii, urmatoare,
    subventie: { ...subventie, ramas: r2(subventie.aprobat - subventie.platit) },
    cofinantare: { ...cofinantare, ramas: r2(cofinantare.aprobat - cofinantare.platit) },
    transa2: { subventie: { platit: subventie.platit, prag: PRAG_TRANSA2.subventie }, cofinantare: { platit: cofinantare.platit, prag: PRAG_TRANSA2.cofinantare } },
  }
}

// Rezumat text (pentru asistentul AI si raportul proiectului).
export function bugetText(plati: PlataProiect[]): string {
  const e = executieBuget(plati)
  const lei = (n: number) => n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const linii = e.linii.map(l => `- ${l.cod} ${l.denumire}: aprobat ${lei(l.valoare)} | plătit ${lei(l.platit)} | rămas ${lei(l.ramas)}${l.depasit ? ' | DEPĂȘIT' : ''}`).join('\n')
  const urm = e.urmatoare.slice(0, 25).map(u => `- ${u.termen.split('-').reverse().join('.')}${u.intarziat ? ' (întârziat față de plan)' : ''}: ${u.cod} ${u.denumire} — ${lei(u.suma)} (${u.eticheta})`).join('\n')
  return `EXECUȚIA BUGETULUI (Buget AA3 minus plățile înregistrate în ContaFlow; ${plati.length} plăți)
Total: aprobat ${lei(e.total.aprobat)} | plătit ${lei(e.total.platit)} | rămas ${lei(e.total.ramas)}
Subvenție: plătit ${lei(e.subventie.platit)} din ${lei(e.subventie.aprobat)} (prag tranșa 2: ${lei(PRAG_TRANSA2.subventie)}) | Cofinanțare: plătit ${lei(e.cofinantare.platit)} din ${lei(e.cofinantare.aprobat)} (prag tranșa 2: ${lei(PRAG_TRANSA2.cofinantare)})
Pe linii:
${linii}
Plăți care urmează (după planul lunar din buget):
${urm || '- nimic'}`
}
