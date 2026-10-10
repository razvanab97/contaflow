const assert = require('node:assert/strict')

;(async () => {
  const { generateFromTemplate } = await import('../lib/docxRaportTemplate.ts')
  const { parseReportSections } = await import('../lib/documentWorkspace/reportSections.ts')
  const p = text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`
  const template = `<w:document><w:body>${p('Perioada de raportare: %%PERIOADA%%')}<w:tbl><w:tr><w:tc>${p('%%AUTORIZATII%%')}${p('%%OBIECTIVE%%')}${p('4. In perioada de raportare')}${p('%%ACTIVITATI%%')}${p('Beneficiar: %%CUSTOM_c1%%')}</w:tc></w:tr></w:tbl>${p('Reprezentant legal')}<w:sectPr/></w:body></w:document>`
  const values = { perioada: '01.09.2026 – 30.09.2026', autorizatii: ['Autorizație A', 'Autorizație B'], obiective: [], activitati: ['Testare'], custom: { c1: 'AB & Co' }, sections: [{ id: 'one', title: '5. Observații <noi>', content: 'Prima linie\nA doua & linie' }, { id: 'two', title: '6. Plan', content: '' }] }
  const result = generateFromTemplate(template, values)
  assert.ok(!result.includes('%%'))
  assert.ok(result.includes('AB &amp; Co'))
  assert.ok(result.includes('5. Observații &lt;noi&gt;'))
  assert.ok(result.includes('A doua &amp; linie'))
  assert.equal((result.match(/<w:tr>/g) || []).length, 3)
  assert.ok(result.indexOf('6. Plan') < result.indexOf('</w:tbl>'))
  assert.ok(result.indexOf('6. Plan') < result.indexOf('Reprezentant legal'))
  const noTable = template.replace('<w:tbl><w:tr><w:tc>', '').replace('</w:tc></w:tr></w:tbl>', '')
  assert.ok(generateFromTemplate(noTable, values).indexOf('6. Plan') < generateFromTemplate(noTable, values).indexOf('Reprezentant legal'))
  assert.deepEqual(parseReportSections(JSON.stringify(values.sections)), values.sections)
  assert.throws(() => parseReportSections([{ id: 'x', title: 'a', content: '' }, { id: 'x', title: 'b', content: '' }]))
  assert.throws(() => parseReportSections([{ id: 'x', title: 'a', content: 123 }]))
  assert.throws(() => parseReportSections(Array.from({ length: 31 }, (_, i) => ({ id: String(i), title: '', content: '' }))))
  console.log('Raport: secțiuni în Word, ordine înainte de semnătură, caractere speciale, liste goale și validare OK.')
})().catch(error => { console.error(error); process.exitCode = 1 })
