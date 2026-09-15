-- Coadă globală pentru facturile urcate dintr-un folder de pe calculatorul personal
-- (scripts/watch-facturi-locale.mjs). Spre deosebire de inbox_local_files (care e legat
-- de o firmă anume, din pagina Inbox Facturi a acelei firme), aici firma nu se cunoaște
-- la încărcare — se detectează abia la sincronizare, la fel ca la Gmail.

create table if not exists inbox_watch_files (
  id uuid primary key default gen_random_uuid(),
  fisier_path text not null,
  fisier_nume text not null,
  fisier_tip text not null,
  fisier_marime integer not null,
  document_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'imported', 'duplicat', 'nedetectat', 'eroare')),
  firma_id uuid references firme(id) on delete set null,
  luna_id uuid references luni_contabile(id) on delete set null,
  document_id uuid references documente(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  synced_at timestamptz
);

create unique index if not exists inbox_watch_files_hash_idx on inbox_watch_files(document_hash);
create index if not exists inbox_watch_files_status_idx on inbox_watch_files(status);

alter table inbox_watch_files enable row level security;
drop policy if exists "allow all" on inbox_watch_files;
