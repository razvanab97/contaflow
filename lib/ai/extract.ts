import Anthropic from '@anthropic-ai/sdk'
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface TxData { data_tranzactie:string; descriere:string; descriere_curatata:string; tip:'debit'|'credit'; suma:number; valuta:string; referinta?:string; categorie:string }
export interface ExtrasData { iban?:string; valuta:string; numar_extras?:string; perioada_start?:string; perioada_end?:string; sold_initial?:number; sold_final?:number; total_debit?:number; total_credit?:number; tranzactii:TxData[] }

export async function extractExtras(pdfBase64: string): Promise<ExtrasData> {
  const res = await client.messages.create({
    model: 'claude-opus-4-5', max_tokens: 8192,
    messages: [{ role:'user', content: [
      { type:'document', source:{ type:'base64', media_type:'application/pdf', data:pdfBase64 } },
      { type:'text', text:`Extrage toate tranzacțiile din acest extras de cont bancar românesc.
Returnează DOAR JSON valid, fără text extra, fără markdown.
Format:
{"iban":"RO...","valuta":"RON","numar_extras":"5","perioada_start":"2026-05-01","perioada_end":"2026-05-31","sold_initial":24.80,"sold_final":275.54,"total_debit":21489.36,"total_credit":21740.10,"tranzactii":[{"data_tranzactie":"2026-05-04","descriere":"original","descriere_curatata":"Trendyol plată","tip":"credit","suma":300.15,"valuta":"RON","referinta":"REF123","categorie":"client"}]}
Categorii: client|furnizor|taxa|angajat|transfer|comision|banca|altele
NU include RULAJ ZI, SOLD FINAL, SOLD ANTERIOR.` }
    ]}]
  })
  const text = res.content.filter(b=>b.type==='text').map(b=>(b as {text:string}).text).join('')
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('No JSON in response')
  return JSON.parse(m[0]) as ExtrasData
}
