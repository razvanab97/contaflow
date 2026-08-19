-- Modul "Model documente" — șabloane la nivel de firmă (nu ține de o lună anume)
create table if not exists model_documente (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firme(id) on delete cascade,
  sectiune text not null check (sectiune in ('raport_lunar','stat_plata_angajati','acte_contabile')),
  fisier_nume text not null,
  fisier_path text not null,
  fisier_tip text,
  fisier_marime bigint,
  created_at timestamptz not null default now()
);
create index if not exists model_documente_firma_idx on model_documente(firma_id, sectiune);

create table if not exists model_documente_notite (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firme(id) on delete cascade,
  sectiune text not null check (sectiune in ('raport_lunar','stat_plata_angajati','acte_contabile')),
  continut text,
  updated_at timestamptz not null default now(),
  unique (firma_id, sectiune)
);
