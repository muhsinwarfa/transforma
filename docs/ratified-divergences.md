# Transforma — Ratified divergences & trim register

Every entry here is a deliberate, signed-off difference between the shipped app and an
earlier state of the design prototype. **Rule:** any control removed from the app is removed
from `docs/design/prototype` in the same change, so the pixel matrix keeps one ground truth.

---

## Pre-deploy control trim (2026-06-10)

Source: the control sweep against `docs/Transforma_User_Story_Map.md` (142 controls classified;
adversarial KEEP-biased re-check of every candidate). Verdicts approved by Muhsinka. Each item
below was applied to **both** the app and the prototype.

### Removed — DEAD (inert / no-op chrome, served no story)
| # | Control | App | Prototype |
|---|---|---|---|
| 1 | Login footer "Contact your administrator" (empty `mailto:`) | `app/(auth)/login/LoginForm.tsx` (footer prop) | `prototype/auth.jsx` LoginScreen footer |
| 2 | Header **Search** icon (no handler; no search feature) | `components/shell/AppShell.tsx` header-right | `prototype/shell.jsx` AppHeader |
| 3 | Header **Notifications** bell (no handler; no notifications backend) | `components/shell/AppShell.tsx` header-right | `prototype/shell.jsx` AppHeader |
| 4 | User-menu **"Account settings"** (no handler; no account route) | `components/shell/AppShell.tsx` UserMenu | `prototype/shell.jsx` UserMenu |
| 5 | Home task-card **"More options" ⋯** (only `stopPropagation`; opened nothing) | `components/home/HomeHub.tsx` TaskCard | `prototype/home.jsx` TaskCard |

### Removed — DEMO-ONLY (simulators / demo shims)
| # | Control | App | Prototype |
|---|---|---|---|
| 6 | Roster **"Simulate a clean file"** (+ `SAMPLE_CLEAN` const) | `components/admin/RosterImport.tsx` | `prototype/admin.jsx` AdminRoster |
| 7 | Roster **"Simulate a file with errors"** (+ `SAMPLE_ERRORS` const) | `components/admin/RosterImport.tsx` | `prototype/admin.jsx` AdminRoster |
| 8 | Forgot-sent **"Open the reset link (demo)"** — prototype-only (already absent in app) | (none) | `prototype/auth.jsx` ForgotSent |

### Fixed — made the control honest (designed intent, not removed)
| # | Control | Change | App | Prototype |
|---|---|---|---|---|
| 9 | Cycle-setup **Cancel** | Was a phantom toast that discarded nothing. Now genuinely reverts every field to the last-saved (seed) values; toast tells the truth ("Reverted to your last saved settings."). Story **A1** AC updated. | `components/admin/CycleSetupForm.tsx` | `prototype/admin.jsx` CycleSetup (now controlled inputs) |
| 10 | Roster import **"Confirm & add to cycle"** | Was a toast over an already-committed import. Now real two-phase: a read-only `validateRoster` renders a **preview** (zero DB writes); the existing `importRoster` (insert + `roster_imported` audit, write path unchanged) fires **only** on Confirm; confirmed copy = "N people imported to {cycle}". Validating animation retained. Story **A3** AC updated. | `components/admin/RosterImport.tsx` + `app/(app)/admin/actions.ts` (`validateRoster` split out front; `importRoster` unchanged) | `prototype/admin.jsx` AdminRoster (preview → confirmed) |

### Kept after adversarial review (rescued — recorded so they are not re-flagged)
- **SSO "Continue with single sign-on" (disabled)** — contract-sanctioned future placeholder (`contract-map.md`); intentionally inert.
- **"Show role tokens" toggle** — the only control that reveals the `{token}` annotations; serves A4's "token annotations visible" AC.
- **"Upload another"** (roster success) — real state reset to import a second batch.
- **Auth brand panel** — non-interactive brand surface (X4).

---

## Standing schema/scope divergences (backlog)

- **D2 — peer relation line → department-only.** The prototype shows a relation line; the schema
  has no `relation` column, so the peer request/list render department only. Backlog schema gap.
- **B3 — admin resend-invite → omitted.** The token-table write is outside the presentation
  fence; the "ask your administrator" copy is kept. Backlog.
