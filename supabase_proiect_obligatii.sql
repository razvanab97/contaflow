-- PROIECT AB Textile: obligații recurente lunare (Salarii, Reges, Acte contabile, Raport lunar
-- către Prosocial/Orieda) și achiziții (aparate/materiale cofinanțate), cu date de scadență
-- editabile din aplicație - ca să existe un panou clar "ce e restant/urmează", nu doar bife.
-- Rulează manual în Supabase SQL editor, ca și celelalte fișiere supabase_*.sql.

-- 1. Obligații recurente lunare - mirror de impozite_stari (vezi supabase_date_personale_impozite.sql),
-- dar cu scadență calculată automat din ziua definită per tip în firma-config.ts (nu introdusă manual
-- de fiecare dată) - rămâne totuși editabilă din UI dacă termenul real diferă într-o anumită lună.
create table if not exists obligatii_stari (
  id uuid primary key default gen_random_uuid(),
  luna_id uuid not null references luni_contabile(id) on delete cascade,
  tip_key text not null,
  scadenta date,
  trimis boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(luna_id, tip_key)
);
create index if not exists obligatii_stari_luna_id_idx on obligatii_stari(luna_id);

alter table obligatii_stari enable row level security;
create policy "allow all" on obligatii_stari for all using (true);

-- 2. Achiziții (aparate/materiale, adesea din cofinanțare) - fiecare e un mini-dosar cu etape
-- proprii (ofertă -> notă semnată -> plată inițiată -> dovadă trimisă -> finalizat), nu doar o bifă.
create table if not exists proiect_achizitii (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firme(id) on delete cascade,
  luna_id uuid references luni_contabile(id) on delete set null,
  denumire text not null,
  valoare numeric,
  sursa text,
  status text not null default 'oferta' check (status in ('oferta','nota_semnata','plata_initiata','dovada_trimisa','finalizat')),
  scadenta date,
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists proiect_achizitii_firma_idx on proiect_achizitii(firma_id);

alter table proiect_achizitii enable row level security;
create policy "allow all" on proiect_achizitii for all using (true);

-- 3. Documentele unei achiziții (ofertă, notă semnată, dovadă plată etc.) - folosesc tabela
-- generică `documente`, la fel ca atașamentele pe tranzacții (`tranzactie_id`), doar că aici
-- legătura e cu achiziția, nu cu o tranzacție bancară.
alter table documente add column if not exists achizitie_id uuid references proiect_achizitii(id) on delete cascade;
create index if not exists documente_achizitie_id_idx on documente(achizitie_id) where achizitie_id is not null;
