-- Facturi adaugate in avans (luna curenta), care asteapta sa fie asociate automat cu plata
-- corespunzatoare din extrasul de cont al lunii urmatoare (dupa suma + data apropiata).
create table if not exists facturi_asteptate (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firme(id) on delete cascade,
  fisier_path text not null,
  fisier_nume text not null,
  fisier_tip text,
  furnizor text,
  suma numeric,
  data_factura date,
  status text not null default 'asteptare' check (status in ('asteptare','asociata')),
  tranzactie_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists facturi_asteptate_firma_idx on facturi_asteptate(firma_id, status);
