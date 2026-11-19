-- Modulul „Activități sociale" al proiectului AB Textile (întreprindere socială).
-- Zonele (activitățile din plan) sunt fixe în cod (lib/proiect-social.ts). Aici păstrăm:
--   1) activitățile create în fiecare zonă (AS-NNN/AN), cu status și indicatori;
--   2) ciclul de viață al unei zone pe an (deschisă / închisă pe an / închisă definitiv);
--   3) legătura documentelor (din tabelul `documente`) cu o activitate.
-- Idempotent — se poate rula de mai multe ori.

create table if not exists activitati_sociale (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firme(id) on delete cascade,
  zona text not null,                         -- cod zonă din catalog (ex. ZS-2.2)
  cod text not null,                          -- AS-001/2026 (unic pe firmă)
  denumire text not null,
  an int not null,
  perioada text,
  obiectiv text,
  beneficiari_estimat int,
  beneficiari_realizat int,
  responsabil text,
  parteneri text,
  status text not null default 'planificata'
    check (status in ('planificata','in_desfasurare','finalizata','validata')),
  rezultate text,
  validat_la timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_activitati_sociale_firma on activitati_sociale(firma_id, an);
create unique index if not exists uq_activitati_sociale_cod on activitati_sociale(firma_id, cod);

-- Starea unei zone pe un an. Lipsa rândului = zonă deschisă. „inchisa_definitiv" (pe oricare an)
-- marchează zona ca închisă definitiv.
create table if not exists zone_sociale_an (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firme(id) on delete cascade,
  zona text not null,
  an int not null,
  status text not null default 'deschisa'
    check (status in ('deschisa','inchisa_pe_an','inchisa_definitiv')),
  nota text,
  updated_at timestamptz not null default now(),
  unique (firma_id, zona, an)
);
create index if not exists idx_zone_sociale_an_firma on zone_sociale_an(firma_id);

-- Un document din `documente` poate aparține unei activități sociale (ca `achizitie_id` pentru achiziții).
alter table documente add column if not exists activitate_sociala_id uuid;
create index if not exists idx_documente_activitate_sociala on documente(activitate_sociala_id);

alter table activitati_sociale enable row level security;
drop policy if exists "allow all" on activitati_sociale;
create policy "allow all" on activitati_sociale for all using (true) with check (true);

alter table zone_sociale_an enable row level security;
drop policy if exists "allow all" on zone_sociale_an;
create policy "allow all" on zone_sociale_an for all using (true) with check (true);
