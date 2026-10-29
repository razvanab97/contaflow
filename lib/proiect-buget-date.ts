// Bugetul integral al planului de afaceri PROIECT AB Textile - Act aditional nr. 3 (01.07.2026), foaia
// „2.0 Buget_integral" din Anexa 4 (generat din Excel, 43 de linii). Valori cu TVA inclus; pentru fiecare
// linie: partea din subventie si din cofinantare (procentele din buget) si repartizarea estimativa pe lunile
// proiectului L1-L18 (L1 = octombrie 2025). Platile reale (registrul proiect_plati) se scad din aceste sume.

export interface LinieBugetIntegral {
  cod: string; denumire: string; categorie: string; um: string; cantitate: number; pretUnitar: number
  valoare: number; subventie: number; cofinantare: number
  luni: number[] // 18 valori, L1..L18
}

export const BUGET_VERSIUNE = 'AA3 (01.07.2026)'
export const BUGET_CATEGORII: string[] = [
  "1. Cheltuieli cu salariile personalului nou-angajat**",
  "3. Cheltuieli aferente diverselor achiziţii de servicii specializate, pentru care beneficiarul nu are expertiza necesară",
  "4. Cheltuieli cu achiziţia de active fixe corporale (altele decât terenuri şi imobile), obiecte de inventar, materii prime şi materiale, inclusiv materiale consumabile, alte cheltuieli pentru investiţii necesare funcţionării întreprinderilor",
  "5. Cheltuieli cu închirierea de sedii (inclusiv depozite), spaţii pentru desfăşurarea diverselor activităţi ale întreprinderii, echipamente, vehicule, diverse bunuri",
  "6. Cheltuieli de leasing fără achiziţie (leasing operaţional) aferente funcţionării întreprinderilor (rate de leasing operaţional plătite de întreprindere pentru: echipamente, vehicule, diverse bunuri mobile şi imobile)"
]

