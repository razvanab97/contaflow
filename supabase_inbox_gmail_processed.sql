-- Tine minte ce mesaje Gmail au fost deja evaluate (indiferent de rezultat: importat,
-- duplicat sau sarit), ca sincronizarile urmatoare sa avanseze prin mesaje noi in loc sa
-- reproceseze la infinit acelasi bloc de sus al listei (Gmail returneaza mereu aceeasi
-- ordine pentru aceeasi interogare, iar planul Vercel Hobby (60s) nu permite sa se
-- proceseze totul dintr-o singura rulare cand sunt multe facturi).

create table if not exists inbox_gmail_processed (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references inbox_surse_email(id) on delete cascade,
  message_id text not null,
  created_at timestamptz not null default now(),
  unique (source_id, message_id)
);

create index if not exists inbox_gmail_processed_source_idx on inbox_gmail_processed(source_id);

alter table inbox_gmail_processed enable row level security;
drop policy if exists "allow all" on inbox_gmail_processed;
