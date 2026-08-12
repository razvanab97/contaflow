-- Dezactivare modul pe o lună specifică (firma nu are activitate în acea categorie luna asta)
-- Task-urile modulului dezactivat sunt excluse din calculul de progres pentru luna respectivă.
create table if not exists module_stari (
  id uuid primary key default gen_random_uuid(),
  luna_id uuid not null references luni_contabile(id) on delete cascade,
  modul_slug text not null,
  dezactivat boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(luna_id, modul_slug)
);

create index if not exists module_stari_luna_id_idx on module_stari(luna_id);

alter table module_stari enable row level security;
create policy "allow all" on module_stari for all using (true);
