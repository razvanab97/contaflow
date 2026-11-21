import Anthropic from '@anthropic-ai/sdk'

// Extrage datele de identitate dintr-un buletin / carte de identitate (RO) pentru completarea
// documentelor beneficiarului. Întoarce câmpurile ca marcaje (NUME, CNP, DOMICILIU, DATA_NASTERII).
// Data nașterii se recalculează din CNP (sigur), nu se bazează pe OCR-ul datei.

export interface DateBuletin { NUME?: string; CNP?: string; DOMICILIU?: string; DATA_NASTERII?: string }

// Data nașterii din CNP: S AA LL ZZ ... (S=sex/secol). 1/2→19xx, 3/4→18xx, 5/6→20xx, 7/8→rezidenți(19/20xx).
export function dataNasteriiDinCnp(cnp: string): string | null {
  if (!/^\d{13}$/.test(cnp)) return null
  const s = +cnp[0], aa = cnp.slice(1, 3), ll = cnp.slice(3, 5), zz = cnp.slice(5, 7)
  const sec = s === 1 || s === 2 ? '19' : s === 3 || s === 4 ? '18' : s === 5 || s === 6 ? '20' : (+aa <= 25 ? '20' : '19')
  const an = +(sec + aa), luna = +ll, zi = +zz
  if (luna < 1 || luna > 12 || zi < 1 || zi > 31) return null
  return `${zz}.${ll}.${an}`
}

export async function extrageDateBuletin(bytes: Uint8Array, mediaType: string): Promise<DateBuletin | null> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const data = Buffer.from(bytes).toString('base64')
    const source = mediaType === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: (mediaType === 'image/png' ? 'image/png' : 'image/jpeg') as 'image/png' | 'image/jpeg', data } }
    const res = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 600,
      messages: [{ role: 'user', content: [source, { type: 'text', text:
        `Act de identitate românesc. Poate fi: (a) carte de identitate veche ("buletin"), (b) carte de identitate electronică nouă (CEI/eID, cu cip), sau (c) un PDF generat de aplicația "RO CEI Reader" a MAI, cu câmpuri etichetate (Nume de familie, Prenume, CNP, Data nașterii, Domiciliu etc.). Fotografia poate fi rotită sau pe lateral — rotește-o mental ca s-o citești corect, inclusiv zona MRZ (rândurile cu <<<) din partea de jos/spate.

Extrage DOAR ce scrie efectiv pe document (nu inventa). Răspunde DOAR cu JSON, fără alt text:
{"numeFamilie":"numele de familie (ex. Popescu) sau null","prenume":"prenumele complet (ex. Ion Andrei) sau null","cnp":"cele 13 cifre, exact ca pe document sau din MRZ, sau null","domiciliu":"adresa de domiciliu completă așa cum e scrisă (ex. Jud.IS Sat.Erbiceni (Com.Erbiceni)) sau null","dataNasterii":"ZZ.LL.AAAA sau null"}

Reguli: "numeFamilie" = câmpul Nume/Nom/Surname. "prenume" = câmpul Prenume/Given names. CNP-ul are exact 13 cifre (pe CEI poate fi scris "CNP/PIN"); dacă nu-l vezi clar pe față, ia-l din MRZ. "domiciliu" e adresa de la Domiciliu/Adresă (nu locul nașterii). Dacă un câmp nu se vede clar, pune null.` }] }],
    })
    const raw = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return null
    const p = JSON.parse(m[0])
    const cnp = typeof p.cnp === 'string' && /^\d{13}$/.test(p.cnp.replace(/\s/g, '')) ? p.cnp.replace(/\s/g, '') : null
    const out: DateBuletin = {}
    // NUME = Nume de familie + Prenume (ordinea de pe act); acceptă și vechiul câmp "nume" dacă vine așa
    const curat = (v: unknown) => typeof v === 'string' && v.trim() && !/^null$/i.test(v.trim()) ? v.replace(/\s+/g, ' ').trim() : ''
    const numeComplet = [curat(p.numeFamilie), curat(p.prenume)].filter(Boolean).join(' ') || curat(p.nume)
    if (numeComplet) out.NUME = numeComplet.slice(0, 150)
    if (cnp) out.CNP = cnp
    if (typeof p.domiciliu === 'string' && p.domiciliu.trim()) out.DOMICILIU = p.domiciliu.replace(/\s+/g, ' ').trim().slice(0, 300)
    // data nașterii: din CNP (sigur), altfel ce-a citit AI
    const dinCnp = cnp ? dataNasteriiDinCnp(cnp) : null
    const dinAi = typeof p.dataNasterii === 'string' && /^\d{2}\.\d{2}\.\d{4}$/.test(p.dataNasterii) ? p.dataNasterii : null
    if (dinCnp || dinAi) out.DATA_NASTERII = dinCnp || dinAi!
    return out
  } catch {
    return null
  }
}
