# Design direction

One direction, chosen for how this app is actually used: counter staff counting cash under time pressure on a phone or a shared PC, an admin scanning several counters a day, and a purchase user tracking what is owed.

## The direction: calm functional back-office ("Swiss minimal")

Light by default, dark as a real option. Quiet surfaces, one confident accent, strong type for numbers, status shown with words and icons before colour.

**Why this and not something else**

- The style lookup (ui-ux-pro-max) ranked *Minimalism & Swiss Style* first for this kind of product ("enterprise apps, dashboards, professional tools"; clear grid, high contrast, functional). It fits: the screens are forms and tables, and decoration only gets in the way of counting.
- The lookup's colour and pattern suggestions were **not** used as given: it proposed a dark-first near-black palette with neon green and a marketing "enterprise gateway" page pattern. Counters work in a bright shop on a shared screen, so dark-first would be the wrong default, and there are no landing pages here.
- The finance colour lookup (navy + gold) was also not adopted. The app is already deployed with an indigo accent that staff recognise; keeping it avoids retraining people for no gain. It is deepened and calmed, not replaced.
- Fonts: the lookup suggested Fira Code/Fira Sans or IBM Plex Sans. **Geist is kept** (already bundled by Next, no extra network request, true tabular figures, good at small sizes). Numbers use `tabular-nums` and are right-aligned.

**Personality:** trustworthy, plain-spoken, a little warm. No gradients, glass, glow or animated backgrounds. Depth comes from borders; shadow is only for things that float (dialogs, menus).

## Rules that follow from it

1. **Never colour alone.** Shortage, excess, overdue, locked and confirmed are each shown as an icon + a word + a colour (▲ Short ₹120, ▼ Excess ₹40, ✓ Balanced). Colour is the third cue, not the first.
2. **Numbers are the interface.** Money uses one formatter (₹, Indian grouping, 2 decimals in totals, none in lists), `tabular-nums`, right-aligned, with the sign shown for differences. Totals that are still loading show a skeleton, never ₹0.
3. **One question per screen section.** Each card has one title, one job. The counting flow keeps the running total visible while scrolling.
4. **Touch first on counting screens, density on admin screens.** See "Density" below.
5. **Say what will happen.** Destructive or irreversible actions (unlock, cancel payment, submit day) use an in-app confirmation that states the consequence in one sentence. No browser `confirm()`.

## Tokens (in `app/globals.css`)

Three layers, as the design-system skill describes:

| Layer | What it holds | Who may use it |
|---|---|---|
| 1. Primitive | Colour ramps: `--gray-*`, `--night-*` (dark neutrals), `--brand-*`, `--green/amber/red/blue-*`, chart series | Only layer 2 |
| 2. Semantic | `--background`, `--foreground`, `--card`, `--primary`, `--muted-foreground`, `--border`, `--ring`, and per status `--success/-soft/-border`, `--warning…`, `--info…`, `--danger…`; chart `--series-1..3`; motion; shadow | Components, through Tailwind classes (`bg-card`, `text-danger`, `bg-success-soft`) |
| 3. Component | Control heights, tap target, card padding and radius, table row heights, denomination row height, header height | Components |

Light and dark are both defined at layer 2; layer 1 and 3 do not change between them. **Every text and chart pair was measured:** all text pairs are at least 4.5:1 and chart colours at least 3:1 in both modes (`docs/ui-audit.md` lists what was wrong before: `success`/`warning` on soft backgrounds were 4.09 and 3.70).

No hex or palette-named Tailwind colours (`text-red-600`, `bg-green-100`) in components; the fixes already made are in the audit.

## Type scale

Geist Sans; Geist Mono only for references and codes.

| Use | Size / weight |
|---|---|
| Page title | 20 / 600 |
| Card title | 16 / 600 |
| Body, table cells, inputs | 14–16 / 400 (inputs 16 on phones so iOS does not zoom) |
| Labels, helper text | 12–13 / 500 |
| Big figures (totals, balances) | 28–36 / 600, tabular |
| Smallest allowed | 12 px |

Line height 1.5 for body, 1.2 for figures.

## Spacing, shape

4 px base. Gaps 8 / 12 / 16 / 24; card padding 20 (16 on phones). Radius 8 on controls, 12 on cards (`--radius` 0.75rem, `--card-radius`), full on chips.

## Density (a component token, not a second design)

| Mode | Where | Control height | Table row |
|---|---|---|---|
| **Touch** (default on counter and purchase-entry screens) | opening verify, payments, sales, closing, forms | 44–48 px | n/a |
| **Compact** | admin dashboard tables, reports, vendor/cheque lists on wide screens | 36 px | 36–40 px, sticky header |

Anything a counter presses is at least 44 × 44 px with 8 px between neighbours.

## Motion (subtle, and off for people who ask)

- Dialogs: fade + 8 px rise, 200 ms ease-out in, 120 ms out.
- Sections appearing: 150 ms fade only.
- Totals that change: a quick 200 ms colour/number settle, not a count-up.
- Success on submit / verify: the check icon draws once.
- None on data tables, none looping except spinners, all removed under `prefers-reduced-motion` (rule already in `globals.css`).

## Dark mode

Defined and contrast-checked now, wired in the build phase: follows the device setting, with a manual switch in the header, stored in the browser. Chart colours switch to lighter variants.

## Accessibility bar

WCAG AA text contrast, visible 2 px focus ring on every control (`--ring`), a label on every input (programmatically linked), keyboard-only operation, dialogs that keep focus, errors next to the field and announced, 360 px width without sideways scrolling, 44 px tap targets on counting screens.

## What is not decided here

The **layout** of the key screens (counter dashboard, closing page, admin dashboard). Those need a choice between directions and are shown as options next.
