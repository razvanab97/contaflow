-- Valorile curente ale campurilor editabile din Raportul lunar (proiect) + sablonul consolidat
-- (document.docx cu marcaje %%CAMP%% in loc de sectiunile care se schimba lunar), ca sa poata fi
-- regenerat automat dintr-un formular, fara sa mai fie nevoie de editare manuala in Word.

-- Gaseste dinamic constrangerea CHECK existenta pe coloana "sectiune" (indiferent cum se numeste
-- ea de fapt - numele exact generat automat de Postgres poate diferi) si o inlocuieste, ca sa
-- acceptam si valoarea noua 'raport_lunar_sablon' pe langa 'raport_lunar'.
do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'proiect_documente'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%sectiune%';
  if con_name is not null then
    execute format('alter table proiect_documente drop constraint %I', con_name);
  end if;
end $$;

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
