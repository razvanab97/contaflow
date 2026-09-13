-- Documente "slot unic" pentru proiecte (ex: Raportul lunar al unui proiect european) - spre
-- deosebire de model_documente (care acumulează o listă de fișiere pe secțiune), aici fiecare
-- (firma_id, sectiune) are UN SINGUR fișier curent: reîncărcarea îl înlocuiește, nu se adaugă la listă.
create table if not exists proiect_documente (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firme(id) on delete cascade,
  sectiune text not null check (sectiune in ('raport_lunar')),
  fisier_nume text not null,
  fisier_path text not null,
  fisier_tip text,
  fisier_marime bigint,
  updated_at timestamptz not null default now(),
  unique (firma_id, sectiune)
);

alter table proiect_documente enable row level security;
create policy "allow all" on proiect_documente for all using (true);
