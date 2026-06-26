-- Date personale (firmă + proprietari) și Plată impozite
-- Rulează manual în Supabase SQL editor, ca și supabase_task_stari.sql

-- 1. Date legale firmă, direct pe tabela firme (relație 1:1)
alter table firme add column if not exists cui text;
alter table firme add column if not exists nr_reg_com text;
alter table firme add column if not exists adresa text;
alter table firme add column if not exists judet text;
alter table firme add column if not exists tara text;
alter table firme add column if not exists certificat_path text;
alter table firme add column if not exists certificat_nume text;

-- 2. Proprietari (1:many per firmă), cu buletin (CI) scanat
create table if not exists proprietari (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firme(id) on delete cascade,
  nume text not null,
  serie_ci text,
  numar_ci text,
  buletin_path text,
  buletin_nume text,
  ordine int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists proprietari_firma_id_idx on proprietari(firma_id);

alter table proprietari enable row level security;
create policy "allow all" on proprietari for all using (true);

-- 3. Impozite per lună (mirror de task_stari, cu sumă/scadență/plătit)
create table if not exists impozite_stari (
  id uuid primary key default gen_random_uuid(),
  luna_id uuid not null references luni_contabile(id) on delete cascade,
  tip_key text not null,
  suma numeric,
  scadenta date,
  platit boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(luna_id, tip_key)
);

create index if not exists impozite_stari_luna_id_idx on impozite_stari(luna_id);

alter table impozite_stari enable row level security;
create policy "allow all" on impozite_stari for all using (true);
