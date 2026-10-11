const assert = require('node:assert/strict')
async function main() {
  const { parsePurchaseAiSuggestions } = await import('../lib/achizitii-ai-suggestions.ts')
  const raw = JSON.stringify({ suggestions: [
    { field: 'specs', line: 0, value: ' Putere [de confirmat] ', reason: 'De verificat' },
    { field: 'specs', line: 0, value: 'Duplicat', reason: '' },
    { field: 'specs', line: 9, value: 'Linie inexistentă', reason: '' },
    { field: 'conditii', value: 'Garanție [de confirmat]', reason: 'Solicitare' },
    { field: 'furnizor', value: 'Inventat', reason: '' },
    { field: 'price', line: 0, value: '100', reason: '' },
    { field: 'specs', line: 1, value: 'a'.repeat(4001), reason: '' },
  ] })
  const result = parsePurchaseAiSuggestions(raw, 'oferta', 2)
  assert.equal(result.length, 2)
  assert.equal(result[0].value, 'Putere [de confirmat]')
  assert.equal(parsePurchaseAiSuggestions(raw, 'receptie', 2).length, 1)
  assert.deepEqual(parsePurchaseAiSuggestions('```json\n{"suggestions":[]}\n```', 'oferta', 1), [])
  assert.throws(() => parsePurchaseAiSuggestions('{"suggestions":null}', 'oferta', 1))
  console.log('OK: doar câmpuri permise, indici validați, fără duplicate, limite text, JSON și forme.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
