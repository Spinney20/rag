/* Icons — minimal, 1.5px stroke. Built locally to avoid lucide dep. */

const Icon = ({ name, size = 16, className = "", strokeWidth = 1.5 }) => {
  const paths = ICONS[name];
  if (!paths) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon ${className}`}
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
};

const ICONS = {
  home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11h14V9"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  folder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></>,
  file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></>,
  check: <><path d="M4 12l5 5L20 6"/></>,
  x: <><path d="M6 6l12 12M18 6L6 18"/></>,
  warn: <><path d="M12 3 2 20h20z"/><path d="M12 10v5M12 18h0"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 8h0M11 12h1v4h1"/></>,
  chevronR: <><path d="M9 6l6 6-6 6"/></>,
  chevronD: <><path d="M6 9l6 6 6-6"/></>,
  chevronL: <><path d="M15 6l-6 6 6 6"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></>,
  play: <><path d="M6 4 20 12 6 20z"/></>,
  pause: <><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></>,
  upload: <><path d="M12 15V4M6 10l6-6 6 6"/><path d="M4 20h16"/></>,
  download: <><path d="M12 4v13M6 11l6 6 6-6"/><path d="M4 21h16"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></>,
  edit: <><path d="M14 4l6 6-10 10H4v-6z"/></>,
  book: <><path d="M4 4h8a4 4 0 0 1 4 4v12M4 4v14a2 2 0 0 0 2 2h10"/><path d="M16 4h4v14h-4"/></>,
  grid: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
  layers: <><path d="M12 3 2 8l10 5 10-5z"/><path d="m2 13 10 5 10-5M2 18l10 5 10-5"/></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h0M3 12h0M3 18h0"/></>,
  filter: <><path d="M3 4h18l-7 9v6l-4 2v-8z"/></>,
  arrowR: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  arrowL: <><path d="M19 12H5M11 6l-6 6 6 6"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  sparkle: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l3 3M15 15l3 3M6 18l3-3M15 9l3-3"/></>,
  gauge: <><path d="M12 13v-3"/><path d="M8 20h8a8 8 0 1 0-8 0z"/></>,
  cpu: <><rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></>,
  link: <><path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1"/><path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/></>,
  quote: <><path d="M7 7h4v4c0 3-1 5-4 6"/><path d="M15 7h4v4c0 3-1 5-4 6"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.5-2.4.9a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.4a7 7 0 0 0-2 1.2L5 5.7l-2 3.5 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.5 2.4-.9a7 7 0 0 0 2 1.2L10 21h4l.5-2.4a7 7 0 0 0 2-1.2l2.4.9 2-3.5-2-1.6c.1-.4.1-.8.1-1.2z"/></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
  flag: <><path d="M4 21V4h12l-2 4 2 4H4"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3a4 4 0 0 1 0 7.7"/></>,
  bolt: <><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></>,
  circleDot: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2" fill="currentColor"/></>,
  dotGrid: <><circle cx="5" cy="5" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="19" cy="5" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="19" r="1"/><circle cx="12" cy="19" r="1"/><circle cx="19" cy="19" r="1"/></>,
  shield: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/></>,
};

Object.assign(window, { Icon });
