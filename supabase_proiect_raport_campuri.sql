-- Valorile curente ale campurilor editabile din Raportul lunar (proiect) + sablonul consolidat
-- (document.docx cu marcaje %%CAMP%% in loc de sectiunile care se schimba lunar), ca sa poata fi
-- regenerat automat dintr-un formular, fara sa mai fie nevoie de editare manuala in Word.

alter table proiect_documente drop constraint if exists proiect_documente_sectiune_check;
alter table proiect_documente add constraint proiect_documente_sectiune_check
  check (sectiune in ('raport_lunar', 'raport_lunar_sablon'));

create table if not exists proiect_raport_campuri (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firme(id) on delete cascade,
  sectiune text not null check (sectiune in ('raport_lunar')),
  perioada text not null default '',
  autorizatii text not null default '',
  obiective text not null default '',
  activitati text not null default '',
  updated_at timestamptz not null default now(),
  unique (firma_id, sectiune)
);

alter table proiect_raport_campuri enable row level security;
create policy "allow all" on proiect_raport_campuri for all using (true);
