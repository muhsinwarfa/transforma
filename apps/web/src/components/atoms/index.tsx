import type { ButtonHTMLAttributes, ReactNode } from "react";
import { IcoFlag, IcoLock } from "./icons";

// Canonical review status → display label + CSS class. The contract status
// `awaiting-acknowledgement` maps to the design's `awaiting-ack` style class.
const STATUS_DISPLAY: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "draft" },
  "in-review": { label: "In review", cls: "in-review" },
  "awaiting-acknowledgement": { label: "Awaiting acknowledgement", cls: "awaiting-ack" },
  locked: { label: "Locked", cls: "locked" },
  flagged: { label: "Flagged", cls: "flagged" },
};

export function StatusBadge({ status, sm }: { status: string; sm?: boolean }) {
  const s = STATUS_DISPLAY[status] ?? STATUS_DISPLAY.draft!;
  return (
    <span className={`badge ${s.cls} ${sm ? "sm" : ""}`.trim()}>
      {status === "locked" ? (
        <IcoLock s={sm ? 11 : 12} sw={1.8} />
      ) : status === "flagged" ? (
        <IcoFlag s={sm ? 11 : 12} sw={1.8} />
      ) : (
        <span className="dot" />
      )}
      {s.label}
    </span>
  );
}

export function Avatar({ name, initial, cls = "" }: { name?: string; initial?: string; cls?: string }) {
  const init =
    initial ||
    (name
      ? name
          .split(" ")
          .map((w) => w[0])
          .slice(0, 2)
          .join("")
      : "?");
  return (
    <span className={`avatar ${cls}`.trim()} aria-hidden="true">
      {init}
    </span>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "destructive";

export function Button({
  variant = "primary",
  lg,
  sm,
  className = "",
  children,
  ...rest
}: { variant?: ButtonVariant; lg?: boolean; sm?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = `btn btn-${variant} ${lg ? "lg" : ""} ${sm ? "sm" : ""} ${className}`.replace(/\s+/g, " ").trim();
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}

export function Card({ pad, className = "", children }: { pad?: boolean; className?: string; children: ReactNode }) {
  return <div className={`card ${pad ? "pad" : ""} ${className}`.replace(/\s+/g, " ").trim()}>{children}</div>;
}

export function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label} {required ? <span className="req">*</span> : null}
      </label>
      {hint ? <span className="field-hint">{hint}</span> : null}
      {children}
    </div>
  );
}

export * from "./icons";
