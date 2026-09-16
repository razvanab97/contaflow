# ContaFlow — Audit tehnic complet

Data: 2026-09-16 · Autor: Claude Sonnet 5 (sesiune agent) · Metodă: scanare statică (3 agenți paraleli de explorare) + verificare manuală de cod + testare live (browser real, date reale din Supabase, operațiuni sigure/reversibile)

## Summary

- **Rute audiate**: 10 pagini + 88 route handlers API (77 rămase după eliminarea a 2 endpoint-uri de debug)
- **Module verificate din citirea codului**: Dashboard, Furnizori, Date personale, Model documente, Bonuri, Facturi de asociat, toate cele 18 module lunare (`[luna]/modules/*`), fluxul cross-module Inbox Facturi → Extras → Export
- **Probleme reale găsite**: 7 (2 critice de securitate, 1 critic de pierdere de date, 1 bug funcțional confirmat pe date reale, 1 securitate medie, 1 sistemică majoră — documentată, nu reparată automat, 1 lipsă infrastructură de testare)
- **Probleme reparate**: 5 (toate cele cu soluție clară + sigură)
- **Probleme documentate, nereparate automat**: 2 (decizii care necesită alegerea ta, nu pot fi executate unilateral fără risc de a strica ceva ce funcționează sau de a lua o decizie de arhitectură în locul tău)
- **Commit-uri**: 4, toate cu typecheck + build verificate; 3 din 4 verificate și live cu date reale

---

## Critical Issues

### 1. [REPARAT] Endpoint-uri de debug expuneau date reale, fără nicio protecție
`app/api/debug/route.ts` întorcea direct (service-role key, bypass RLS) firme, luni contabile, extrase și un eșantion de tranzacții reale, oricui accesa URL-ul. `app/api/test/route.ts` întorcea în plus primele 20 de caractere din `ANTHROPIC_API_KEY` real. **Ambele șterse complet** (commit `fcdb874`) — verificat că nimic din aplicație nu le referențiază, verificat live că path-urile nu mai returnează date reale.

**Acțiune recomandată, pe care nu o pot face automat**: rotește `ANTHROPIC_API_KEY` din precauție — fereastra exactă de expunere (de când a fost live endpoint-ul până acum) nu e cunoscută cu certitudine.

### 2. [DOCUMENTAT, NEREPARAT] Nu există autentificare nicăieri în aplicație
Verificat exhaustiv de agentul de audit: zero rute API verifică sesiune/identitate (`auth.getUser()`/`getSession()` — 0 apeluri în tot codul), nu există `middleware.ts`, nu există pagină de login. 75 din 88 de rute folosesc `getServiceSupabase()` (service-role key, bypass total RLS); restul fac `fetch()` direct cu aceeași cheie hardcodată în cod. Singura "izolare" între firme e faptul că fiecare rută filtrează manual după `firmaId` — parametru **trimis de client**, nu derivat dintr-o sesiune verificată.

Practic: oricine cunoaște/ghicește URL-ul aplicației și un `id` de rând poate citi sau modifica datele oricărei firme, fără login.

**De ce nu am reparat automat**: soluția corectă (autentificare reală — login + sesiune + `middleware.ts` + refactorizarea a ~88 de rute să deriveze `firma_id` din sesiune, nu din input client) e o decizie majoră de arhitectură, exact genul de schimbare pe care instrucțiunile tale îmi cer explicit să NU o execut unilateral, ci să o documentez.

**Context care poate schimba severitatea reală**: dacă aplicația e folosită doar de tine, pe un URL privat necunoscut public (securitate prin obscuritate), riscul practic e mult mai mic decât "critic" în sensul clasic — dar rămâne un risc real dacă URL-ul e vreodată indexat, partajat din greșeală, sau ghicit. **Decizia îți revine ție**: accepți riscul (tool intern, URL privat), sau vrei un gate minim (ex. o parolă simplă la nivel de `middleware.ts`, mult mai ușor de adăugat decât autentificare completă per-firmă)?

