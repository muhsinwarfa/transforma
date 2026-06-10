# Hogaan — Design System

> *"Be useful to society."*
> — the anchor of Hamse Warfa's leadership framework, drawn from his father's prayer.

**Hogaan Leadership** is an AI-powered leadership-coaching product founded by **Hamse Warfa** (former U.S. State Department senior advisor, BanQu co-founder). It's a *pocket coach for the moments leadership programs miss* — hard conversations, stalled decisions, team dynamics — delivered as a streaming text chat in the browser. The audience is managers, founders, and team leads who lack access to elite human-coaching budgets.

The whole product is built around Hamse's **12 Practices of Transformational Leadership**, grouped into four arenas of leadership:

| Arena | Practices |
|---|---|
| **Self** | Purpose · Integrity · Accountability |
| **Team** | Dignity · Empathy · Inclusion |
| **Organization** | Assets · Innovation · Prosperity |
| **Community** | Humility · Peace · Democracy |

Users sign in at **app.hogaanai.com**, complete a short onboarding (first name → years of leadership → pick the practices that resonate → consent), then converse with the coach. Sessions are saved (with a generated title) unless the user flips on **Private mode**. The coaching voice is warm + pragmatic, asset-based, and woven with Somali cultural framing where it lands. **It is leadership coaching only — not therapy, not crisis support.**

---

## Sources

This design system was reverse-engineered from the production codebase. The reader (human or agent) is encouraged to explore these further to build higher-fidelity Hogaan designs:

- **GitHub — `muhsinwarfa/hogaan`** (private): https://github.com/muhsinwarfa/hogaan
  - `web/src/styles/hogaan-base.css` — the token system + onboarding components (the source of truth for color, type, radius, shadow, motion).
  - `web/src/styles/hogaan-screens.css`, `hogaan-desktop.css`, `hogaan-sessions-profile.css`, `hogaan-mobile-polish.css` — auth, home, chat, sessions, profile screen styles.
  - `web/src/components/Icons.tsx`, `Primitives.tsx`, `HogaanWordmark.tsx`, `Nav.tsx` — the icon set, primitives, and brand mark.
  - `web/src/phases/*` — Home, Chat, Onboarding, Sessions, Profile, Login, Signup (UI structure + copy).
  - `web/src/phases/onboarding/data.ts` — the canonical 12-practice framework data.
  - `docs/voice-framework-workspace.md` — Hamse's voice rules (10), cultural framings (15), and 12 sample coaching responses. **The canonical voice source.**
  - `CLAUDE.md` — product context, shipped vs. roadmap, stack.

> Imported copies of the styles, components, and phases live under `web/src/` in this project for reference. The clean, distilled token file is **`colors_and_type.css`** at the project root.

---

## CONTENT FUNDAMENTALS

