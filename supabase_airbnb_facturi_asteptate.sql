-- Facturi Airbnb asteptate, generate din borderoul CSV.
-- Borderoul ramane documentul sursa; PDF-urile incarcate ulterior in Airbnb Facturi se pot lega automat aici.
create table if not exists airbnb_facturi_asteptate (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firme(id) on delete cascade,
  luna_id uuid not null references luni_contabile(id) on delete cascade,
  borderou_document_id uuid not null references documente(id) on delete cascade,
  unique_key text not null,
  cod_confirmare text not null,
  oaspete text,
  anunt text,
  data_rezervarii date,
  data_start date,
  data_sfarsit date,
  data_tranzactie date,
  moneda text,
  suma numeric,
  taxa_servicii numeric,
  castiguri_brute numeric,
  factura_document_id uuid references documente(id) on delete set null,
  status text not null default 'de_atasat' check (status in ('de_atasat', 'atasata', 'nu_se_cere')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (firma_id, luna_id, unique_key)
);

create index if not exists airbnb_facturi_asteptate_luna_idx on airbnb_facturi_asteptate(luna_id);
create index if not exists airbnb_facturi_asteptate_firma_luna_idx on airbnb_facturi_asteptate(firma_id, luna_id);
create index if not exists airbnb_facturi_asteptate_document_idx on airbnb_facturi_asteptate(factura_document_id);

alter table airbnb_facturi_asteptate enable row level security;
create policy "allow all" on airbnb_facturi_asteptate for all using (true);
