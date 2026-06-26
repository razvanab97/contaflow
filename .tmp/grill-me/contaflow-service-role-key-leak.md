# Grill: Remediere leak cheie service_role Supabase (ContaFlow)
Started: 2026-06-26

## Summary of the Idea
Repo-ul public `razvanab97/contaflow` are cheia `SUPABASE_SERVICE_ROLE_KEY` (acces admin, bypass RLS) hardcodată ca fallback (`process.env.X || '<jwt>'`) în 12 fișiere sursă, commisă în istoricul git și împinsă pe `origin/main`. Planul de remediere propus: (1) rotirea cheii în Supabase, (2) eliminarea fallback-urilor hardcodate din cod, (3) decizii legate de istoricul git și vizibilitatea repo-ului, (4) reluarea verificării funcționale cu cheia nouă.

## Open Threads
- Cine rotește cheia și când, în ce ordine față de schimbările de cod
- Ce înlocuiește fallback-ul hardcodat (eroare explicită vs. altceva)
- Istoricul git: rescriere (BFG/filter-repo + force-push) vs las-o (cheia rotată devine inertă)
- Vizibilitate repo: rămâne public sau trece privat
- Prevenție viitoare: hook pre-commit / scanner de secrete (gitleaks etc.)
- Verificare alte secrete hardcodate dincolo de pattern-ul exact găsit
- Cum se actualizează `.env.local` local cu cheia nouă și se reia verificarea funcțională

## Decisions Log

### Q1: În ce ordine facem remedierea: rotești cheia acum, sau pregătesc eu codul primul?
- **Recommended:** Rotești cheia acum, imediat — e deja expusă public, fiecare minut contează.
- **User's answer / preference:** Pregătesc codul primul (eliminare fallback-uri), abia apoi se rotește cheia.
- **Rationale / constraints:** Userul preferă să vadă/aprobe diff-ul de cod înainte de a rota cheia.
- **Knock-on effects:** Cheia veche rămâne activă (și expusă) pe durata în care pregătesc codul — trebuie să fim rapizi. Deschide întrebarea despre ce înlocuiește fallback-ul hardcodat.

### Q2: Ce face codul când `SUPABASE_SERVICE_ROLE_KEY` lipsește din mediu, în loc de fallback-ul hardcodat?
- **Recommended:** Eroare explicită la pornire (`throw` dacă variabila lipsește).
- **User's answer / preference:** String gol ca fallback (`process.env.X || ''`) — nu crapă la import, dar cererile pică natural cu 401/403 dacă cheia lipsește.
- **Rationale / constraints:** Preferă să nu introducă un nou mod de crash/throw în 12 fișiere; comportamentul de eroare 401/403 de la Supabase e suficient ca semnal.
- **Knock-on effects:** Niciun fișier nu va mai conține cheia JWT reală — doar `process.env.SUPABASE_SERVICE_ROLE_KEY || ''`.

### Q3: Ce facem cu istoricul git care conține cheia veche?
- **Recommended:** Las istoricul așa cum e — cheia rotată devine inertă, rescrierea pe `main` public e riscantă pentru beneficiu marginal.
- **User's answer / preference:** Las istoricul așa cum e.
- **Rationale / constraints:** Rotirea cheii (Q1/Q4) face exploatarea cheii vechi din istoric irelevantă; evită force-push distructiv pe repo public.
- **Knock-on effects:** Nu se rulează BFG/filter-repo, nu e nevoie de force-push. Rotirea cheii devine pasul critic obligatoriu — nu poate fi omisă sau întârziată mult.

### Q4: Repo-ul rămâne public sau trece privat?
- **Recommended:** Îl fac privat — nu e nevoie să fie public, elimină riscul ca un viitor secret hardcodat să fie expus instant.
- **User's answer / preference:** Rămâne public.
- **Rationale / constraints:** Nespecificat explicit de user (posibil portofoliu/motiv personal) — nu a dat detalii.
- **Knock-on effects:** Crește mult importanța prevenției (Q5) — fiindcă rămâne public, orice viitor secret hardcodat e expus instant din nou. Rotirea cheii (Q1) e și mai critică/urgentă.

### Q5: Adăugăm un mecanism automat (pre-commit hook + gitleaks) care blochează viitoare commit-uri cu secrete?
- **Recommended:** Da — gitleaks + pre-commit hook, mai ales că repo-ul rămâne public.
- **User's answer / preference:** Nu acum, doar fix-ul curent (eliminarea fallback-urilor din cele 12 fișiere).
- **Rationale / constraints:** Vrea să limiteze scope-ul la remedierea imediată; poate adăuga prevenția separat mai târziu.
- **Knock-on effects:** Niciun hook nou nu se adaugă în acest task. Riscul de recidivă (alt secret hardcodat) rămâne — depinde integral de disciplina manuală pe viitor.

