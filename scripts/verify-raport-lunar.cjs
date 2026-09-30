const assert = require('node:assert/strict')
const { accountingMonth, calculateMonthlyFlow, collectPaged, mergeTransactionsById } = require('../lib/raport-lunar.ts')

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
assert.equal(result.transactions.length, result.included)
assert.equal(result.analiza.RON.numarIncasari, 2)
assert.equal(result.analiza.RON.numarPlati, 1)
assert.deepEqual(result.analiza.RON.topCheltuieli, [{categorie:'furnizor',total:0.05,numar:1,procent:100}])

const analysis = calculateMonthlyFlow([
  {...transaction('2026-08-01', 'credit', 200), id:'in', descriere_curatata:'Client A'},
  {...transaction('2026-08-02', 'credit', 50, 'RON', 'transfer'), id:'move-in'},
  {...transaction('2026-08-03', 'debit', 100, 'RON', 'furnizor'), id:'supplier', descriere_curatata:'Furnizor B'},
  {...transaction('2026-08-04', 'debit', 25, 'RON', 'altele'), id:'other'},
  {...transaction('2026-08-05', 'debit', 75, 'RON', 'transfer'), id:'move-out'},
  {...transaction('2026-07-31', 'debit', 9999, 'RON', 'taxa'), id:'old'},
], '2026-08')
assert.equal(analysis.flux.RON.incasari.total, 250)
assert.equal(analysis.flux.RON.cheltuieli.total, 200)
assert.equal(analysis.analiza.RON.platiAnalizate, 125)
assert.equal(analysis.analiza.RON.fluxFaraMiscariInterne, 75)
assert.deepEqual(analysis.analiza.RON.topCheltuieli, [
  {categorie:'furnizor',total:100,numar:1,procent:80},
  {categorie:'altele',total:25,numar:1,procent:20},
])
assert.deepEqual(analysis.analiza.RON.neclasificate, {total:25,numar:1,procent:20})
assert.deepEqual(analysis.transactions.map(row=>row.id), ['move-out','other','supplier','move-in','in'])
assert.equal(analysis.transactions.find(row=>row.id==='supplier').descriere, 'Furnizor B')
const fx = calculateMonthlyFlow([
  {...transaction('2026-08-10','credit',120,'RON','altele'),id:'fx-in',descriere_curatata:'Schimb valutar BT GO'},
  {...transaction('2026-08-10','debit',100,'RON','altele'),id:'fx-out',descriere:'Schimb valutar BT GO'},
  {...transaction('2026-08-11','debit',50,'RON','furnizor'),id:'expense'},
], '2026-08')
assert.equal(fx.flux.RON.incasari.total,120)
assert.equal(fx.flux.RON.cheltuieli.total,150)
assert.equal(fx.analiza.RON.schimbValutarIn,120)
assert.equal(fx.analiza.RON.schimbValutarOut,100)
assert.equal(fx.analiza.RON.platiAnalizate,50)
assert.equal(fx.analiza.RON.fluxFaraMiscariInterne,-50)
assert.deepEqual(fx.analiza.RON.topCheltuieli,[{categorie:'furnizor',total:50,numar:1,procent:100}])
assert.equal(fx.transactions.find(row=>row.id==='fx-out').categorie,'schimb_valutar')
const fromCurrent = {...transaction('2026-08-05','debit',75,'RON','transfer'),id:'same'}
const fromOther = {...transaction('2026-08-06','credit',12,'RON','client'),id:'other-month-extras'}
const merged = mergeTransactionsById([fromCurrent],[fromCurrent,fromOther])
assert.equal(merged.length,2)
assert.equal(calculateMonthlyFlow(merged,'2026-08').included,2)

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
