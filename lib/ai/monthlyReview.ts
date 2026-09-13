import Anthropic from '@anthropic-ai/sdk'
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ModuleSummary { slug: string; label: string; done: number; total: number; dezactivat: boolean }
export interface MonthlySummary {
  firmaNume: string
  lunaLabel: string
  module: ModuleSummary[]
  extras: { totalTranzactii: number; cuNota: number; nedocumentate: number } | null
  documentePeSectiune: Record<string, number>
  restanteCount: number
}

// Genereaza recomandari concrete de reducere a muncii manuale, pe baza datelor reale ale lunii -
// nu "next steps" pentru luna curenta (task-uri neterminate deja vizibile in UI), ci sugestii
// pentru cum sa evolueze SISTEMUL (automatizari, sabloane, module de recablat) intre luni.
export async function generateMonthlyRecommendations(summary: MonthlySummary): Promise<string> {
  const res = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Ești un consultant de procese contabile. Analizează datele reale de mai jos, dintr-o lună de
lucru într-o aplicație de contabilitate (ContaFlow), pentru firma "${summary.firmaNume}", luna ${summary.lunaLabel}.

DATE REALE (nu inventate):
${JSON.stringify(summary, null, 2)}

Sarcina ta: NU rezuma luna și NU spune ce task-uri au rămas neterminate (asta se vede deja direct
în aplicație). Identifică 3-5 recomandări CONCRETE despre cum ar putea SISTEMUL (aplicația, fluxul
de lucru, automatizările) să reducă munca manuală viitoare a utilizatorului, pornind STRICT de la
semnalele din date - de exemplu: module dezactivate constant (poate n-ar trebui să mai apară deloc
pentru firma asta), tranzacții nedocumentate multe (poate lipsește o potrivire automată), note
manuale multe pe tranzacții (poate indică o categorie/regulă lipsă), un modul mereu la 0%
(poate nu se aplică firmei).

Nu inventa probleme care nu reies din date. Dacă un semnal e prea slab pentru o concluzie fermă,
spune-o direct, nu forța o recomandare.

Răspunde în română, ca listă scurtă (3-5 puncte), fiecare punct: observația din date + recomandarea
concretă. Fără introducere, fără concluzie, fără formatare markdown (##, **) - text simplu, fiecare
punct pe un rând nou, prefixat cu "• ".`,
    }],
  })
  return res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('').trim()
}