### Q6: Extindem căutarea la alte secrete hardcodate (nu doar cheia JWT identificată) înainte de fix?
- **Recommended:** Da — scanare mai largă (eyJ..., sk-..., api_key=, Bearer hardcodat) cât suntem în mod remediere.
- **User's answer / preference:** Da, scanare mai largă acum.
- **Rationale / constraints:** Vrea siguranța că nu mai rămâne niciun alt secret expus nedescoperit.
- **Knock-on effects:** Adaugă un pas de scanare (grep cu pattern-uri generice de secrete) înainte de a finaliza lista de fișiere de editat. Poate extinde scope-ul fix-ului dacă se găsesc alte secrete.
- **Rezultat scanare:** Nu există alte secrete distincte (niciun `sk-...`, alt JWT, password). Dar: (a) 3 din cele 12 fișiere (`app/api/checklist/merge/route.ts`, `app/api/checklist/upload/route.ts`, `app/[firma]/[luna]/extras/page.tsx`) au cheia hardcodată **fără fallback la `process.env`** deloc — `const KEY = '<jwt>'` direct; (b) `lib/supabase/server.ts` mai are hardcodată și cheia **anon** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), risc redus (anon key e public-safe, respectă RLS) dar tot practică proastă. Total rămân 12 fișiere unice de corectat pentru service_role key.

### Q7: Eliminăm și fallback-ul hardcodat al cheii anon din `lib/supabase/server.ts`?
- **Recommended:** Da — consistență, niciun secret hardcodat în sursă, chiar dacă riscul e mic.
- **User's answer / preference:** Nu, las anon key așa cum e (nehardcodat... rămâne hardcodată, nu se schimbă).
- **Rationale / constraints:** Anon key nu e risc real de securitate (publică prin design, respectă RLS) — scope-ul fix-ului se limitează strict la service_role.
- **Knock-on effects:** Scope final de editare: doar liniile cu cheia `service_role` din cele 12 fișiere. Linia cu anon key din `lib/supabase/server.ts:9` rămâne neschimbată.

### Q8: Cum actualizăm `.env.local` cu cheia nouă după rotire, pentru a relua verificarea funcțională?
- **Recommended:** Userul editează manual `.env.local` (cheia nu trece prin chat), apoi confirmă "gata".
- **User's answer / preference:** Userul trimite cheia nouă în chat, Claude o scrie în `.env.local`.
- **Rationale / constraints:** Mai rapid; `.env.local` e fișier local, nu se commite — riscul e doar tranzitarea cheii prin transcriptul conversației.
- **Knock-on effects:** După ce userul rotește cheia și o trimite în chat, Claude scrie direct în `.env.local`, repornește `npm run dev` și reia verificarea funcțională completă (chitanțe, extras, tranzacții, furnizori, emag, checklist, export PDF/ZIP, raport lunar, proprietar/analyze) de unde s-a oprit.

### Amendament Q7: cheia de la lib/supabase/server.ts:9 nu e anon, e service_role mislabeled
- **Descoperire în timpul implementării:** JWT-ul hardcodat ca fallback pentru `NEXT_PUBLIC_SUPABASE_ANON_KEY` are payload `{"role":"service_role",...}` — e identic cu cheia de admin, doar etichetat greșit. Premisa deciziei Q7 ("risc redus, e anon key") era greșită.
- **User's answer / preference (confirmată după corecție):** Nu, las-o așa cum e — păstrează decizia originală chiar și după corecție.
- **Rationale / constraints:** Nespecificat de user.
- **Knock-on effects:** Rămâne un risc rezidual cunoscut și acceptat explicit: cheia service_role e încă vizibilă în sursă (linia 9), inertă doar cât timp `NEXT_PUBLIC_SUPABASE_ANON_KEY` e setată în mediu.

## Resolved Plan

1. **Cod (acum, înainte de rotirea cheii):** Claude elimină valoarea JWT hardcodată din toate cele 12 fișiere care conțin fallback-ul `SUPABASE_SERVICE_ROLE_KEY`, înlocuind cu `process.env.SUPABASE_SERVICE_ROLE_KEY || ''` (păstrând pattern-ul de fallback gol, nu throw). Cheia anon hardcodată din `lib/supabase/server.ts` rămâne neschimbată (risc acceptat, scop limitat).
2. **Verificare cod:** Claude verifică de minim 2 ori (sintaxă + `tsc --noEmit` + grep că nu mai există JWT-ul vechi în sursă) înainte de orice push, conform regulii globale a userului.
3. **Commit + push:** Claude creează commit-ul cu fix-ul, împinge pe `origin/main` (repo rămâne public, fără rescriere de istoric — cheia veche redundantă în istoric e acceptată ca risc rezidual, mitigat de rotire).
4. **Rotire cheie (userul):** Userul rotește `service_role` key în Supabase Dashboard → Settings → API, după ce fix-ul de cod e pe `main`.
5. **Update `.env.local`:** Userul trimite cheia nouă în chat; Claude o scrie în `.env.local` local (fișier ignorat de git, neafectat de push).
6. **Reluare verificare funcțională:** Claude repornește `npm run dev` cu cheia nouă și continuă verificarea fluxurilor rămase (chitanțe, extras bancar, tranzacții, furnizori, emag, checklist, export PDF/ZIP, raport lunar, proprietar/analyze).
7. **Neadresat în acest fix, acceptat explicit de user:** repo rămâne public; nu se adaugă scanner automat de secrete (gitleaks/pre-commit); istoricul git nu se rescrie.
