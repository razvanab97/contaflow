// Set unic de iconite (stil linie, 24x24, stroke 1.75) - toata navigatia/shell-ul le foloseste
// pe acestea, ca sa nu mai coexiste SVG-uri desenate diferit (grosimi/marimi variabile) in
// fiecare componenta.
const PATHS: Record<string, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>,
  home: <><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9v11h14V9"/></>,
  calendar: <><rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  close: <path d="M18 6L6 18M6 6l12 12"/>,
  chevronDown: <path d="M6 9l6 6 6-6"/>,
  chevronRight: <path d="M9 6l6 6-6 6"/>,
  chevronLeft: <path d="M15 6l-6 6 6 6"/>,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6"/>,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6"/>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5"/>,
  download: <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/></>,
  users: <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.5a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-4-6"/></>,
  idCard: <><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16a3 3 0 016 0M14.5 10h4M14.5 13.5h3"/></>,
  fileText: <><path d="M14 3H6.5A1.5 1.5 0 005 4.5v15A1.5 1.5 0 006.5 21h11a1.5 1.5 0 001.5-1.5V8z"/><path d="M14 3v5h5M8.5 13h7M8.5 16.5h5"/></>,
  link: <><path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1-1"/></>,
  bank: <><path d="M3 9.5L12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18"/></>,
  inbox: <><path d="M3 13l2.5-7.5A1.5 1.5 0 016.9 4.5h10.2a1.5 1.5 0 011.4 1L21 13"/><path d="M3 13v5.5A1.5 1.5 0 004.5 20h15a1.5 1.5 0 001.5-1.5V13h-5.5l-1.5 2.5h-5L7.5 13z"/></>,
  alert: <><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16v.5"/></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/></>,
  send: <><path d="M21 3L10 14"/><path d="M21 3l-6.5 18-4.5-7-7-4.5z"/></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0115 5v2M3 12.5h18"/></>,
  folder: <path d="M3 7a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>,
  fuel: <><path d="M4 21V5a2 2 0 012-2h6a2 2 0 012 2v16M3 21h12M7 8h4"/><path d="M14 11h2a2 2 0 012 2v3a1.5 1.5 0 003 0V8l-3-3"/></>,
  percent: <><path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/></>,
  cart: <><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2.5 3.5h3l2.4 11.2a1.5 1.5 0 001.5 1.3h8.3a1.5 1.5 0 001.5-1.2L21 7H6.2"/></>,
  bed: <><path d="M3 18V6M3 13h18v5M21 13v-2a3 3 0 00-3-3h-7v5"/><circle cx="7" cy="10" r="2"/></>,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>,
  repeat: <><path d="M17 2.5l3 3-3 3"/><path d="M4 11V9.5a4 4 0 014-4h12M7 21.5l-3-3 3-3"/><path d="M20 13v1.5a4 4 0 01-4 4H4"/></>,
  package: <><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/></>,
  moon: <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/>,
  monitor: <><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  glass: <><path d="M4 4h16v5.5a8 8 0 01-16 0z"/><path d="M8 4v4.5M16 4v4.5"/></>,
  grip: <><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></>,
  ban: <><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></>,
  undo: <><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/></>,
  sparkles: <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z"/></>,
  history: <><path d="M3.5 12a8.5 8.5 0 102.5-6L3.5 8.5"/><path d="M3.5 3.5v5h5M12 7.5V12l3 2"/></>,
}

export type IconName = keyof typeof PATHS

export default function Icon({ name, size = 16, strokeWidth = 1.75, style, className }: {
  name: string; size?: number; strokeWidth?: number; style?: React.CSSProperties; className?: string
}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" style={{ flexShrink: 0, ...style }} className={className}
    >
      {PATHS[name] ?? PATHS.fileText}
    </svg>
  )
}

// Iconita reprezentativa pentru fiecare modul lunar - folosita in sidebar si in hub.
export const MODULE_ICONS: Record<string, string> = {
  'extras': 'bank',
  'angajati': 'users',
  'acte-contabile': 'folder',
  'dispozitie-plata': 'send',
  'facturi-chitanta': 'receipt',
  'facturi-restante': 'alert',
  'inbox-facturi': 'inbox',
  'raport-lunar': 'chart',
  'emag': 'cart',
  'trendyol': 'package',
  'booking-facturi': 'bed',
  'booking-borderou': 'bed',
  'airbnb-facturi': 'home',
  'airbnb-borderou': 'home',
  '5stardesk': 'star',
  'bonuri': 'fuel',
  'impozite': 'percent',
  'raport-lunar-proiect': 'fileText',
  'obligatii-recurente': 'repeat',
  'achizitii': 'briefcase',
  'mail-contabil': 'mail',
}
