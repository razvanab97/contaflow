import type { DocumentTemplate } from './types'

// Schema documentului "Raport lunar" (proiect european) - descrie STRUCTURA (sectiuni/campuri),
// nu valorile. Ordinea sectiunilor reflecta ordinea reala din sablonul Word (detectata dupa
// text-ancora in lib/docxRaportTemplate.ts) - nu e liber reordonabila, pentru ca ar strica
// corespondenta cu documentul generat.
export const RAPORT_LUNAR_TEMPLATE: DocumentTemplate = {
  id: 'raport-lunar-proiect',
  title: 'Raport lunar',
  description: 'Raport de implementare lunar pentru proiectul european',
  allowCustomSections: false, // generatorul DOCX nu suporta inca sectiuni noi arbitrare
  sections: [
    {
      id: 'perioada',
      title: 'Perioada de raportare',
      collapsible: false,
      fields: [{ id: 'perioada', key: 'perioada', label: 'Perioadă', type: 'date-range' }],
    },
    {
      id: 'autorizatii',
      title: 'Autorizații necesare',
      description: 'O linie per autorizație',
      collapsible: true,
      fields: [{ id: 'autorizatii', key: 'autorizatii', label: 'Autorizații', type: 'list' }],
    },
    {
      id: 'obiective',
      title: 'Obiective realizate în lună',
      description: 'O linie per obiectiv',
      collapsible: true,
      fields: [{ id: 'obiective', key: 'obiective', label: 'Obiective', type: 'list' }],
    },
    {
      id: 'activitati',
      title: 'Activități derulate în lună',
      description: 'O linie per activitate',
      collapsible: true,
      fields: [{ id: 'activitati', key: 'activitati', label: 'Activități', type: 'list' }],
    },
  ],
}
