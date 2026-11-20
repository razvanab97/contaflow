# AB NEXT — șabloane documente (zona 2.2 · Stagii de practică / voluntariat)

> Primele șabloane pentru generatorul de documente per beneficiar (v2). Activitatea se numește
> **AB NEXT** și aparține zonei **ZS-2.2** (stagii de practică / voluntariat formativ). Utilizatorul a
> furnizat documentele (format Word, randate ca PDF). Aici fixăm structura, datele fixe și câmpurile
> variabile de completat, ca generatorul să umple automat per voluntar. Vezi
> [[reference_ab_textile_misiune_sociala]] și docs/ab-textile-activitati-sociale.md (Partea 3).

## Date fixe ale organizației (se completează automat peste tot)
- AB TEXTILE S.R.L., întreprindere socială · CUI **52575850** · ORC **J2025073349009**
- Sediu: comuna **Erbiceni**, județul **Iași** · punct de lucru: **Spălătoria AB TEXTILE**
- Administrator / coordonator: **Abunei Elena**
- Atestat de întreprindere socială: **IS/A 0317 / 03.11.2025**
- Temei legal: Legea **78/2014** (voluntariat), Legea **211/2022**, Legea **219/2015** (economia socială)
- Țintă 2026 (din plan): **4 voluntari**

## Cele 3 documente

### A. DECIZIE DE ORGANIZARE  *(1 per program/an — doc colectiv)*
Câmpuri variabile:
- `nr_inregistrare` (Nr. ___), `data` (Data ___) — vezi registrul de numere
- `an` (2026), `nr_voluntari` (4), `coordonator` (Abunei Elena)
Restul textului e fix (Art. 1–6: voluntariat neremunerat, formativ, activități de spălătorie, instruire,
proces-verbal final).

### B. CONTRACT INDIVIDUAL DE VOLUNTARIAT (+ INFORMARE GDPR)  *(1 per VOLUNTAR — doc individual)*
Acesta e documentul care se multiplică per beneficiar. Câmpuri variabile (de completat per voluntar):
- `nr_inregistrare`, `data`
- **Voluntar**: `nume`, `data_nasterii`, `domiciliu`, `cnp`, `telefon_email`  ← extrase din buletin (AI)
- **Perioadă/coordonare**: `perioada_de`, `perioada_pana` (1–3 zile), `ore_program`, `locul`, `coordonator`
- **Instruire**: `data_instruire`, `instruit_de`, `confirmare_voluntar`
- Pagina GDPR: `nume_prenume`, `data`, `semnatura` (confirmare primire)
Restul (temei legal, Art. 3 activități, Art. 5 protecție/riscuri, informarea GDPR) e fix.

### C. RAPORT ANUAL DE ACTIVITATE  *(1 per an — se completează în timp real)*
Se umple pe măsură ce se înregistrează voluntari (contract + date). Câmpuri:
- `nr_inregistrare`, `data`
- referință `decizie_nr` / `decizie_data`
- **Tabel evidență** (câte un rând per voluntar înregistrat): `nr`, `voluntar`, `perioada`, `ore_efective`, `contract_nr`
- **Indicatori**: țintă 4 (fix); `nr_participanti`, `nr_stagii`, `total_ore` (calculate din voluntarii înregistrați)
- Concluzii/închidere: text fix + data semnării

## Legături cu modulul
- Fiecare **voluntar** = un beneficiar în registrul beneficiarilor (zona 2.2).
- **Contractul (B)** se generează per voluntar; **Decizia (A)** și **Raportul (C)** sunt la nivel de activitate/an.
- `nr_inregistrare` vine din **registrul unic de numere al proiectului** (ordonat, fără goluri, editabil).
- La „servicii gratuite / reduse" (ZS-2.3) va fi un set analog de șabloane, per familie beneficiară.

> ⚠️ Fișierele **.docx** reale (cu formatarea exactă) sunt necesare pentru generare fidelă — se încarcă
> în activitate. Aici e doar harta de câmpuri.
