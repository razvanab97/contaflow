-- Urmărire per-factură extrasă din aviz: marcaj "am copiat codul" + documentul facturii descărcate și reîncărcate.
alter table emag_avize_facturi add column if not exists copiat boolean not null default false;
alter table emag_avize_facturi add column if not exists factura_document_id uuid references documente(id) on delete set null;
