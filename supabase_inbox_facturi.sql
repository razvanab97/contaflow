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
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text,
  provider_user_id text,
  connection_error text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table inbox_surse_email add column if not exists access_token text;
alter table inbox_surse_email add column if not exists refresh_token text;
alter table inbox_surse_email add column if not exists token_expires_at timestamptz;
alter table inbox_surse_email add column if not exists scopes text;
alter table inbox_surse_email add column if not exists provider_user_id text;
alter table inbox_surse_email add column if not exists connection_error text;

create index if not exists inbox_surse_email_firma_idx on inbox_surse_email(firma_id, provider, status);
create index if not exists inbox_surse_email_provider_user_idx on inbox_surse_email(provider, provider_user_id);

alter table inbox_surse_email enable row level security;
drop policy if exists "allow all" on inbox_surse_email;
