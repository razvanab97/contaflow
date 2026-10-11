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
  status text not null default 'urmeaza' check (status in ('facut', 'in_curs', 'urmeaza', 'nu_se_aplica')),
  nota text,
  data_realizare date,
  updated_at timestamptz not null default now(),
  primary key (firma_id, cheie)
);
