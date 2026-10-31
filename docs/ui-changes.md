# UI changes (branch `ui-redesign`)

Visual and UX pass only. **No server action, data model, role, status flow or cash formula was changed.** Checked by diffing the branch against its starting commit: the only non-component file touched is `lib/report.ts` (a 6-line helper that prints whole rupees without ".00"), and the 226 money checks in `npm run test:purchase` still pass.

Direction chosen: **B, "Framed sheet"** (tinted frame with a sidebar on computers and a tab bar on phones; one white working sheet). See `docs/design-direction.md`.

## What changed, in the order it was done

| # | Commit | What |
|---|---|---|
| 1 | Audit and safe fixes | `docs/ui-audit.md`. Closing step no longer scrolls sideways on a phone; every form field labelled; status colours pass contrast; dialogs keep focus; tokens instead of hard-coded colours; reduced-motion rule. |
| 2 | Direction and tokens | `docs/design-direction.md`; `app/globals.css` rebuilt as primitives, semantic and component layers, light and dark, all text pairs at least 4.5:1. |
| 3 | Counter flow | New shell (`components/app-shell.tsx`). Steps are sidebar items / bottom tabs, the locked state is explained ("Verify the opening cash first"). Denomination rows are cards (2 across on a phone, 44 px steppers, number field tied to its label). Closing page has a live bar with expected, counted and the difference as icon + word, and Submit. Light/dark switch. |
| 4 | Admin, reports, purchase, reconciliation | The same shell with the admin navigation; the purchase counter gets its five sections as tabs; the admin dashboard shows "Expected in the drawer / Counted / Short or Excess" per counter and no longer shows a green "Balanced" before anything is submitted; vendor list readable on a phone. |
| 5 | Polish | 40 browser pop-ups replaced by one in-app dialog that says what will happen and starts on the safe choice; totals show a grey placeholder instead of a wrong ₹0 while the opening cash loads; every remaining field has a label; flat login; subtle motion (below). |
| 6 | Guideline pass | Clock times pinned to India time (server and browser could differ), no `transition: all`, no clickable `div`, native controls follow the theme, focus never hidden under the sticky bars, theme colour for the phone's browser bar. |

## Motion (all off under "reduce motion")

Dialogs fade and rise 200 ms; the day's steps fade 150 ms; the counted total and the difference settle 200 ms when they change; the "Saved" tick pops once. Nothing animates in tables.

## Measured

Lighthouse 12, production build, mobile emulation, signed in as each role:

| Screen | Accessibility | Best practices | Performance |
|---|---|---|---|
| Login | 100 | 96 | 100 |
| Counter | 100 | 96 | 78 |
| Admin overview | 100 | 96 | 84 |
| Reports | 100 | 96 | 95 |
| Reconciliation | 100 | 96 | 83 |
| Purchase today | 100 | 96 | 83 |
| Purchase vendors | 100 | 96 | 83 |

The requested bar was accessibility 95 or more. axe-core (the engine inside Lighthouse) was also run in the browser on the counter's Payments, Sales and Closing steps, the transfer dialog and the More sheet in light and dark mode, and on the admin overview in both modes: no violations.

## Not verified, or left as it is

- **Real devices and screen readers.** Everything was checked in a desktop browser at phone width and with automated tools. Please try it on a real phone, and ideally once with VoiceOver or TalkBack.
- **Lighthouse cannot open the Closing step** (it is a tab inside one page, not its own address), so Closing was checked with axe in the browser instead, not with a Lighthouse score.
- **Performance** is not part of the brief and is lowest on the counter page (78). I did not investigate why and did not change anything for it.
- **A day awaiting confirmation** and a **submitted purchase day** could not be seen on today's date in the test database; those cards were reviewed from the earlier days' data and the code.
- **Opening-cash check page** (its unverified state) was reviewed in code and in the first audit screenshots, not re-screenshotted after the redesign.
- The counter's steps are not separate web addresses, so they cannot be bookmarked or opened in a new tab. Changing that touches how the page keeps its state and was not done.
- **Not changed on purpose:** the whole counter page still shows a spinner while it reloads after a transfer or opening check, because the pages below rebuild their state from it.
- The reconciliation tool (Python) is unchanged apart from its page, which now sits in the shell.
- Nothing has been deployed. The branch exists only in the local repo copy (`C:\dev\smartcash-repo`, branch `ui-redesign`).
