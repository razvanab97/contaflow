-- Inbox Facturi — documente venite din email/Oblio/e-Factura.
-- Documentele se salveaza in tabelul `documente`, cu modul='inbox_facturi'
-- si fisier_path de forma: <firma>/<luna>/inbox-facturi/<hash>_<nume>.

alter table documente drop constraint if exists documente_modul_check;

create table if not exists inbox_surse_email (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid references firme(id) on delete cascade,
  provider text not null check (provider in ('gmail', 'icloud_imap', 'oblio')),
  eticheta text not null,
  email text,
  status text not null default 'neconectat' check (status in ('neconectat', 'activ', 'eroare', 'pauzat')),
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inbox_surse_email_firma_idx on inbox_surse_email(firma_id, provider, status);

alter table inbox_surse_email enable row level security;
drop policy if exists "allow all" on inbox_surse_email;
create policy "allow all" on inbox_surse_email for all using (true);
