-- Facturile individuale extrase automat (AI) dintr-un aviz de plată eMAG încărcat.
-- Un aviz (rând în `documente`, modul='emag', tip_document='aviz_plata') conține mai multe facturi de căutat/descărcat.
create table if not exists emag_avize_facturi (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documente(id) on delete cascade,
  luna_id uuid not null references luni_contabile(id) on delete cascade,
  task_key text not null,
  categorie text,
  id_document text,
  serie_document text,
  numar_cautare text,
  data_document text,
  valoare numeric,
  created_at timestamptz not null default now()
);

create index if not exists emag_avize_facturi_luna_idx on emag_avize_facturi(luna_id);
create index if not exists emag_avize_facturi_task_idx on emag_avize_facturi(task_key);

alter table emag_avize_facturi enable row level security;
create policy "allow all" on emag_avize_facturi for all using (true);
