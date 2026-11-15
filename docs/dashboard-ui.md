# Factory dashboard — UI design system

The single design reference for the factory dashboard (`plugins/factory/dashboard/`). Look: deep
forest green for trust, one lime accent for the one thing that needs attention, warm off-white
canvas, soft rounded cards, flat surfaces, Inter-style type. Light and dark are both first-class.

Build to the tokens and rules here. A raw hex value or pixel font size inside a component, instead
of a token, is a review failure.

## 1. Principles

1. **Run status is the hero.** The biggest thing on screen is the state of the selected run (the
   active stage, or its outcome), and it always says what state it is in.
2. **One lime element per screen.** Lime marks the single live thing: the stage that is working
   now. If two things are lime, one is wrong.
3. **Outcomes are stated in words.** Passed, failed, working, stopped — never colour alone.
4. **Calm by default.** Neutral surfaces and green. Amber means "act soon", red means "a problem".
5. **Say it plainly.** Short labels, real numbers, dates and durations instead of adjectives.
6. **Desktop first, never broken on mobile.** The dashboard is mostly used on a laptop beside the
   terminal; it must still work at 360 px.

## 2. Colour tokens

Components use semantic tokens only, defined as CSS variables and switched by `data-theme` on the
root element.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `bg-canvas` | `#F4F3EF` | `#0A0F0D` | Page background |
| `bg-surface` | `#FFFFFF` | `#141A17` | Cards, sidebar |
| `bg-sunken` | `#E9E8E3` | `#1C2320` | Stage chips, neutral pills, hover |
| `bg-brand` | `#163832` → `#0B2B26` | `#163832` → `#051F20` | Hero run card only (150° gradient — the only gradient allowed) |
| `bg-tint` | `#E3EFE5` | `#1C2A24` | Selected item, "passed" pills, empty-state icon circle |
| `border` | `#E7E6E1` | `#232B27` | Dividers; card outlines in dark mode |
| `border-control` | `#858C87` | `#66726C` | Input and toggle outlines (3:1) |
| `text-primary` | `#0E1512` | `#EEF2EE` | Headings, numbers, body |
| `text-secondary` | `#5F6762` | `#8A958F` | Labels, captions, table headers |
| `text-on-brand` / `-muted` | `#FFFFFF` / `#B7CFC0` | same | Text on `bg-brand` |
| `text-tint` | `#163832` | `#C8F169` | Text on `bg-tint` |
| `action-accent` / `on-action-accent` | `#C8F169` / `#0E1A06` | same | The one lime element |
| `warning-bg` / `warning-text` | `#FBEFD2` / `#7A5410` | `#3A2E12` / `#F2D28B` | Waiting for a person, retries |
| `danger-bg` / `danger-text` | `#FDECEA` / `#B42318` | `#3A1512` / `#F97066` | Verify failed, blocked |
| `focus-ring` | `#235347` | `#C8F169` | 2 px focus outline, 2 px offset |

Rules: lime is a fill, never text on light surfaces (it fails contrast on white). Green means
brand and "good"; there is no separate success colour.

## 3. Typography

- Stack: `Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. The dashboard has no
  dependencies, so Inter is used when installed and the system font otherwise.
- `font-variant-numeric: tabular-nums` on every count, time, duration and table number.
- Sentence case everywhere. Nothing below 11 px; text people read is 14 px or larger.

| Style | Size / line | Weight | Use |
| --- | --- | --- | --- |
| `display-l` | 40 / 44, −0.045em | 700 | Hero: active stage or outcome |
| `display-s` | 24 / 30, −0.03em | 700 | Stat cards |
| `title-l` | 22 / 28, −0.03em | 800 | Page title (project name) |
| `title-m` | 18 / 24 | 700 | Run title on the hero |
| `title-s` | 16 / 22 | 700 | Card titles |
| `body` | 15 / 22 | 400 | Body |
| `body-s` | 14 / 20 | 400 / 600 | Table cells, timeline rows, sidebar items |
| `caption` | 12 / 16 | 500 | Labels, table headers, pills |

## 4. Layout

| Foundation | Rule |
| --- | --- |
| Grid | 4 px base. Spacing 4, 8, 12, 16, 20, 24, 32 |
| Radius | 8 small, 16 chips and rows, 24 cards, full for pills and buttons |
| Elevation | None on cards; depth comes from canvas → surface → sunken |
| Touch targets | 44 × 44 px minimum |
| Motion | 120 ms ease-out fades on hover only; none under `prefers-reduced-motion` |

| Width | Layout |
| --- | --- |
| 1200 px and up | 240 px sidebar + 12-column bento, 16 px gaps, max content width 1,280 px |
| 768–1199 px | Sidebar stays; hero and lists span full width, stat cards two per row |
| Under 768 px | Sidebar stacks above content; one column |

**Bento:** the hero run card is the largest tile (6 columns, 2 rows). Four stat cards sit beside
it. Below: pipeline (full width), then runs table and timeline side by side.

## 5. Components

| Component | Spec |
| --- | --- |
| Hero run card | `bg-brand`, radius 24: caption ("Latest run"), run title (`title-m`), active stage or outcome (`display-l`), status pill, meta line (start, duration, implementer passes) |
| Stat card | `bg-surface`, radius 24, caption label, one `display-s` number. One number per card |
| Stage chip | `bg-sunken`, radius 16: agent name, status pill, run count |
| Status pill | 24 px, full radius, `caption` weight 600, always a word |
| Data table | Caption headers, 52 px rows, 1 px dividers, numbers right-aligned; rows selectable by click and Enter |
| Timeline row | Time · agent · what happened, one line |
| Sidebar item | 44 px pill; selected = `bg-tint` with `text-tint` |
| Icon button | 44 px circle, `bg-surface`, always an accessible name |
| Empty state | Tint circle, one title, one line telling the person what to run |

Every interactive element has hover, focus-visible (focus ring) and selected states.

## 6. Status mapping

| Situation | Label | Pill |
| --- | --- | --- |
| Run in progress (hero) | Running | On-brand (14% white on `bg-brand`) |
| Run in progress (runs table) | Running | Neutral |
| Session paused or finished | Stopped | Tint |
| A verify gate gave up | Verify failed | Danger |
| Stage working now | Working | Accent (lime) — the one lime element |
| Stage passed verify | Verify passed | Tint |
| Stage finished, no gate | Done | Tint |
| Stage not reached | Not started | Neutral |
| Verify failed, agent sent back | (timeline) "Verify failed, sent back (attempt n)" | — |

## 7. Voice and formatting

- Plain words: "Implementer finished · verify passed", not "SubagentStop event received".
- Times: `14 Nov, 9:30 pm` (12-hour, lower-case am/pm, local time). Durations: `12 min`, `1 h 5 min`.
- Empty states invite the next action: "Run /factory:init in a project, then /factory:feature."

## 8. Accessibility

- WCAG 2.1 AA in both modes. All token pairs above pass 4.5:1 for text and 3:1 for control
  outlines; lime on white (1.3:1) is never used for text.
- Keyboard: every control reachable, visible focus ring, table rows selectable with Enter.
- Theme follows the device; the header switch overrides it and is remembered in the browser.
- Text zooms to 200% without loss; nothing relies on hover alone.
