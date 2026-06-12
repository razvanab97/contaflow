# Grill: ContaFlow — Arhitectura & Structura Aplicației
Started: 2026-06-12

## Summary of the Idea
Redefinim/clarificăm arhitectura și structura aplicației ContaFlow — o aplicație Next.js 16 pentru managementul contabilității lunare a mai multor firme. Scopul sesiunii este să ajungem la un plan clar pentru cum ar trebui să arate aplicația din punct de vedere structural: cum e organizat codul, cum se scalează, ce e de refactorizat sau rearchitectat.

## Open Threads
— toate firele rezolvate —

## Resolved Plan

### 1. Fișier config central — `lib/firma-config.ts`
Un singur fișier care definește tot ce e specific per firmă:
- Date juridice (CIF, Reg. com., Adresă) — folosite la dispoziții de plată și documente
- Module active (array de sluguri)
- Task-urile per modul (array de obiecte `{ key, label }`) — hardcodate, nu din DB

```
ab-homes-invest → [emag, trendyol] + comune
abxhomes        → [booking-facturi, booking-borderou, airbnb-facturi, airbnb-borderou, 5stardesk] + comune
ab-textile      → [] + comune
comune (toate)  → [extras, angajati, acte-contabile, dispozitie-plata, facturi-chitanta, facturi-restante]
```

### 2. DB — tabelă nouă `task_stari`
```sql
create table task_stari (
  id uuid primary key default gen_random_uuid(),
  luna_id uuid references luni_contabile not null,
  task_key text not null,  -- ex: "emag.factura_incarcata"
  completat boolean default false,
  updated_at timestamptz default now(),
  unique(luna_id, task_key)
);
```
Tabelele vechi `checklist_templates` și `checklist_items` rămân în DB dar nu mai sunt folosite activ.

### 3. Structura fișierelor
```
app/
  dashboard/page.tsx              ← Server Component; 3 firme cu % progres lunar
  [firma]/[luna]/
    page.tsx                      ← Server Component; hub cu carduri module
    [modul]/page.tsx              ← Server Component; pagina unui modul
    modules/
      ExtrasModule.tsx
      EmagModule.tsx
      TrendyolModule.tsx
      BookingModule.tsx           ← facturi + borderou (import din link)
      AirbnbModule.tsx            ← facturi + borderou (import din link)
      StarsdeskModule.tsx
      AngajatiModule.tsx
      ActeModule.tsx
      FacturiModule.tsx           ← facturi+chitanță + restante
      DispozitieModule.tsx
components/
  Sidebar.tsx                     ← redesenat: logo + firme cu % + sub-nav module
lib/
  firma-config.ts                 ← config central
  supabase/{client,server}.ts     ← neschimbat
```

### 4. Navigare și layout
- **3 niveluri:** Dashboard → Hub `[firma]/[luna]` → Modul `[firma]/[luna]/[modul]`
- **Sidebar** persistent la toate nivelurile: logo sus, firme cu progres %, sub-navigare module activă când ești în hub
- **Hub** (`[firma]/[luna]`): grid de carduri per modul — nume, progres task-uri (X/Y), stare vizuală (complet verde / în progres galben / neînceput gri)
- **Router.refresh()** după orice bifă → Server refetch → progres actualizat

### 5. Progres %
Calculat pe server: `(task-uri cu completat=true) / (total task-uri din config pentru firma respectivă) × 100`
- Vizibil în dashboard per firmă
- Vizibil în sidebar per firmă
- Vizibil în hub per modul și total lună

### 6. Design — Dark Elegant
- Fundal `#0A0A0A` / `#111` pentru card-uri
- Border subtil `#222` / `#333`
- Tipografie Geist (deja în proiect)
- Culoarea firmei ca accent (deja există per firmă în DB)
- Spații generoase, fără aglomerație
- Stilul Linear/Vercel — curat, premium, fără shadow greu

### 7. Ordinea de implementare
1. `lib/firma-config.ts` — config complet cu firme, module, task-uri, date juridice
2. SQL `task_stari` — rulat în Supabase Dashboard
3. API route simplă pentru toggle task (`/api/tasks/toggle`)
4. Redesign `components/Sidebar.tsx`
5. Redesign `app/dashboard/page.tsx`
6. Redesign hub `app/[firma]/[luna]/page.tsx` cu carduri module
7. Pagini module `app/[firma]/[luna]/[modul]/page.tsx` + fișierele din `modules/`
8. Migrare logică existentă (EmagMonthlyPanel, InvoiceDocumentsPanel, DispositionPanel etc.) în modulele noi

## Decisions Log

### Q1: Care este problema principală cu arhitectura actuală?
- **Recommended:** ChecklistClient.tsx (77 KB) face prea multe — e monolitic și greu de modificat
- **User's answer / preference:** Două probleme: (1) fiecare firmă are module specifice, dar sistemul a absorbit toate modulele pentru toate firmele — unele se aplică doar la unele firme; (2) dashboard-ul și designul sunt greu de citit și de lucrat
- **Rationale / constraints:** 3 firme existente cu seturi diferite de funcționalități. UI actual e confuz și neprieten.
- **Knock-on effects:** Trebuie să clarificăm care module aparțin cărei firme; redesign UI/dashboard e prioritate; structura de cod trebuie să reflecte per-firmă configurația

