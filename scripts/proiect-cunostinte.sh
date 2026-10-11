#!/bin/bash
# Regenereaza baza de cunostinte "Intreaba proiectul" (lib/proiect-cunostinte-date.ts) din documentele
# oficiale AA3 + documentele locale de proiect (Firme/AB TEXTILE SRL). Rulat pe Mac-ul cu dosarele locale.
# La un act aditional nou: schimba caile AA3 de mai jos si rerulezi.
set -e
cd "$(dirname "$0")/.."
R="$HOME/Desktop/Firme/AB TEXTILE SRL"
D="$HOME/Downloads"
M="$(mktemp -d)"
unzip -q -o "$R/autorizatii/Mediu/Autorizatie AB TEXTILE.zip" -d "$M" -x "__MACOSX/*"
python3 scripts/proiect-cunostinte.py --versiune AA3 \
 --plan "$D/Anexa-3_Planul-de-afaceri_AA3.pdf" --buget "$D/Anexa-4_Bugetul-planului-de-afaceri_AA3.xlsx" \
 --act "$D/Anexa 2_Act aditional_AA3.pdf" --memoriu "$D/Anexa 1_Memoriu jusificativ AA3.pdf" \
 --extra "Constatări din documentele scanate (dosar local)|scripts/proiect-cunostinte-note.txt" \
 --extra "Raport lunar de implementare (Anexa 5) — decembrie 2025|$R/10. Rapoarte/editabil/12.25 Anexa 5 - Raport de implementare al planului de afaceri.docx" \
 --extra "Raport lunar de implementare (Anexa 5) — ianuarie 2026|$R/10. Rapoarte/editabil/01.26 Anexa 5 - Raport de implementare al planului de afaceri - copie.docx" \
 --extra "Raport lunar de implementare (Anexa 5) — februarie 2026|$R/10. Rapoarte/editabil/02.26 Anexa 5 - Raport de implementare al planului de afaceri .docx" \
 --extra "Raport lunar de implementare — martie 2026|$R/10. Rapoarte/03.26 Raport implementare.pdf" \
 --extra "Raport lunar de implementare — aprilie 2026|$R/10. Rapoarte/04 26 Raport implementare.pdf" \
 --extra "Raport lunar de implementare — mai 2026|$R/10. Rapoarte/05 26 - Raport.pdf" \
 --extra "Raport lunar de implementare — iunie 2026|$R/10. Rapoarte/06 26 - Raport.pdf" \
 --extra "Anexa 7 — Cerere de acordare a ajutorului de minimis (tranșă)|$R/Anexa 7 - Cerere acordare ajutor de minimis.pdf" \
 --extra "Anexa 7 — Cerere de acordare a ajutorului de minimis — tranșa 3|$R/Anexa 7 - Cerere acordare ajutor de minimis - transa 3 .pdf" \
 --extra "AJOFM — Anexa 6, cerere pentru statutul de întreprindere socială de inserție|$R/12. AJOFM/Marca sociala/Anexa nr. 6 CERERE ISI.pdf" \
 --extra "AJOFM — raport anual, Anexa 5A|$R/12. AJOFM/Raport anual/ssAnexa 5A - AB Textile-2.pdf" \
 --extra "AJOFM — raport anual, Anexa 5B|$R/12. AJOFM/Raport anual/Anexa 5B.pdf" \
 --extra "AJOFM — adresă de înaintare a raportului anual|$R/12. AJOFM/Raport anual/inaintare.pdf" \
 --extra "Contract echipamente spălătorie SDS Group (nr. 01.1)|$R/9. utilaje/6. Contract 01.1 - AB Textile SRL Iasi - echipamente spalatorie - LEI.pdf" \
 --extra "Contract de comodat — sediu social|$R/0. infiintare/7. Contract de comodat_sediu_AB_Textile.pdf" \
 --extra "Contract de închiriere punct de lucru (dosar mediu)|$M/4. Contract_inchiriere_punct_de_lucru[2].pdf" \
 --extra "APM — Fișa de prezentare și declarația (autorizație de mediu)|$M/2. FIȘA DE PREZENTARE ȘI DECLARAȚIE 1798 - semnat.pdf"
rm -rf "$M"
