const assert = require('node:assert/strict')
async function main() {
  const { specificationInput } = await import('../lib/achizitii-specification-input.ts')
  const { parsePurchaseAiSuggestions } = await import('../lib/achizitii-ai-suggestions.ts')
  assert.deepEqual(specificationInput({ product: ' Aer condiționat ', keywords: ' 12000 BTU, montaj ', type: 'Produse' }), { product: 'Aer condiționat', keywords: '12000 BTU, montaj', type: 'Produse' })
  for (const body of [null, {}, { product: 'x', keywords: '', type: 'Produse' }, { product: 'x', keywords: 'montaj', type: 'Necunoscut' }, { product: 'x', keywords: 'a'.repeat(4001), type: 'Produse' }]) assert.throws(()=>specificationInput(body))
  const proposal = 'Destinație:\n- Climatizare.\nCaracteristici minime:\n- Capacitate: 12000 BTU.\n- Montaj inclus.'
  const result = parsePurchaseAiSuggestions(JSON.stringify({ suggestions: [{ field: 'specs', line: 0, value: proposal, reason: 'Verifică cerințele.' }] }), 'oferta', 1)
  assert.equal(result[0].value, proposal)
  assert.equal(result[0].line, 0)
  console.log('OK: cuvinte-cheie, limite, tipuri și păstrarea textului structurat pe rânduri.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
