// Auth-lane icons. IcoEye (password show/hide) and IcoMail (forgot-sent mark)
// are used by the auth prototype but are NOT yet in the shared atom set
// (apps/web/src/components/atoms/icons.tsx is frozen — Lane 0 owns it). Ported
// verbatim from docs/design/prototype/icons.jsx so the markup matches exactly.
// REQUEST FILED to Lane 0: promote IcoEye + IcoMail into the shared atoms and
// import them from "@/components/atoms" here once available.
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

export const IcoMail = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3.5 7l8.5 6 8.5-6" />
  </Svg>
);

export const IcoEye = (p: IconProps) => (
  <Svg {...p}>
    {p.off ? (
      <>
        <path d="M2 12s3.5-7 10-7c2.3 0 4.2.8 5.8 1.9" />
        <path d="M22 12s-3.5 7-10 7c-2.3 0-4.2-.8-5.8-1.9" />
        <path d="M3 3l18 18" />
      </>
    ) : (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </Svg>
);
