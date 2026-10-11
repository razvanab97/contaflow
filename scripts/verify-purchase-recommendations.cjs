const assert = require('node:assert/strict')

async function main() {
  const { purchaseRecommendations, purchaseProductExample } = await import('../lib/achizitii-form-recommendations.ts')
  const purchase = { denumire: 'Aer condiționat', nota: 'Tip: Produse. Specificații tehnice minime: 12000 BTU, montaj inclus', valoare: 4000 }
  const state = { forms: {} }
  let result = purchaseRecommendations('oferta', state, purchase)
  assert.equal(result.achizitie.value, purchase.denumire)
  assert.equal(result.tip.value, 'Produse')
  for (const key of ['numar', 'data', 'furnizor', 'justificare', 'conditii']) assert.equal(result[key], undefined)
  assert.deepEqual(purchaseProductExample(purchase), { product: 'Aer condiționat', specs: '12000 BTU, montaj inclus' })
  assert.equal(purchaseProductExample(null), null)
  state.forms.nota = { fields: { furnizor: 'Furnizor real', achizitie: 'Denumire verificată' }, lines: [] }
  result = purchaseRecommendations('oferta', state, purchase)
  assert.equal(result.furnizor.value, 'Furnizor real')
  assert.match(result.furnizor.source, /acest dosar/)
  assert.equal(result.achizitie.value, 'Denumire verificată')
  state.forms.receptie = { fields: { furnizor: 'Alt furnizor' }, lines: [] }
  assert.equal(purchaseRecommendations('oferta', state, purchase).furnizor, undefined)
  assert.equal(purchaseRecommendations('nota', { forms: { nota: state.forms.nota } }, null).furnizor, undefined)
  assert.equal('price' in purchaseProductExample(purchase), false)
  console.log('OK: date din achiziție, surse din același dosar, conflicte excluse, fără prețuri / furnizori inventați.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