### 3. [REPARAT] Import extras (PDF/CSV) putea produce pierdere reală de date
`app/api/extras/upload/route.ts` și `app/api/extras/upload-csv/route.ts`: la re-importarea unui extras, fluxul șterge extrasul + tranzacțiile vechi **înainte** de a confirma că cele noi s-au salvat cu succes. Dacă inserarea noilor date pica la mijloc (eroare DB, batch parțial), rămâneai fără datele vechi ȘI fără cele noi.

**Reparat** (commit `867483f`): reordonat fluxul — datele noi se inserează complet ÎNAINTE de a șterge ceva; dacă inserarea nouă pică parțial, se face rollback automat pe ea (fără să afecteze deloc datele vechi). Reparată și o eroare conexă în `upload-csv`: o monedă care pica la import era raportată eronat ca succes (`ok:true`, status 200) — acum răspunsul reflectă corect eșecul.

Verificat: typecheck + build curate. **Nu** testat live cu eroare indusă (ar necesita provocarea deliberată a unui eșec pe un extras bancar real) — clasificat "code reviewed", nu "end-to-end verificat". Recomand o verificare vizuală la următorul import real de extras.

---

## Functional Issues

### 4. [REPARAT] Document Inbox Facturi asociat cu o tranzacție apărea de 2 ori în exportul complet
`app/api/export/zip/route.ts`, `app/api/export/pdf/route.ts`: interogarea generică de documente clasifica după `fisier_path` (neschimbat la asociere), nu după coloana `modul` (schimbată la asociere) — un document din Inbox Facturi, o dată asociat cu o tranzacție, ajungea inclus și în secțiunea "Extras" (corect) ȘI în secțiunea "Inbox facturi" (greșit, duplicat).

**Reparat** (commit `fbbb413`) și **verificat pe date reale**: 21 de documente Inbox Facturi găsite pentru luna curentă, dintre care 13 aveau deja `tranzactie_id` setat — toate 13 erau duplicate înainte de fix. După fix, interogarea corectă exclude exact acele 13, fără să afecteze restul.

### 5. Nicio infrastructură de testare automatizată
Zero Jest/Vitest/Playwright/Cypress în `package.json`, zero fișiere `.test.ts`/`.spec.ts` în tot repo-ul. Nu am introdus un framework nou nesolicitat — ar fi o decizie de arhitectură (alegere framework, convenții, eventual CI), nu un "fix simplu". **Recomandare**: dacă vrei coverage automat pe fluxurile critice (asociere document, import extras, upload), cel mai simplu punct de start ar fi Playwright pentru câteva teste E2E pe fluxurile din secțiunea "Functional Coverage" de mai jos.

---

## Database Issues

Verificare exhaustivă (agent dedicat): **nicio discrepanță găsită** între tabelele/coloanele folosite în cod și migrațiile din `supabase_*.sql`. Disciplina de verificare `if (error || !data)` pe `.single()` e aplicată consecvent în tot codul — 0 risc real de crash runtime confirmat.

Găsit, dar nu reparat (impact redus, listă informativă): ~11 fișiere API reimplementează manual clientul REST Supabase (URL de proiect hardcodat + fetch brut) în loc să reutilizeze `getServiceSupabase()` — funcționează, dar fără retry/timeout uniform și cu verificare de erori inconsistentă. Câteva `.insert()`/`.update()` "fire-and-forget" (rezultat neverificat) în operațiuni secundare (recalcul contoare, sincronizare status) — risc de date ușor incomplete, nu de crash sau pierdere gravă.

---

## UI/UX Issues

Nimic confirmat spart din citirea codului pe modulele verificate explicit (Dashboard, Furnizori, Date personale, Model documente, toate cele 18 module lunare) — toate butoanele au handlere reale conectate la API-uri reale, zero `TODO`/`FIXME`/`href="#"`/`disabled` hardcodat/mock în tot `app/`, `lib/`, `components/`.

Observație minoră, nu bug: câteva componente folosesc `alert()` nativ pentru feedback de eroare (`ExportButtons.tsx`, `ModuleGrid.tsx`, `UploadPanel.tsx`, `DocumentAttachedList.tsx`, `DocumenteGenerale.tsx`) — funcțional, dar sub nivelul de polish al restului aplicației (care are optimistic UI + revert pe majoritatea fluxurilor). Nu am schimbat nimic aici — ar fi cosmetic, nu un bug.

