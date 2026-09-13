// Crescut manual la fiecare modificare livrata, ca reper vizual ca update-ul a ajuns live.
// Fiecare intrare descrie pe scurt ce s-a schimbat - click pe "Update N" (jos-stanga) arata istoricul.
export interface UpdateEntry { v: number; text: string }

export const UPDATES: UpdateEntry[] = [
  { v: 50, text: 'Previzualizare Word direct în pagină la Raport lunar (proiect), randată în aplicație, fără server extern' },
  { v: 49, text: 'Viteză: schele de încărcare instant pe toate paginile + module lunare încărcate lazy (cod separat per modul)' },
  { v: 48, text: 'Nou: tab PROIECT AB Textile, cu Raport lunar — document Word unic, se înlocuiește la reîncărcare, nu se acumulează' },
  { v: 47, text: 'Layout comun pentru firmă+lună — sidebar-ul nu se mai reconstruiește la fiecare navigare între module' },
  { v: 46, text: '5StarDesk: reparat bug de extragere AI care dubla o rezervare din borderou + verificare inversă (facturi fără rezervare)' },
  { v: 45, text: 'Navigare mai rapidă: interogări paralelizate pe Furnizori, Date personale, Model documente, Facturi de asociat, hub-ul lunii' },
  { v: 44, text: 'Dashboard: Date firmă afișat direct la fiecare firmă, fără click' },
]

export const APP_UPDATE = UPDATES[0].v