How Hogaan writes. The product voice (UI copy) and the coaching voice (the AI's responses) share a personality but differ in register.

### Tone & vibe
- **Warm and pragmatic, never fluffy.** Hamse genuinely cares *and* has run organizations. Never motivational-poster ("believe in yourself!") and never cold corporate ("optimize the stakeholder alignment matrix"). UI example: *"This is going to be hard, and I'm sorry it's on your shoulders. Now — here's what I've seen work."*
- **Calm, unhurried, human.** Headlines are statements, not slogans: *"What should we call you?"*, *"Welcome back."*, *"You're set, Amina."*
- **Honors complexity.** Copy refuses false binaries and doesn't oversell. The consent screen literally says *"I'm an AI, not a therapist."*

### Person & address
- **Second person, user-centered.** "You" is the hero; Hogaan is the guide. *"Your account, your practices, how Hogaan shows up."* The coach says *"you can do this"* not *"I would do this."*
- **First person for the product/coach** sparingly and warmly: *"Tell me what happened today…"*, *"I'm here and steady."*, *"Bring me a moment — anything on your mind."*
- **"We" for shared/account actions:** *"We'll have you in a conversation in 90 seconds."*, *"What should we call you?"*

### Casing & punctuation
- **Sentence case everywhere** — headlines, buttons, labels. Never Title Case in sentences. (`Start coaching`, `Create my account`, `New Chat` is the one product-noun exception.)
- **Eyebrows / meta labels are UPPERCASE** with wide tracking (+0.18em): `STEP 1 OF 3`, `LEADERSHIP`, `THIS WEEK`.
- **Em dashes — used liberally** for the conversational, thinking-aloud rhythm. *"Take your time with me — help me see the angles."*
- **Ellipses for in-progress states:** `Signing in…`, `Starting…`, `Opens automatically in a moment…`
- **Contractions always** (it's, you're, won't, we'd). Never stiff.
- Curly apostrophes in product copy (’).

### Coaching-voice rules (the AI's responses) — from `docs/voice-framework-workspace.md`
1. **"Useful to society" anchor** — connect the user's challenge to something larger, woven in, never preachy.
2. **Asset-based framing** — lead with what the user *has*, never what they lack. *"Your discomfort is itself useful information."*
3. **Story → Insight → Cultural framing → Action arc** — the action is non-negotiable; every response ends with something to *do*.
4. **Hero, not follower** — the user is the agent of change.
5. **Translate intangible → tangible** — "team isn't aligned" becomes "walk me through the first ten minutes of your Monday meeting."
6. **Lived experience, sparingly** — BanQu / refugee-camp / Minnesota anchors at most once per response.
7. **Somali language, sparingly + intentionally** — *sharaf* (honor/dignity), *naxariis* (principled compassion), *xeer*, *geed daad*, *maslaxad*, *aragti dheer*. Italicized, glossed on first use, at most once per response.
8. **Warm + pragmatic, never fluffy.**
9. **Honor complexity; don't force resolution** — *"there is no answer here that doesn't cost something."*
10. **Respect the user's time** — read on a phone; 4–7 short paragraphs (~150–300 words). Lead-ins like *"An insight:"* / *"A first move:"* are highlighted in blue-deep italics in the chat bubble.

### Emoji & symbols
- **No emoji.** None anywhere in the product or coaching voice.
- Unicode used structurally only: `·` (middot, as a separator in wordmark + meta rows), `→` (compose/submit arrow), `×` (delete). Quote marks `"` set large in cyan on the desktop auth brand panel.

---

## VISUAL FOUNDATIONS

A calm, cool-blue editorial system. Light, airy, trustworthy — the opposite of a hot, gamified chatbot.

### Color & vibe
- **Cool-blue surface stack.** Backgrounds are pale icy blues (`#eaf4ff` → `#c2dcf5`), cards are near-white blue-tinted paper (`#f4f9ff`), inputs sit on a recessed `#dcebfb`. Everything reads cool and serene.
- **Brand navy `#00004d`** is the primary ink (almost-black with a blue soul). **Brand blue `#0086ff`** is the single action color; **cyan `#00b7ff`** is a bright accent (glows, oversized quote marks). There is **no gold and no purple** — the codebase explicitly redirected legacy `--gold*` tokens to the blue family; treat any "gold" as **blue**.
- **Imagery vibe:** there is essentially no photography in the app — it's a clean, illustrative, type-and-token product. When imagery is needed, keep it cool-toned and light; avoid warm/saturated/grainy looks.

### Backgrounds
- **The hero gradient:** `linear-gradient(135deg, #eaf4ff 0%, #d6e8fa 50%, #c2dcf5 100%)` — used on the desktop auth brand panel, the onboarding celebrate screen.
- **Ambient stripe texture:** a *very* faint 45° `repeating-linear-gradient` of cyan at 2% opacity, layered over surfaces for subtle tooth.
- **Radial glow:** a soft blue radial at the top of the page stage (`radial-gradient(140% 80% at 50% -10% …)`), barely there.
- No full-bleed photos, no heavy gradients, no dark mode (a slate `#2a3554` is used *only* for Private-mode chrome).

### Type
- **Lexend Deca** for headings (weights 400/500/600) — humanist, friendly, slightly geometric. Headlines are **weight 500** (not bold) with **negative tracking** (-0.02em) for a calm editorial feel.
- **Inter** for body, labels, buttons (400–700). The wordmark "Hogaan" is Inter **700**.
- Italic Lexend Deca (blue-deep) marks coaching lead-ins and Somali words.
- `text-wrap: balance` on headlines, `text-wrap: pretty` on body.

### Spacing, radius, elevation
- **Radii:** chips/pills/avatars `999px`, buttons + inputs `12px`, cards/panels `20px`, hero/brand `28px`. Smaller tiles (practice tiles, chat chips) use `14–18px`.
- **Shadows** are soft, low-opacity, and **navy-tinted** (`rgba(0,0,77,…)`), never gray/black. Three steps: `sm` (resting cards), `md` (hover), `lg` (the phone device frame / modals). Filled-blue buttons add a colored glow: `0 6px 16px rgba(0,134,255,0.28)`.
- **Hairlines** are navy at 8% (`--hairline`) / 18% (`--hairline-strong`) — never pure gray borders.
- **Focus ring:** `0 0 0 3px rgba(0,134,255,0.30)` — a soft blue halo.

### Cards
Blue-tinted paper (`--paper`), `20px` radius, a 1px navy-8% hairline, and a whisper-soft shadow (`0 1px 0 rgba(0,0,77,0.02)` at rest). On hover they lift to `--shadow-md` and the border warms toward `--hairline-strong` or blue-light. No colored left-border accents, no heavy drop shadows.

### Buttons & states
- **Primary CTA:** filled `--blue`, white text (weight 600), `12px` radius, blue glow shadow. **Hover → `--blue-deep`** (darker, not lighter). **Active → `transform: scale(0.985)`** (a tiny press). **Disabled →** navy-8% fill, `--ink-3` text, no shadow.
- **Secondary / ghost:** transparent, `--ink-2` text → darkens to `--ink-1` with a navy-4% wash on hover.
- **Outline buttons** (sign out, load more, empty-state CTA): 1px blue border, blue-deep text, `--tint-blue` wash on hover.
- **Pills/chips:** `--tint-blue` fill, blue-deep text, blue-light border.
- **Selected state:** blue border + `--tint-blue` fill + inset blue ring; confirming/active selection flips to **solid blue with white text**.

### Motion
- One easing curve everywhere: **`cubic-bezier(0.2, 0.7, 0.2, 1)`** (a gentle, slightly-overshoot ease-out).
- Durations: `180ms` (fast — hovers, toggles), `300ms` (default — screen transitions), `480ms` (slow).
- **Fades + short directional slides**, never bounces. Onboarding screens slide ±20% horizontally with a fade; phases fade-up 8px. The celebrate mark scales in from 0.6. Typing indicator is three dots with a staggered translateY. Everything respects `prefers-reduced-motion: reduce`.

### Layout
- **Mobile-first, in a phone device frame.** On desktop the app frame becomes a centered phone with an `8px solid #0d0d22` outline + `36px` radius + `--shadow-lg`; below 1024px on the marketing/app stage it sits in a letterboxed stage. At ≥1024px the app goes **full-bleed** with a left sidebar (and chat gains left "Sessions" + right "Practices in focus" rails).
- **Transparency / blur:** used sparingly — toasts and the navy chips use solid fills; private-mode banner is solid slate. No glassmorphism.

---

## ICONOGRAPHY

- **Hand-drawn line icons, no icon library.** Every icon in the app is an inline SVG hand-authored in `web/src/components/Icons.tsx` to keep the bundle lean and match the prototype exactly. There is no icon font, no Lucide/Heroicons dependency, no PNG icons.
- **Style spec:** 24×24 viewBox (nav icons render at 22px), `fill="none"`, `stroke="currentColor"`, **stroke-width 1.6–1.9** (most are 1.7), `stroke-linecap="round"`, `stroke-linejoin="round"`. They inherit text color via `currentColor`, so they tint with whatever context they sit in (ink, blue, white-on-blue).
- **The set** (copied into `assets/hogaan-icons.js` as a reusable vanilla module): back, arrow, check, close, menu, search, mic, send, moon (private), bookmark (saved), spark (suggestions), shield (crisis), envelope, edit, download, eye/eye-off (password), and the three nav glyphs home / sessions (clock) / profile. The active home nav icon fills with `currentColor` at 12% opacity.
- **No emoji, ever.** Structural Unicode only: `·` `→` `×` and large `"` quote marks (cyan) on the desktop auth panel.
- **Logo / wordmark:** there is no image logo. The brand mark is **typographic** — `Hogaan` (Inter 700, navy) + a 4px blue dot + `LEADERSHIP` (Inter 600, uppercase, +0.22em tracking, `--ink-3`). Recreated in `assets/hogaan-icons.js`-adjacent components and in the UI kit.

> To reuse icons in a new design: `<script src="assets/hogaan-icons.js"></script>` then `el.innerHTML = HogaanIcon('send', { size: 20 })`.

---

## Index — what's in this folder

| Path | What it is |
|---|---|
| `README.md` | This file — product context, content + visual foundations, iconography. |
| `colors_and_type.css` | Distilled, documented CSS variables (color, type, radius, shadow, motion) + semantic type tokens. **Import this into new designs.** |
| `SKILL.md` | Agent-Skills-compatible entry point for generating Hogaan designs. |
| `assets/hogaan-icons.js` | The full hand-drawn icon set as a vanilla JS module (`HogaanIcon(name, opts)`). |
| `preview/` | Design-system specimen cards (color, type, components) shown in the Design System tab. |
| `ui_kits/app/` | High-fidelity, interactive recreation of the Hogaan coaching app (login → onboarding → home → chat → sessions → profile). See its own `README.md`. |
| `web/src/` | Imported reference copies of the real codebase's styles, components, and phases. |

### UI kits
- **`ui_kits/app/`** — the Hogaan leadership-coaching web app. Auth, onboarding, home, streaming chat, sessions, profile. Mobile-frame and desktop layouts.

No slide template was provided in the source, so no `slides/` were created.

---

## Caveats / substitutions
- **Fonts:** Lexend Deca and Inter are both Google Fonts (the app loads them from the Google Fonts CDN). No substitution was needed — these designs reference the exact families via the Google Fonts CDN. For fully-offline use, download the WOFF2 files into a `fonts/` folder and swap the `<link>` for a local `@font-face`.
- **No raster/vector brand assets** exist in the repo — the logo is pure CSS/type and all icons are inline SVG, so there was nothing to copy into `assets/` beyond recreating them in code.
- The coaching responses shown in the UI kit are lifted/adapted from the real production corpus in `docs/voice-framework-workspace.md` so the voice is authentic.
