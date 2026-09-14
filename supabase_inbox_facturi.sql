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
  client_secret text,
  token_expires_at timestamptz,
  scopes text,
  provider_user_id text,
  provider_companies jsonb,
  connection_error text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table inbox_surse_email add column if not exists access_token text;
alter table inbox_surse_email add column if not exists refresh_token text;
alter table inbox_surse_email add column if not exists client_secret text;
alter table inbox_surse_email add column if not exists token_expires_at timestamptz;
alter table inbox_surse_email add column if not exists scopes text;
alter table inbox_surse_email add column if not exists provider_user_id text;
alter table inbox_surse_email add column if not exists provider_companies jsonb;
alter table inbox_surse_email add column if not exists connection_error text;

create index if not exists inbox_surse_email_firma_idx on inbox_surse_email(firma_id, provider, status);
create index if not exists inbox_surse_email_provider_user_idx on inbox_surse_email(provider, provider_user_id);

alter table inbox_surse_email enable row level security;
drop policy if exists "allow all" on inbox_surse_email;

create table if not exists inbox_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references inbox_surse_email(id) on delete cascade,
  firma_id uuid references firme(id) on delete cascade,
  luna_id uuid references luni_contabile(id) on delete cascade,
  luna text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'error')),
  messages_checked integer not null default 0,
  pdfs_found integer not null default 0,
  imported_count integer not null default 0,
  duplicate_count integer not null default 0,
  skipped_count integer not null default 0,
  since_date date,
  error_message text,
  result jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inbox_sync_jobs_source_idx on inbox_sync_jobs(source_id, status, created_at desc);
create index if not exists inbox_sync_jobs_firma_idx on inbox_sync_jobs(firma_id, created_at desc);

alter table inbox_sync_jobs enable row level security;
