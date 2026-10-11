const assert = require('node:assert/strict')

async function main() {
  const { purchaseRecommendations, purchaseProductExample, prefillPurchaseForms, isCompletedPurchaseExample } = await import('../lib/achizitii-form-recommendations.ts')
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
  const original = { forms: { oferta: { fields: { achizitie: 'Editat de mine', numar: '12' }, lines: [{ supplier: '', product: '', specs: '', unit: 'buc', qty: '2', price: '', currency: 'RON', rate: '1', source: '', date: '' }] } } }
  const filled = prefillPurchaseForms(original, purchase)
  assert.equal(filled.forms.oferta.fields.achizitie, 'Editat de mine')
  assert.equal(filled.forms.oferta.fields.numar, '12')
  assert.equal(filled.forms.oferta.fields.tip, 'Produse')
  assert.equal(filled.forms.oferta.lines[0].product, purchase.denumire)
  assert.equal(filled.forms.oferta.lines[0].qty, '2')
  assert.equal(original.forms.oferta.lines[0].product, '')
  assert.deepEqual(prefillPurchaseForms(filled, purchase), filled)
  assert.equal(isCompletedPurchaseExample('Cerere de ofertă semnată.pdf', 'oferta'), true)
  assert.equal(isCompletedPurchaseExample('Oferta furnizor.pdf', 'oferta'), false)
  assert.equal(isCompletedPurchaseExample('Sablon Anexa 2.pdf', 'oferta'), false)
  assert.equal(isCompletedPurchaseExample('Anexa 1 - Nota determinare valoare.pdf', 'nota'), true)
  assert.equal(isCompletedPurchaseExample('PV recepție.pdf', 'receptie'), true)
  console.log('OK: date din achiziție, surse din același dosar, conflicte excluse, fără prețuri / furnizori inventați.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
