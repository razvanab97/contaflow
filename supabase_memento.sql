-- Memento-uri (reminder-uri) ale asistentului AI: lucruri de făcut, opțional la o dată
-- (ex. „plătește factura EON pe 02.12”). Apar în lista „De făcut” de pe Dashboard până sunt rezolvate.
-- firma_id opțional (null = memento general, fără firmă). Fără RLS — acces doar server-side cu service
-- key, ca restul tabelelor din ContaFlow (un singur utilizator). Idempotent — safe de re-rulat.
create table if not exists memento (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid references firme(id) on delete cascade,
  text text not null,
  data_scadenta date,
  rezolvat boolean not null default false,
  rezolvat_at timestamptz,
  sursa text default 'chat',
  created_at timestamptz not null default now()
);
create index if not exists memento_deschise_idx on memento(rezolvat, data_scadenta);
