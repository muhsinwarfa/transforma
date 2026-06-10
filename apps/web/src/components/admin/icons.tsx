// Admin-lane local icons. The shared atoms set (Lane 0, FROZEN) is missing a few
// glyphs the admin prototype uses (IcoReports, IcoSwitch, IcoUpload, IcoCsv).
// Rather than edit the frozen atoms file, these are defined locally with the
// design's verbatim SVG paths (docs/design/prototype/icons.jsx) so the rendering
// is pixel-faithful. IcoUsers is intentionally NOT redefined — its path is
// identical to the shared IcoRoster, which we reuse directly. If these are added
// to the shared atoms, delete this file and import from "@/components/atoms".
import type { ReactNode } from "react";
import type { IconProps } from "@/components/atoms/icons";

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

export const IcoReports = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h16" />
    <rect x="6" y="11" width="3.2" height="6" rx="0.8" />
    <rect x="11.4" y="7" width="3.2" height="10" rx="0.8" />
    <rect x="16.8" y="13" width="3.2" height="4" rx="0.8" />
  </Svg>
);

export const IcoSwitch = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4L3 8l4 4" />
    <path d="M3 8h13a4 4 0 0 1 4 4" />
    <path d="M17 20l4-4-4-4" />
    <path d="M21 16H8a4 4 0 0 1-4-4" />
  </Svg>
);

export const IcoUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 16V5M7 10l5-5 5 5" />
    <path d="M4 20h16" />
  </Svg>
);

export const IcoCsv = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4" />
    <path d="M8 13h1.5M8 17h1.5M13 13l2.5 4M15.5 13L13 17" />
  </Svg>
);
