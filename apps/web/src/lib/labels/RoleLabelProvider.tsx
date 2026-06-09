"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { StructuralRole } from "@transforma/db";
import type { RoleLabels } from "./roleLabel";

const RoleLabelContext = createContext<RoleLabels | null>(null);

/** Injected once in the root layout with the server-resolved labels. */
export function RoleLabelProvider({ labels, children }: { labels: RoleLabels; children: ReactNode }) {
  return <RoleLabelContext.Provider value={labels}>{children}</RoleLabelContext.Provider>;
}

export function useRoleLabels(): RoleLabels {
  const ctx = useContext(RoleLabelContext);
  if (!ctx) throw new Error("useRoleLabels must be used within RoleLabelProvider");
  return ctx;
}

function pluralizeWord(word: string): string {
  return word.endsWith("s") ? word : `${word}s`;
}

/**
 * Render a tenant-configured role word in a client component. Server components
 * read `resolveLabels()` directly. No role word is ever a literal in UI code.
 */
export function RoleLabel({ role, plural }: { role: StructuralRole; plural?: boolean }) {
  const labels = useRoleLabels();
  const word = labels[role];
  return <>{plural ? pluralizeWord(word) : word}</>;
}
