-- Status de plată pentru documentele din Facturi restante (rămân vizibile până sunt marcate achitate,
-- indiferent de luna contabilă curentă).
alter table documente add column if not exists platit boolean not null default false;
alter table documente add column if not exists data_platii date;
