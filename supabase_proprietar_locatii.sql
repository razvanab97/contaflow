-- Leaga un proprietar (din tabelul proprietari) de una sau mai multe proprietati/adrese pe
-- care le detine, ca la generarea unei Dispozitii de plata sa poti alege direct proprietatea
-- si sa se precompleteze automat proprietarul (nume + CI), fara sa mai cauti manual in lista.
-- Un proprietar poate avea mai multe proprietati (ex. Bucsa Radu detine 2 apartamente).

create table if not exists proprietar_locatii (
  id uuid primary key default gen_random_uuid(),
  proprietar_id uuid not null references proprietari(id) on delete cascade,
  firma_id uuid not null references firme(id) on delete cascade,
  eticheta text not null,
  created_at timestamptz not null default now(),
  unique (firma_id, eticheta)
);

create index if not exists proprietar_locatii_firma_idx on proprietar_locatii(firma_id);
create index if not exists proprietar_locatii_proprietar_idx on proprietar_locatii(proprietar_id);

alter table proprietar_locatii enable row level security;
drop policy if exists "allow all" on proprietar_locatii;
