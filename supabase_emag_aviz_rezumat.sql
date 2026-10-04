-- Continutul complet al avizelor de plata eMAG (vanzari ramburs/card, retineri curier, comisioane,
-- vouchere, alte facturi, total virat), citit o singura data cu AI si pastrat aici - baza pentru
-- "Concluzia eMAG". Idempotent. Fara tabel, concluzia se calculeaza la fiecare deschidere (mai lent).
create table if not exists emag_aviz_rezumat (
  document_id uuid primary key references documente(id) on delete cascade,
  valuta text,
  linii jsonb not null default '[]'::jsonb,
  total_plata numeric,
  data_aviz date,
  created_at timestamptz not null default now()
);
