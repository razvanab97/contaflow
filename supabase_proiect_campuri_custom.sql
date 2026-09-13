-- Campuri suplimentare, create prin selectarea unei bucati de text direct din previzualizare
-- ("Fa camp editabil") - pe langa cele 4 campuri fixe (perioada/autorizatii/obiective/activitati),
-- oricate campuri, oriunde in document, definite de utilizator.
create table if not exists proiect_raport_campuri_custom (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firme(id) on delete cascade,
  sectiune text not null,
  cheie text not null,
  eticheta text not null,
  valoare text not null default '',
  created_at timestamptz not null default now(),
  unique (firma_id, sectiune, cheie)
);

alter table proiect_raport_campuri_custom enable row level security;
create policy "allow all" on proiect_raport_campuri_custom for all using (true);
