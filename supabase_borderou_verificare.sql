-- Rezervări extrase (AI) din borderourile Airbnb/Booking, pentru verificarea facturării încrucișate cu 5StarDesk
create table if not exists borderou_rezervari (
  id uuid primary key default gen_random_uuid(),
  luna_id uuid not null references luni_contabile(id) on delete cascade,
  firma_id uuid not null,
  document_id uuid not null references documente(id) on delete cascade,
  platforma text not null, -- 'airbnb' | 'booking'
  cod_rezervare text not null,
  nume_oaspete text,
  suma numeric,
  created_at timestamptz not null default now()
);
create index if not exists borderou_rezervari_luna_idx on borderou_rezervari(luna_id);

-- Facturi extrase (AI) din PDF-urile 5StarDesk (un PDF poate avea zeci de facturi, câte una pe pagină)
create table if not exists stardesk_facturi (
  id uuid primary key default gen_random_uuid(),
  luna_id uuid not null references luni_contabile(id) on delete cascade,
  firma_id uuid not null,
  document_id uuid not null references documente(id) on delete cascade,
  numar_factura text,
  nume_client text,
  suma numeric,
  id_rezervare text,
  created_at timestamptz not null default now()
);
create index if not exists stardesk_facturi_luna_idx on stardesk_facturi(luna_id);

alter table borderou_rezervari enable row level security;
create policy "allow all" on borderou_rezervari for all using (true);
alter table stardesk_facturi enable row level security;
create policy "allow all" on stardesk_facturi for all using (true);
