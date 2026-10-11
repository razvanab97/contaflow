-- Plan & AI proiect (PROIECT AB Textile): istoricul "Intreaba proiectul" + starea activitatilor si
-- obligatiilor din planul de afaceri. Idempotent - sigur de rulat de mai multe ori.
create table if not exists proiect_intrebari (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null,
  intrebare text not null,
  raspuns text,
  created_at timestamptz not null default now()
);
create index if not exists proiect_intrebari_firma_idx on proiect_intrebari (firma_id, created_at desc);

create table if not exists proiect_plan_stari (
  firma_id uuid not null,
  cheie text not null,
  status text not null default 'urmeaza' check (status in ('facut', 'in_curs', 'urmeaza', 'amanat', 'nu_se_aplica')),
  nota text,
  data_realizare date,
  updated_at timestamptz not null default now(),
  primary key (firma_id, cheie)
);

-- Status "amanat" (nu e necesar momentan) adaugat ulterior - actualizeaza constrangerea pe tabelele deja create.
alter table proiect_plan_stari drop constraint if exists proiect_plan_stari_status_check;
alter table proiect_plan_stari add constraint proiect_plan_stari_status_check check (status in ('facut', 'in_curs', 'urmeaza', 'amanat', 'nu_se_aplica'));

-- Memoria proiectului: ce s-a intamplat efectiv (scris manual, retinut din chat, stari din plan).
-- Sursa pentru AI-ul "Intreaba proiectul" si pentru "Completeaza din memoria proiectului" in raportul lunar.
create table if not exists proiect_memorie (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null,
  data date not null default current_date,
  categorie text not null default 'Altele',
  text text not null,
  sursa text not null default 'manual' check (sursa in ('manual', 'chat', 'plan')),
  created_at timestamptz not null default now()
);
create index if not exists proiect_memorie_firma_idx on proiect_memorie (firma_id, data desc);
