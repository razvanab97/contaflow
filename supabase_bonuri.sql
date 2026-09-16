-- Bonuri fiscale adaugate in avans (in principal combustibil, dar generic pentru orice bon),
-- care asteapta sa fie asociate automat cu plata corespunzatoare din extrasul de cont, la fel
-- ca facturile din "facturi_asteptate" - dar cu campuri proprii: comerciant (nu furnizor),
-- cui_client (CUI-ul firmei beneficiare citit pe bon, cand exista) si tip (combustibil/altul).
create table if not exists bonuri (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firme(id) on delete cascade,
  fisier_path text not null,
  fisier_nume text not null,
  fisier_tip text,
  tip text not null default 'combustibil' check (tip in ('combustibil','altul')),
  comerciant text,
  cui_client text,
  suma numeric,
  data_bon date,
  status text not null default 'asteptare' check (status in ('asteptare','asociata')),
  tranzactie_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists bonuri_firma_idx on bonuri(firma_id, status);
