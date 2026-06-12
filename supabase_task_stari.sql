-- Tabelă nouă pentru starea task-urilor per lună
-- Task-urile sunt definite în lib/firma-config.ts (hardcodate)
-- DB stochează doar starea (completat/nu) per task_key + luna_id

-- Funcție pentru inițializarea unei luni noi (apelată din InitLuna.tsx via /api/luna/init)
create or replace function init_luna_noua(p_firma_id uuid, p_luna date)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into luni_contabile (firma_id, luna)
  values (p_firma_id, p_luna)
  on conflict (firma_id, luna) do update set firma_id = excluded.firma_id
  returning id into v_id;
  return v_id;
end;
$$;


create table if not exists task_stari (
  id uuid primary key default gen_random_uuid(),
  luna_id uuid not null references luni_contabile(id) on delete cascade,
  task_key text not null,
  completat boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(luna_id, task_key)
);

create index if not exists task_stari_luna_id_idx on task_stari(luna_id);

-- Activare RLS dezactivată (aplicație single-user, anon key)
alter table task_stari enable row level security;
create policy "allow all" on task_stari for all using (true);
