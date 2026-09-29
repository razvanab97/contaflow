const assert = require('node:assert/strict')
const { accountingMonth, calculateMonthlyFlow, collectPaged } = require('../lib/raport-lunar.ts')

assert.equal(accountingMonth('2026-09-01'), '2026-08')
assert.equal(accountingMonth('2026-01-01'), '2025-12')
assert.throws(() => accountingMonth('2026-13-01'))

const transaction = (date, tip, suma, valuta = 'RON', categorie = 'client') => ({
  data_tranzactie: date, tip, suma, valuta, categorie,
})
const result = calculateMonthlyFlow([
  transaction('2026-08-01', 'credit', 0.1),
  transaction('2026-08-02', 'credit', 0.2),
  transaction('2026-08-03', 'debit', 0.05, 'RON', 'furnizor'),
  transaction('2026-08-05', 'credit', 150, 'HUF'),
  transaction('2026-07-31', 'credit', 494, 'EUR'),
  transaction('2026-07-31', 'debit', 57, 'EUR'),
  transaction(null, 'credit', 12),
  transaction('2026-08-04', 'necunoscut', 12),
  transaction('2026-08-04', 'debit', -12),
], '2026-08')
assert.equal(result.included, 4)
assert.equal(result.invalid, 3)
assert.deepEqual(result.flux.RON, {
  incasari: { total: 0.3, by_categorie: { client: 0.3 } },
  cheltuieli: { total: 0.05, by_categorie: { furnizor: 0.05 } },
  net: 0.25,
})
assert.equal(result.flux.HUF.net, 150)
assert.equal(result.flux.EUR, undefined)
assert.deepEqual(result.offPeriod, [{ luna: '2026-07', valuta: 'EUR', numar: 2, incasari: 494, plati: 57 }])

;(async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => i)
  const ranges = []
  const all = await collectPaged(async (start, end) => {
    ranges.push([start, end])
    return { data: rows.slice(start, end + 1), error: null }
  })
  assert.equal(all.length, 1001)
  assert.deepEqual(ranges, [[0, 999], [1000, 1999]])
  await assert.rejects(collectPaged(async () => ({ data: null, error: { message: 'test' } })), /test/)
  console.log('Raport lunar: teste de perioadă, bani, excepții și paginare OK')
})().catch(error => { console.error(error); process.exitCode = 1 })
