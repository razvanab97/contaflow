# Anexa 1 — Nota privind determinarea valorii estimate

`nota-standard.docx` is the user's approved reference: Anexa 1 from the AB TEXTILE
`23. aer conditionat` dossier (nr. 1 / 12.10.2026, signed 13.10.2026). Generated notes
must match it 1:1. Do not redesign this source or rewrite its fixed text.

Rebuild the embedded template after replacing the source:

```sh
python3 scripts/prepare-note-template.py templates/proiect/nota-standard.docx lib/proiect-templates.json
node scripts/verify-note-fidelity.cjs
```

The fidelity check regenerates the reference with its own data and requires every
package part (header, footer, logos, styles) byte-identical, the same page geometry,
table grid and header row, the same paragraph text and the same bold formatting.

Editable slots only: number, date, beneficiary, purchase name, type (plain text, e.g.
`Produse`), number of offers, the offer rows, justification and representative.
Reference format that the generator reproduces:

- operator cell: supplier, line break, full site in parentheses — `(https://www.altex.ro/)`
- specifications: one per line, each starting with `- `
- prices: net, with thousands separator and no `lei` — `2.644,55`
- justification: `NR n` and `<value> lei fara TVA ` in bold, value without thousands
  separator — `2644,55 lei fara TVA`
- signature block: `Nume, prenume: <reprezentant>` / `Reprezentant legal al <beneficiar>`

No advisory paragraphs may be appended to the generated document.
