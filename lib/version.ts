// Crescut manual la fiecare modificare livrata, ca reper vizual ca update-ul a ajuns live.
// Fiecare intrare descrie pe scurt ce s-a schimbat - click pe "Update N" (jos-stanga) arata istoricul.
export interface UpdateEntry { v: number; text: string }

export const UPDATES: UpdateEntry[] = [
  { v: 60, text: 'Sistem global de aparență: Sistem/Deschis/Întunecat/Glass, selector în sidebar (vizibil pe orice pagină), persistat, fără clipire la încărcare. Glass e translucent+blur doar pe sidebar/header/dropdown-uri — tabelele și formularele rămân opace pentru lizibilitate' },
  { v: 59, text: 'Hub-ul lunar: module lunare din carduri mari (230px+) în rânduri compacte (~70-100px) — toate modulele unei firme încap acum pe un singur ecran, fără scroll; corectat și overflow orizontal pe mobil în antetul hub-ului' },
  { v: 58, text: 'Extras de cont: eliminat mini-sidebar-ul propriu (logo + căutare duplicate) rămas dintr-o versiune veche, dinainte de shell-ul persistent — bara de progres și butonul de finalizare extras au fost mutate în conținutul principal' },
  { v: 57, text: 'Dashboard: facturi restante vizibile direct pe fiecare card de firmă + total pe prima linie, fără să intri în firmă' },
  { v: 56, text: 'Performanță: comutatorul de lună de la Raport lunar (proiect) precarcă acum luna vecină + căutarea globală de documente nu mai poate afișa un răspuns vechi peste unul nou la tastare rapidă + Extras de cont face 2 interogări în paralel în loc de secvențial' },
  { v: 55, text: 'Shell persistent pe toată aplicația: sidebar-ul nu se mai reconstruiește nici la Dashboard/Furnizori/Date personale/Model documente/Facturi de asociat (nu doar în interiorul unei firme+luni) + comutator rapid de firmă în capul paginii, cu prefetch' },
  { v: 54, text: 'Raport lunar (proiect): redesign complet — workspace cu previzualizare + editor pe secțiuni (nu textarea-uri), liste editabile individual, dată-interval, autosave, tab-uri (Editare/Previzualizare/Istoric/Fișier); arhitectură generică, reutilizabilă pentru viitoare tipuri de documente' },
  { v: 53, text: 'Raport lunar (proiect): buton de ștergere pentru câmpurile personalizate (textul revine fix, cu valoarea curentă) + indicii vizuale mai clare pentru selecție și generare' },
  { v: 52, text: 'Raport lunar (proiect): poți selecta orice text din previzualizare și să-l faci "câmp editabil" cu propria etichetă, pe lângă cele 4 fixe' },
  { v: 51, text: 'Raport lunar (proiect): antetul/subsolul cu sigle apar acum la dimensiunea corectă din Word, aliniate pe orizontală, nu uriașe/stivuite' },
  { v: 50, text: 'Previzualizare Word direct în pagină la Raport lunar (proiect), randată în aplicație, fără server extern' },
  { v: 49, text: 'Viteză: schele de încărcare instant pe toate paginile + module lunare încărcate lazy (cod separat per modul)' },
  { v: 48, text: 'Nou: tab PROIECT AB Textile, cu Raport lunar — document Word unic, se înlocuiește la reîncărcare, nu se acumulează' },
  { v: 47, text: 'Layout comun pentru firmă+lună — sidebar-ul nu se mai reconstruiește la fiecare navigare între module' },
  { v: 46, text: '5StarDesk: reparat bug de extragere AI care dubla o rezervare din borderou + verificare inversă (facturi fără rezervare)' },
  { v: 45, text: 'Navigare mai rapidă: interogări paralelizate pe Furnizori, Date personale, Model documente, Facturi de asociat, hub-ul lunii' },
  { v: 44, text: 'Dashboard: Date firmă afișat direct la fiecare firmă, fără click' },
]

export const APP_UPDATE = UPDATES[0].v
