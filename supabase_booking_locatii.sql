-- Proprietatile (unitatile de cazare) Booking.com ale unei firme, identificate prin codul
-- Booking ("Numarul unitatii de cazare", ex. 15331624) + o denumire pentru afisare.
-- Lista e gestionata manual (se pot adauga/sterge oricand), nu se sincronizeaza automat din
-- Booking (extranetul lor nu are un API public de citire pentru partenerii obisnuiti).

create table if not exists booking_locatii (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firme(id) on delete cascade,
  cod text not null,
  denumire text not null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  unique (firma_id, cod)
);

create index if not exists booking_locatii_firma_idx on booking_locatii(firma_id, activa);

alter table booking_locatii enable row level security;
drop policy if exists "allow all" on booking_locatii;

-- Codul unitatii Booking extras din facturi/borderouri, ca sa le putem grupa pe proprietate.
alter table documente add column if not exists cod_unitate_booking text;
create index if not exists documente_cod_unitate_booking_idx on documente(firma_id, luna_id, cod_unitate_booking);
