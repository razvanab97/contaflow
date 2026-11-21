import Anthropic from '@anthropic-ai/sdk'

// Analizează un document „pus în lucru" (cu spații de completat „______", numerotate ⟦1⟧…⟦N⟧) și decide,
// pentru fiecare spațiu, dacă îl putem completa din datele interne ale activității sau rămâne de completat manual.
// NU inventează date — doar potrivește ce avem. Spațiile pe care nu le putem completa sunt raportate ca „manuale".

export interface RezultatPregatire {
  completate: Record<string, string>         // nr. spațiu -> valoare (din date interne)
  manuale: { nr: number; eticheta: string }[] // nr. spațiu -> ce trebuie completat manual
}

export async function analizeazaDocument(context: string, total: number, dateInterne: string): Promise<RezultatPregatire | null> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const res = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 4000, // sonnet-5 gândește înainte de răspuns (adaptive) — lăsăm spațiu ca JSON-ul să nu fie tăiat
      messages: [{ role: 'user', content: [{ type: 'text', text:
`Ai un document oficial românesc în care fiecare spațiu de completat (liniile „______") a fost marcat cu un token ⟦N⟧, numerotat în ordinea din document. Sarcina ta: pentru FIECARE token de la ⟦1⟧ la ⟦${total}⟧, decide ce se completează acolo.

Ai la dispoziție DOAR aceste date interne ale activității — nu inventa nimic în plus:
${dateInterne}

DOCUMENTUL (cu tokenii ⟦N⟧ în spațiile de completat):
«««
${context}
»»»

Reguli:
- Dacă un spațiu se completează clar dintr-o dată internă de mai sus (ex. numărul de înregistrare, data, numele unui voluntar, numărul contractului, numărul de voluntari), pune-l la „completate".
- Dacă un spațiu cere o informație pe care NU o avem în datele interne (ex. ore efective, perioada unui voluntar necompletată, o semnătură, un câmp despre care nu știm nimic), pune-l la „manuale", cu o etichetă scurtă despre ce trebuie completat acolo (ex. „Ore efective — voluntar 1").
- La tabele cu mai multe rânduri decât voluntari avem, rândurile în plus rămân goale — NU le pune la „manuale" și nu inventa voluntari.
- La „manuale" pune DOAR câmpurile care chiar trebuie completate cu o informație reală pe care n-o avem (ex. ore efective, perioada unui voluntar). Nu pune rânduri goale de tabel, spații decorative sau semnături.
- Datele se scriu în formatul din document (ex. data ca ZZ.LL.AAAA dacă așa apare). Nu repeta textul deja existent, completează doar spațiul.
- Fii atent la coloane: potrivește valoarea cu antetul coloanei (Voluntar / Perioada / Ore / Contract nr.).
- Ține etichetele de la „manuale" scurte (2-5 cuvinte).

Răspunde DOAR cu JSON, fără alt text, „completate" primul:
{"completate": {"1":"valoare", "2":"valoare"}, "manuale": {"7":"etichetă scurtă", "8":"etichetă scurtă"}}` }] }],
    })
    const raw = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    // parsare rezilientă: dacă răspunsul a fost tăiat (max_tokens), salvăm măcar „completate"
    const parse = (s: string): unknown => { try { return JSON.parse(s) } catch { return null } }
    let p = (raw.match(/\{[\s\S]*\}/) && parse(raw.match(/\{[\s\S]*\}/)![0])) as { completate?: Record<string, unknown>; manuale?: Record<string, unknown> } | null
    if (!p) {
      const comp = raw.match(/"completate"\s*:\s*(\{[\s\S]*?\})\s*(?:,\s*"manuale"|\}\s*$|$)/)
      const compObj = comp && parse(comp[1])
      const man = raw.match(/"manuale"\s*:\s*(\{[\s\S]*?\})\s*\}?\s*$/)
      const manObj = man && parse(man[1])
      if (compObj) p = { completate: compObj as Record<string, unknown>, manuale: (manObj || {}) as Record<string, unknown> }
    }
    if (!p || !p.completate) return null
    const nebun = (s: string) => !s || /^[-–—\s]*$/.test(s) || /^(n\/?a|null|necunoscut)$/i.test(s)
    const completate: Record<string, string> = {}
    for (const [k, v] of Object.entries(p.completate || {})) {
      const nr = Number(k)
      if (!Number.isInteger(nr) || nr < 1 || nr > total) continue
      const val = String(v ?? '').replace(/\s+/g, ' ').trim()
      if (val && !/^null$/i.test(val)) completate[String(nr)] = val.slice(0, 300)
    }
    const manuale: { nr: number; eticheta: string }[] = []
    for (const [k, v] of Object.entries(p.manuale || {})) {
      const nr = Number(k)
      if (!Number.isInteger(nr) || nr < 1 || nr > total || completate[String(nr)]) continue
      const et = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
      if (nebun(et)) continue // sare peste rânduri goale / etichete fără sens („–", „n/a"…)
      manuale.push({ nr, eticheta: et })
    }
    manuale.sort((a, b) => a.nr - b.nr)
    return { completate, manuale }
  } catch {
    return null
  }
}
