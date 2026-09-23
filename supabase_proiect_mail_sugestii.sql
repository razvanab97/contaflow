-- Semi-automatizare Obligații/Achiziții din corespondența Gmail cu Prosocial/Orieda (PROIECT AB
-- Textile). AI-ul scrie DOAR aici - niciodată direct în obligatii_stari/proiect_achizitii, ca să
-- nu se poată produce o stare de conformitate pe care fluxul manual n-ar putea-o produce.
-- Rulează manual în Supabase SQL editor, ca și celelalte fișiere supabase_*.sql.

-- 1. Sugestii pentru Obligații recurente - fie "am găsit dovadă că a fost trimis", fie
-- "mailul propune o altă scadență decât cea estimată".
create table if not exists obligatii_sugestii (
  id uuid primary key default gen_random_uuid(),
  luna_id uuid not null references luni_contabile(id) on delete cascade,
  tip_key text not null,
  tip_sugestie text not null check (tip_sugestie in ('trimis','scadenta_override')),
  valoare_data date,
  incredere text not null default 'posibil' check (incredere in ('sigur','posibil')),
  sursa_email_id text not null,
  sursa_subiect text,
  sursa_data timestamptz,
  sursa_rezumat text,
  status text not null default 'noua' check (status in ('noua','confirmata','respinsa')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(luna_id, tip_key, tip_sugestie, sursa_email_id)
);
create index if not exists obligatii_sugestii_luna_idx on obligatii_sugestii(luna_id, status);

alter table obligatii_sugestii enable row level security;
create policy "allow all" on obligatii_sugestii for all using (true);

-- 2. Sugestii pentru Achiziții - fie o achiziție nouă propusă (achizitie_id null), fie o
-- actualizare de etapă pentru una deja existentă.
create table if not exists achizitii_sugestii (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firme(id) on delete cascade,
  luna_id uuid references luni_contabile(id) on delete set null,
  achizitie_id uuid references proiect_achizitii(id) on delete cascade,
  actiune text not null check (actiune in ('creare','actualizare_status','neclar')),
  denumire text,
  valoare numeric,
  sursa text,
  status_propus text check (status_propus in ('oferta','nota_semnata','plata_initiata','dovada_trimisa','finalizat')),
  incredere text not null default 'posibil' check (incredere in ('sigur','posibil')),
  sursa_email_id text not null,
  sursa_subiect text,
  sursa_data timestamptz,
  sursa_rezumat text,
  status text not null default 'noua' check (status in ('noua','confirmata','respinsa')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(sursa_email_id)
);
create index if not exists achizitii_sugestii_firma_idx on achizitii_sugestii(firma_id, status);

alter table achizitii_sugestii enable row level security;
create policy "allow all" on achizitii_sugestii for all using (true);

-- 3. Dedup + audit: fiecare mail verificat o singură dată, cu răspunsul brut al AI-ului păstrat
-- (chiar și pentru cele irelevante) - permite reprocesare ulterioară (ex. Faza 2 - Achiziții)
-- fără să mai fie nevoie de re-scanare Gmail / re-apel Claude.
create table if not exists proiect_mail_processed (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references inbox_surse_email(id) on delete cascade,
  message_id text not null,
  clasificare text,
  raspuns_ai jsonb,
  created_at timestamptz not null default now(),
  unique(source_id, message_id)
);
create index if not exists proiect_mail_processed_source_idx on proiect_mail_processed(source_id);

alter table proiect_mail_processed enable row level security;
create policy "allow all" on proiect_mail_processed for all using (true);
