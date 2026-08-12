-- Facturi de comision Airbnb (per-rezervare) și Booking (agregate lunar), extrase automat (AI)
-- pentru verificarea completitudinii față de borderou.
create table if not exists comision_facturi (
  id uuid primary key default gen_random_uuid(),
  luna_id uuid not null references luni_contabile(id) on delete cascade,
  firma_id uuid not null,
  document_id uuid not null references documente(id) on delete cascade,
  platforma text not null, -- 'airbnb' | 'booking'
  numar_factura text,
  cod_rezervare text, -- doar Airbnb; Booking facturează agregat, nu per rezervare
  suma numeric,
  created_at timestamptz not null default now()
);
create index if not exists comision_facturi_luna_idx on comision_facturi(luna_id);

alter table comision_facturi enable row level security;
create policy "allow all" on comision_facturi for all using (true);
