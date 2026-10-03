-- Motivul pentru care o tranzactie a fost ignorata (nu are nevoie de document) si daca a fost
-- sarita automat de regulile standard (comisioane, schimb valutar, incasari Booking/Airbnb/eMAG).
-- Idempotent - se poate rula de mai multe ori. Fara aceste coloane aplicatia functioneaza ca inainte
-- (ignorarea merge, doar motivul nu se salveaza).
alter table tranzactii add column if not exists motiv_ignorare text;
alter table tranzactii add column if not exists ignorat_auto boolean not null default false;

-- Marcaj pentru completarea automata (AI) a sumelor lipsa pe documente: un document incercat o data
-- nu se mai reincearca la fiecare rulare (unele documente chiar nu au o suma de citit).
alter table documente add column if not exists extractie_incercata_at timestamptz;