### Q2: Care sunt cele 3 firme și ce module are fiecare?
- **Recommended:** (derivat din cod) AB Homes → eMAG+Booking; AB Textile → Trendyol; ABXHomes → Airbnb+5StarDesk
- **User's answer / preference:**
  - **AB HOMES INVEST SRL** (J22/3035/2023, CIF RO48872594, Erbiceni IS): eMAG facturi, Trendyol
  - **ABXHOMES SRL** (J2025022705009, CIF 51540013, Iași IS): Booking facturi, Booking borderou, Airbnb facturi, Airbnb borderou, 5StarDesk facturi
  - **AB TEXTILE SRL** (J2025073349009, CIF 52575850, Erbiceni IS): fără module marketplace specifice
  - **Comune tuturor:** Extras de cont, Documente angajați, Acte contabile, Dispoziție de plată, Facturi + chitanță, Facturi restante
- **Rationale / constraints:** Datele de identificare juridică (Reg. com., CIF, Adresă) salvate ca template în config
- **Knock-on effects:** Configurația de module per-firmă → fișier config în cod

### Q3: Dashboard-ul — cum să arate vizual?
- **Recommended:** 3 firme clar separate cu progres lunar vizibil, navigare ușoară la luni; în checklist — module grupate pe secțiuni distincte
- **User's answer / preference:** Acceptat + dashboard să afișeze % completare comparativ cu ce e necesar de făcut
- **Rationale / constraints:** Scopul e să fie ușor de urmărit lunar
- **Knock-on effects:** Fiecare firmă pe dashboard arată progresul real (X% din task-urile lunii completate)

### Q4: Borderou-ul de la Booking/Airbnb — ce face panelul?
- **Recommended:** Upload simplu PDF + import din link
- **User's answer / preference:** Upload simplu. Singura funcționalitate specială: import din link Booking și Airbnb (API existent `/api/chitante/import-url`). Fără procesare AI.
- **Rationale / constraints:** Scopul general e tracking lunar simplu
- **Knock-on effects:** Paneluri borderou refolosesc `InvoiceDocumentsPanel` cu `section` diferit

### Q5: Unde stocăm configurația de module per-firmă?
- **Recommended:** Fișier config în cod (`lib/firma-config.ts`)
- **User's answer / preference:** Fișier config în cod (opțiunea B)
- **Rationale / constraints:** Firmele sunt fixe (3), modulele se schimbă rar, nu e nevoie de admin UI
- **Knock-on effects:** `lib/firma-config.ts` conține: module active + task-uri per modul + date juridice per firmă

### Q6: Cum restructurăm ChecklistClient.tsx?
- **Recommended:** Module independente în `app/[firma]/[luna]/modules/` + orchestrator
- **User's answer / preference:** Da — fiecare modul independent, ca o mapă de urmărit lunar
- **Rationale / constraints:** Fiecare modul = set de sarcini clare de bifat
- **Knock-on effects:** Fiecare modul are propriul state și fetch-uri; orchestratorul randează doar modulele active din config

### Q7: Cum bifezi că un modul e complet?
- **Recommended:** Task-uri fixe per modul, hardcodate în config
- **User's answer / preference:** Opțiunea A — task-uri fixe per modul hardcodate
- **Rationale / constraints:** Nu depinde de DB `checklist_templates` care pot fi incomplete
- **Knock-on effects:** DB stochează doar starea (completat/nu) per task_key + luna_id; `lib/firma-config.ts` definește task-urile

### Q8: Layout pagina per firmă/lună — o pagină sau pagini separate?
- **Recommended:** O pagină cu secțiuni expandabile
- **User's answer / preference:** Pagini separate per modul (ruta `[firma]/[luna]/[modul]`)
- **Rationale / constraints:** Mai curat, fără scroll lung
- **Knock-on effects:** `[firma]/[luna]` devine hub cu carduri; fiecare card → pagina dedicată modulului

### Q9: Pagina hub — design carduri module?
- **Recommended:** Card cu nume modul + progres task-uri + stare vizuală + click → pagina modulului; sus: progres total lună + navigare luni
- **User's answer / preference:** Aceeași structură, dar design mai premium
- **Knock-on effects:** Design system îngrijit necesar

### Q10: Stil vizual premium?
- **Recommended:** Dark elegant (Linear/Vercel style)
- **User's answer / preference:** Dark elegant — fundal negru/gri închis, accente albe/colorate, tipografie clară
- **Knock-on effects:** Tailwind dark theme consistent; culori per firmă ca accente; fonturi Geist; card-uri cu border subtil

### Q11: Cum se actualizează progresia în hub după lucru într-un modul?
- **Recommended:** Server Component refetch (router.refresh())
- **User's answer / preference:** Varianta A — Server refetch. Dashboard să afișeze % completare față de totalul de task-uri necesar
- **Knock-on effects:** Hub și dashboard sunt Server Components; `progres_pct` calculat din (task-uri completate / total task-uri din config) × 100

### Q12: DB pentru starea task-urilor — înlocuim sau adaptăm tabelele existente?
- **Recommended:** Tabelă nouă simplă `task_stari` (luna_id, task_key, completat); tabelele vechi rămân în DB dar nu mai sunt folosite
- **User's answer / preference:** Mergem pe recomandare — tabelă nouă `task_stari`
- **Rationale / constraints:** Task-urile sunt hardcodate în config; DB stochează doar starea, nu definițiile
- **Knock-on effects:** SQL de creat: `create table task_stari (id uuid primary key, luna_id uuid references luni_contabile, task_key text, completat boolean default false, updated_at timestamptz)`; unic pe (luna_id, task_key)

### Q13: Sidebar — cum arată în noua structură?
- **Recommended:** Sidebar vizibil la toate nivelurile: logo ContaFlow sus + cele 3 firme cu indicator progres % + sub-navigare module când ești în hub-ul unei firme; dark elegant minimal
- **User's answer / preference:** Perfect, mergem pe recomandare
- **Knock-on effects:** `components/Sidebar.tsx` redesenat complet; preia lista de firme + progres din props (Server Component parent)
