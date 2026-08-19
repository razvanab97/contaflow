-- "documente.modul" avea o constrangere CHECK invechita care nu cunostea toate valorile
-- folosite de aplicatie (ex. "general" pentru Documente generale) — o eliminam, la fel ca la
-- documente_tip_document_check, ca sa nu mai blocheze incarcari in sectiuni care nu erau
-- inca inventate cand a fost creata constrangerea initiala.
alter table documente drop constraint if exists documente_modul_check;
