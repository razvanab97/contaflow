-- Recomandari AI generate la cererea utilizatorului, la finalul lunii - un rezumat structurat
-- al lunii (task-uri, module dezactivate, tranzactii nedocumentate, documente pe sectiune,
-- restante) e trimis catre Claude, care propune imbunatatiri concrete ale sistemului pentru
-- lunile viitoare. Pastram istoric (nu unique pe luna_id) - se poate regenera oricand.
create table if not exists recomandari_luna (
  id uuid primary key default gen_random_uuid(),
  luna_id uuid not null references luni_contabile(id) on delete cascade,
  continut text not null,
  rezumat_date jsonb,
  creat_la timestamptz not null default now()
);

create index if not exists recomandari_luna_luna_id_idx on recomandari_luna(luna_id);

alter table recomandari_luna enable row level security;
create policy "allow all" on recomandari_luna for all using (true);
