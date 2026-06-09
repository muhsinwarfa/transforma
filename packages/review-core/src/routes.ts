/**
 * No-post-lock-correction (non-negotiable #2) is STRUCTURAL: there must be no
 * route that edits/corrects/supersedes/appeals/unlocks a locked review anywhere
 * in the API surface. The route-manifest test feeds the app's real route list to
 * `findForbiddenRoutes` and asserts it is empty.
 */
export const FORBIDDEN_LOCKED_ROUTE_PATTERNS: readonly RegExp[] = [
  /\bcorrection?\b/i,
  /\bsupersed/i,
  /\bappeal/i,
  /\bamend/i,
  /\bunlock/i,
  /\bedit-locked\b/i,
  /\breopen\b/i,
];

export function findForbiddenRoutes(routes: readonly string[]): string[] {
  return routes.filter((r) => FORBIDDEN_LOCKED_ROUTE_PATTERNS.some((re) => re.test(r)));
}

export function assertNoPostLockMutationRoutes(routes: readonly string[]): void {
  const bad = findForbiddenRoutes(routes);
  if (bad.length > 0) {
    throw new Error(
      `Post-lock mutation routes must not exist (non-negotiable #2): ${bad.join(", ")}`,
    );
  }
}