const C = BUGET_CATEGORII
export const BUGET_INTEGRAL: LinieBugetIntegral[] = [
  { cod: "1.1.1", denumire: "Salariu net Manager intreprindere sociala, 4 ore/zi", categorie: C[0], um: "luna", cantitate: 10, pretUnitar: 2574, valoare: 25740, subventie: 23166, cofinantare: 2574, luni: [0, 0, 0, 1287, 2574, 2574, 2574, 2574, 2574, 2574, 2574, 2574, 1287, 2574, 0, 0, 0, 0] },
  { cod: "1.1.2", denumire: "Salariu net Asistent Manager, 8 ore/zi", categorie: C[0], um: "luna", cantitate: 10, pretUnitar: 2574, valoare: 25740, subventie: 23166, cofinantare: 2574, luni: [0, 0, 684, 2574, 2574, 2574, 2574, 2574, 2574, 2574, 2574, 1890, 2574, 0, 0, 0, 0, 0] },
  { cod: "1.1.3", denumire: "Salariu net lucrator necalificat, 8 ore/zi", categorie: C[0], um: "luna", cantitate: 10, pretUnitar: 2574, valoare: 25740, subventie: 23166, cofinantare: 2574, luni: [0, 0, 0, 1287, 2574, 2574, 2574, 2574, 2574, 2574, 2574, 2574, 1287, 2574, 0, 0, 0, 0] },
  { cod: "1.1.4", denumire: "Salariu net lucrator necalificat, 8 ore/zi", categorie: C[0], um: "luna", cantitate: 10, pretUnitar: 2574, valoare: 25740, subventie: 23166, cofinantare: 2574, luni: [0, 0, 0, 1287, 2574, 2574, 2574, 2574, 2574, 2574, 2574, 2574, 1287, 2574, 0, 0, 0, 0] },
  { cod: "1.3.1", denumire: "Contributii Manager intreprindere sociala, 4 ore/zi", categorie: C[0], um: "luna", cantitate: 10, pretUnitar: 1560, valoare: 15600, subventie: 14040, cofinantare: 1560, luni: [0, 0, 0, 780, 1560, 1560, 1560, 1560, 1560, 1560, 1560, 1560, 780, 1560, 0, 0, 0, 0] },
  { cod: "1.3.2", denumire: "Contributii Asistent Manager, 8 ore/zi", categorie: C[0], um: "luna", cantitate: 10, pretUnitar: 1560, valoare: 15600, subventie: 14040, cofinantare: 1560, luni: [0, 0, 350, 1560, 1560, 1560, 1560, 1560, 1560, 1560, 1560, 1210, 1560, 0, 0, 0, 0, 0] },
  { cod: "1.3.3", denumire: "Contributii lucrator necalificat, 8 ore/zi", categorie: C[0], um: "luna", cantitate: 10, pretUnitar: 1560, valoare: 15600, subventie: 14040, cofinantare: 1560, luni: [0, 0, 0, 780, 1560, 1560, 1560, 1560, 1560, 1560, 1560, 1560, 780, 1560, 0, 0, 0, 0] },
  { cod: "1.3.4", denumire: "Contributii lucrator necalificat, 8 ore/zi", categorie: C[0], um: "luna", cantitate: 10, pretUnitar: 1560, valoare: 15600, subventie: 14040, cofinantare: 1560, luni: [0, 0, 0, 780, 1560, 1560, 1560, 1560, 1560, 1560, 1560, 1560, 780, 1560, 0, 0, 0, 0] },
  { cod: "3.1", denumire: "Contabilitate", categorie: C[1], um: "serv", cantitate: 9, pretUnitar: 650, valoare: 5850, subventie: 5850, cofinantare: 0, luni: [0, 0, 650, 650, 650, 650, 650, 650, 650, 650, 650, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "3.2", denumire: "Site prezentare intreprindere", categorie: C[1], um: "buc", cantitate: 1, pretUnitar: 3300, valoare: 3300, subventie: 0, cofinantare: 3300, luni: [0, 0, 0, 0, 0, 3300, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "3.3", denumire: "Montare Aer Conditionat", categorie: C[1], um: "buc", cantitate: 1, pretUnitar: 1000, valoare: 1000, subventie: 0, cofinantare: 1000, luni: [0, 0, 0, 0, 0, 0, 1000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.1", denumire: "Masina de spalat", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 38522.77, valoare: 38522.77, subventie: 38522.77, cofinantare: 0, luni: [0, 0, 0, 0, 38522.77, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.2", denumire: "Uscator", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 17985.44, valoare: 17985.44, subventie: 17985.44, cofinantare: 0, luni: [0, 0, 0, 0, 17985.44, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.3", denumire: "Calandru", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 23270.72, valoare: 23270.72, subventie: 23270.72, cofinantare: 0, luni: [0, 0, 0, 0, 23270.72, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.4", denumire: "Masa de calcat", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 22783.09, valoare: 22783.09, subventie: 22783.09, cofinantare: 0, luni: [0, 0, 0, 0, 22783.09, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.5", denumire: "Masa de scos pete", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 11566.39, valoare: 11566.39, subventie: 11566.39, cofinantare: 0, luni: [0, 0, 0, 0, 11566.39, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.6", denumire: "Manechin", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 2280.29, valoare: 2280.29, subventie: 2280.29, cofinantare: 0, luni: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2280.29, 0, 0, 0] },
  { cod: "4.7", denumire: "Compresor", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 649.98, valoare: 649.98, subventie: 0, cofinantare: 649.98, luni: [0, 0, 0, 0, 0, 649.98, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.8", denumire: "Birou FrontDesk", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 399.99, valoare: 399.99, subventie: 0, cofinantare: 399.99, luni: [0, 0, 0, 0, 0, 399.99, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.9", denumire: "Scaun Birou", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 329, valoare: 329, subventie: 0, cofinantare: 329, luni: [0, 0, 0, 0, 0, 329, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.10", denumire: "Set 4 scaune zona asteptare", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 476, valoare: 476, subventie: 0, cofinantare: 476, luni: [0, 0, 0, 0, 0, 476, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.11", denumire: "Etajera documente + decoratiuni", categorie: C[2], um: "buc", cantitate: 2, pretUnitar: 185, valoare: 370, subventie: 0, cofinantare: 370, luni: [0, 0, 0, 0, 0, 370, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.12", denumire: "Suport depozitare haine", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 169, valoare: 169, subventie: 0, cofinantare: 169, luni: [0, 0, 0, 0, 0, 169, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.13", denumire: "Kit alarma", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 741.99, valoare: 741.99, subventie: 0, cofinantare: 741.99, luni: [0, 0, 0, 0, 0, 741.99, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.14", denumire: "Casa de marcat", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 525, valoare: 525, subventie: 0, cofinantare: 525, luni: [0, 0, 0, 0, 0, 525, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.15", denumire: "Imprimanta", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 971.91, valoare: 971.91, subventie: 0, cofinantare: 971.91, luni: [0, 0, 0, 0, 0, 971.91, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.16", denumire: "Laptop", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 4299.99, valoare: 4299.99, subventie: 0, cofinantare: 4299.99, luni: [0, 0, 0, 0, 0, 4299.99, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.17", denumire: "Masa de lucru", categorie: C[2], um: "buc", cantitate: 2, pretUnitar: 445, valoare: 890, subventie: 0, cofinantare: 890, luni: [0, 0, 0, 0, 0, 890, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.18", denumire: "Carucior transport", categorie: C[2], um: "buc", cantitate: 2, pretUnitar: 499, valoare: 998, subventie: 0, cofinantare: 998, luni: [0, 0, 0, 0, 0, 998, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.19", denumire: "Carucior rufe curate", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 759, valoare: 759, subventie: 0, cofinantare: 759, luni: [0, 0, 0, 0, 0, 759, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.20", denumire: "Umerase", categorie: C[2], um: "set", cantitate: 2, pretUnitar: 226, valoare: 452, subventie: 0, cofinantare: 452, luni: [0, 0, 0, 0, 0, 452, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.21", denumire: "Huse transparente haine", categorie: C[2], um: "set", cantitate: 2, pretUnitar: 77.9, valoare: 155.8, subventie: 0, cofinantare: 155.8, luni: [0, 0, 0, 0, 0, 155.8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.22", denumire: "Aer conditionat", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 1338.08, valoare: 1338.08, subventie: 0, cofinantare: 1338.08, luni: [0, 0, 0, 0, 0, 1338.08, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.23", denumire: "Set Detergenti profesionali", categorie: C[2], um: "set", cantitate: 1, pretUnitar: 2944.3, valoare: 2944.3, subventie: 0, cofinantare: 2944.3, luni: [0, 0, 0, 0, 0, 2944.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.24", denumire: "Pachet materiale necesare instalatie electrica", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 4887.96, valoare: 4887.96, subventie: 0, cofinantare: 4887.96, luni: [0, 0, 0, 0, 0, 4887.96, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.25", denumire: "Boiler", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 498, valoare: 498, subventie: 0, cofinantare: 498, luni: [0, 0, 0, 0, 0, 498, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.26", denumire: "Covor cauciuc", categorie: C[2], um: "ml", cantitate: 16, pretUnitar: 73.81, valoare: 1180.96, subventie: 0, cofinantare: 1180.96, luni: [0, 0, 0, 0, 0, 1180.96, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.27", denumire: "Pachet elemente decorative polistiren interior", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 388.89, valoare: 388.89, subventie: 0, cofinantare: 388.89, luni: [0, 0, 0, 0, 0, 388.89, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.28", denumire: "Vopsea lavabila", categorie: C[2], um: "l", cantitate: 15, pretUnitar: 17.6, valoare: 264, subventie: 0, cofinantare: 264, luni: [0, 0, 0, 0, 0, 264, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.29", denumire: "Aspirator cu spalare", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 566.65, valoare: 566.65, subventie: 0, cofinantare: 566.65, luni: [0, 0, 0, 0, 0, 566.65, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "4.30", denumire: "Aparat de curatat cu abur", categorie: C[2], um: "buc", cantitate: 1, pretUnitar: 1121.48, valoare: 1121.48, subventie: 0, cofinantare: 1121.48, luni: [0, 0, 0, 0, 0, 1121.48, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cod: "5.1", denumire: "Chirie", categorie: C[3], um: "luna", cantitate: 17, pretUnitar: 1000, valoare: 17000, subventie: 17000, cofinantare: 0, luni: [0, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000] },
  { cod: "6.1", denumire: "Autoturism", categorie: C[4], um: "luni", cantitate: 6, pretUnitar: 3260, valoare: 19560, subventie: 19560, cofinantare: 0, luni: [0, 0, 0, 0, 3260, 3260, 3260, 3260, 3260, 3260, 0, 0, 0, 0, 0, 0, 0, 0] },
]