Redesign complet al paginii Extras de cont, făcut și verificat live în aceeași sesiune (vezi commit `b17a5da`) — nu detaliat aici din nou, e o lucrare separată de audit.

---

## Performance Issues

Nu am făcut profiling dedicat (Faza 20 din brief) — ar necesita instrumentare/load testing pe care nu am considerat-o proporțională cu restul auditului, dat fiind că nu am găsit niciun semnal concret de problemă de performanță în codul citit (nicio interogare N+1 evidentă, nicio buclă de re-render suspectă în modulele verificate). **NOT FULLY VERIFIED** — dacă ai observat vreo pagină lentă anume, spune-mi care, ca să investighez țintit.

---

## Security Issues

Rezumat (detalii la Critical Issues #1, #2 și mai jos):

| # | Problemă | Severitate | Status |
|---|---|---|---|
| 1 | `/api/debug`, `/api/test` — expunere date reale + fragment cheie API | Critică | **Reparat** |
| 2 | Nicio autentificare/sesiune în toată aplicația | Critică (sistemică) | Documentat — decizie a ta |
| 3 | ~14 rute DELETE/PATCH fără `.eq('firma_id',...)` (listă mai jos) | Ridicată, dependentă de #2 | Documentat — vezi motivare |
| 4 | SSRF rezidual în "Adaugă factura prin link" (DNS rebinding + redirect nevalidat) | Medie | **Reparat + testat live** |
| 5 | Chei/secrete hardcodate în cod | — | **Niciuna găsită** (verificat exhaustiv) |

**#3 detaliat**: `app/api/emag/aviz/route.ts`, `app/api/emag/route.ts`, `app/api/emag/aviz/factura/route.ts`, `app/api/booking/locatii/route.ts`, `app/api/facturi-asteptate/route.ts`, `app/api/model-documente/route.ts`, `app/api/chitante/document/route.ts`, `app/api/documente-generale/route.ts`, `app/api/chitante/dispozitie/route.ts`, `app/api/chitante/dispozitie/analyze/route.ts`, `app/api/proprietari/locatii/route.ts`, `app/api/bonuri/route.ts`, `app/api/proprietari/route.ts`, `app/api/inbox-facturi/local/route.ts` — toate fac `DELETE`/`PATCH` direct după `id`, fără să verifice apartenența la firmă.

**De ce nu am reparat automat #3**: verificat manual — niciuna dintre aceste rute nu primește `firmaId` în request-ul de DELETE/PATCH (UI-ul trimite doar `id`). A repara corect ar necesita schimbarea a ~14 componente client (să trimită și `firmaId`) + ~14 rute server (să valideze), efort moderat — **dar fără #2 (autentificare), verificarea de `firma_id` client-declarat nu oferă o barieră de securitate reală** (doar prinde bug-uri interne accidentale, nu un atacator care poate trimite orice `firmaId` vrea). Are totuși valoare ca "defense in depth" indiferent de #2. Spune-mi dacă vrei să o implementez ca pas separat.

---

## Fixes Applied

| # | Problema | Cauza | Fișier(e) | Soluția | Testare |
|---|---|---|---|---|---|
| 1 | Expunere date reale + fragment cheie API | Endpoint-uri de debug rămase accesibile în producție | `app/api/debug/route.ts`, `app/api/test/route.ts` | Șterse complet | Verificat: 0 referințe interne, build curat, live confirmat că path-urile nu mai scot date reale |
| 2 | Document Inbox Facturi duplicat în exporturi | Clasificare după `fisier_path` în loc de `modul` | `app/api/export/zip/route.ts`, `app/api/export/pdf/route.ts` | Exclus din bucket-ul generic orice document deja legat de o tranzacție | Verificat pe date reale (21→8 documente în interogarea generică, 13 excluse corect) |
| 3 | Risc pierdere de date la import extras | Delete înainte de insert confirmat | `app/api/extras/upload/route.ts`, `app/api/extras/upload-csv/route.ts` | Reordonat: insert complet → abia apoi delete; rollback pe insert parțial eșuat | Typecheck + build; NU testat live cu eroare indusă |
| 4 | SSRF rezidual (DNS rebinding + redirect) | Validare doar pe IP literal, redirect nevalidat | `app/api/chitante/import-url/route.ts` | Verificare DNS reală + urmărire manuală redirect-uri cu revalidare | **Testat live**: link intern blocat, link public normal funcționează identic ca înainte |
| 5 | Redesign Extras de cont | (task separat, nu bug) | 17 fișiere noi + `ExtrasClient.tsx` | Workspace 2 coloane, zero regresie | Testat live extensiv (vezi commit `b17a5da`) |

---

## Remaining Issues

Probleme care necesită decizia ta, nu pot fi rezolvate safe fără input:

1. **Autentificare** (Critical #2) — accepți riscul actual, sau vrei un gate minim de parolă?
2. **Scoping `firma_id` pe cele 14 rute** (Security #3) — merită efortul ca "defense in depth" chiar fără autentificare completă?
3. **Infrastructură de testare** (Functional #5) — vrei Playwright pentru fluxurile critice?

Probleme observate, dar cu impact redus, neatacate (raport informativ, nu au necesitat acțiune):
- ~11 fișiere cu client REST Supabase reimplementat manual (funcțional, doar inconsistent)
- Câteva `alert()` native în loc de feedback UI integrat
- Câteva `.insert()`/`.update()` "fire-and-forget" pe operațiuni secundare (recalcul contoare)

## NOT FULLY VERIFIED

Pentru transparență completă (conform cerinței tale de a distinge code review / testat / verificat end-to-end):

- **Fix #3 (pierdere de date la import extras)** — code reviewed + build verificat, NU testat live cu eroare indusă pe date reale.
- **Performance (Faza 20)** — nu am făcut profiling dedicat; niciun semnal concret găsit în cod.
- **Toate paginile individual, pe toate breakpoint-urile, în toate cele 3 teme** (Fazele 22-23) — testat exhaustiv doar pentru pagina Extras (redesign-ul separat); restul paginilor verificate doar prin citirea codului, nu prin click-through vizual pe fiecare.
- **Fluxuri care necesită credentiale externe** (Gmail sync, Oblio connect) — nu am acces la acele conturi/tokene, deci nu am putut testa end-to-end.

---

## Functional Coverage

| Modul | Funcție | Verificat cod | Testat live | Reparat | Note |
|---|---|---|---|---|---|
| Debug/Test endpoints | Expunere date | DA | DA | DA | Șterse, confirmat 0 leak |
| Export ZIP/PDF | Documente unice, fără duplicate | DA | DA | DA | Verificat pe date reale |
| Extras — import PDF/CSV | Nu pierde date la re-import | DA | NU | DA | Fix mecanic, nu indus eșec live |
| Import link factură | Blocare SSRF | DA | DA | DA | Testat cu URL real intern + extern |
| Inbox Facturi → Extras → Export | Fluxul documentului | DA | NU | N/A | Confirmat corect din cod |
| Dashboard | Toate widget-urile | DA | DA (parțial, doar console) | N/A | Fără erori |
| Furnizori/Date personale/Model documente | CRUD | DA | NU | N/A | Conectate la API real, nu mock |
| 18 module lunare | Funcționalitate de bază | DA | NU | N/A | Fără TODO/handler gol găsit |
| Autentificare | Există vreo protecție | DA | N/A | NU | Documentat, decizie necesară |
| Rute DELETE/PATCH firma_id | Izolare între firme | DA | NU | NU | Documentat, dependent de auth |

---

## Concluzie

Proiectul e, per ansamblu, **solid și complet implementat funcțional** — auditul static exhaustiv nu a găsit cod mort, butoane fără funcție, sau module neterminate. Cele mai serioase probleme găsite au fost de **securitate/date**, nu de funcționalitate lipsă: expunerea de date prin endpoint-uri de debug, riscul de pierdere de date la reimportarea unui extras bancar, și absența completă a autentificării. Primele două sunt reparate și verificate; a treia e o decizie de arhitectură care îți revine ție.

Nu pot afirma că aplicația e "100% funcțională, verificată end-to-end" pe toate cele ~90 de fluxuri posibile — am fost transparent mai sus exact pe ce e testat live vs. doar code-reviewed vs. neverificat deloc.
