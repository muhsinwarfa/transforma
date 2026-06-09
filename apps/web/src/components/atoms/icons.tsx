// Transforma icon set — Hogaan hand-drawn line style, ported from the prototype
// (24x24, fill none, stroke currentColor, round caps/joins). Typed for React.
import type { ReactNode } from "react";

export interface IconProps {
  s?: number;
  sw?: number;
  active?: boolean;
  off?: boolean;
}

function Svg({ s = 22, sw = 1.7, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

// nav / structural
export const IcoHome = (p: IconProps) => (
  <Svg {...p}>
    <path
      d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2v-9z"
      fill={p.active ? "currentColor" : "none"}
      fillOpacity={p.active ? 0.12 : 0}
    />
  </Svg>
);
export const IcoReview = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4h6a1 1 0 0 1 1 1v1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h2V5a1 1 0 0 1 1-1z" />
    <path d="M9 12l2 2 4-4" />
  </Svg>
);
export const IcoPeer = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
    <path d="M8 9.5h8M8 12.5h5" />
  </Svg>
);
export const IcoApprovals = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4h16v9a2 2 0 0 1-2 2h-5l-3 3v-3H6a2 2 0 0 1-2-2V4z" />
    <path d="M9 9l2 2 4-4" />
  </Svg>
);
export const IcoCycles = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 9h17M8 3.5v3M16 3.5v3" />
    <path d="M8 13l2.2 2.2L15 11" />
  </Svg>
);
export const IcoRoster = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <path d="M16 6.2a3 3 0 0 1 0 5.6" />
    <path d="M17.5 19a5.5 5.5 0 0 0-3-4.9" />
  </Svg>
);

// chrome
export const IcoBell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </Svg>
);
export const IcoSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Svg>
);
export const IcoMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </Svg>
);
export const IcoClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M6 18L18 6" />
  </Svg>
);
export const IcoChevDown = (p: IconProps) => (
  <Svg {...p} sw={p.sw || 2}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);
export const IcoChevLeft = (p: IconProps) => (
  <Svg {...p} sw={p.sw || 2}>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
);
export const IcoArrowRight = (p: IconProps) => (
  <Svg {...p} sw={p.sw || 2}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
export const IcoSettings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V20a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);
export const IcoLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
    <path d="M16 16l4-4-4-4M20 12H10" />
  </Svg>
);
export const IcoUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
);
export const IcoClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

// status / feedback
export const IcoCheck = (p: IconProps) => (
  <Svg {...p} sw={p.sw || 2.4}>
    <path d="M4 12l5 5L20 6" />
  </Svg>
);
export const IcoCheckCircle = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12l2.5 2.5L16 9" />
  </Svg>
);
export const IcoLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="9" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none" />
  </Svg>
);
export const IcoFlag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 21V4" />
    <path d="M5 4.5h11l-2 3.5 2 3.5H5" />
  </Svg>
);
export const IcoAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l9.5 16.5H2.5L12 3z" />
    <path d="M12 10v4M12 17.5h.01" />
  </Svg>
);
export const IcoInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);
export const IcoSpinner = (p: IconProps) => (
  <svg className="spinner" width={p.s || 22} height={p.s || 22} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2.6" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);
export const IcoDoc = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h8l4 4v14H6V3z" />
    <path d="M14 3v4h4" />
    <path d="M8.5 12h7M8.5 15.5h7M8.5 19h4" />
  </Svg>
);
export const IcoEdit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4l10-10a2 2 0 0 0-2.8-2.8L5 17.5 4 20z" />
    <path d="M13.5 6.5l4 4" />
  </Svg>
);
export const IcoShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    <path d="M9 11.5l2 2 4-4" />
  </Svg>
);
export const IcoDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v11M7 11l5 5 5-5" />
    <path d="M5 20h14" />
  </Svg>
);
export const IcoSaved = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M8 4v5h7" />
    <path d="M9 14.5l2 2 4-4" />
  </Svg>
);
