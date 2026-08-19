-- Date extrase de AI din documentele HR (stat de plată, chenzină, centralizator contribuții)
-- incarcate la modulul Documente angajati, folosite pentru rezumatul de salarii/contributii.
create table if not exists angajati_extractii (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documente(id) on delete cascade,
  firma_id uuid not null references firme(id) on delete cascade,
  luna_id uuid not null,
  tip_document text,
  angajati jsonb,
  cas numeric,
  cass numeric,
  impozit numeric,
  total_plata numeric,
  created_at timestamptz not null default now()
);
create index if not exists angajati_extractii_luna_idx on angajati_extractii(firma_id, luna_id);
