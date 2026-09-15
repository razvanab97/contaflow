-- Sursa "Fișiere locale" pentru Inbox Facturi: încărcare manuală de pe calculator,
-- dar fișierele stau într-o coadă (inbox_local_files) și intră în `documente`
-- abia când se apasă explicit "Sincronizează" (același flux de job ca la Gmail).

alter table inbox_surse_email drop constraint if exists inbox_surse_email_provider_check;
alter table inbox_surse_email add constraint inbox_surse_email_provider_check
  check (provider in ('gmail', 'icloud_imap', 'oblio', 'local_upload'));

create table if not exists inbox_local_files (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references inbox_surse_email(id) on delete cascade,
  firma_id uuid references firme(id) on delete cascade,
  luna_id uuid references luni_contabile(id) on delete cascade,
  luna text not null,
  fisier_path text not null,
  fisier_nume text not null,
  fisier_tip text not null,
  fisier_marime integer not null,
  document_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'imported', 'duplicat', 'sarit', 'eroare')),
  error_message text,
  document_id uuid references documente(id) on delete set null,
  created_at timestamptz not null default now(),
  synced_at timestamptz
);

create index if not exists inbox_local_files_source_idx on inbox_local_files(source_id, status);
create index if not exists inbox_local_files_firma_luna_idx on inbox_local_files(firma_id, luna_id, status);

alter table inbox_local_files enable row level security;
drop policy if exists "allow all" on inbox_local_files;
