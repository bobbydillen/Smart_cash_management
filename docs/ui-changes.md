# UI changes (branch `ui-redesign`)

Visual and UX pass only. No server action, data model, role, status flow or cash formula is changed.

## 1. Audit and safe fixes (done)

See `docs/ui-audit.md` for evidence.

- Denomination rows fit a 360 px phone (no sideways scroll, subtotal visible).
- Every purchase form field is now labelled for screen readers; the label click focuses the field.
- Status colours `success` and `warning` now pass 4.5:1 on their soft backgrounds.
- Dialogs: focus moves in, stays in, and returns; Escape closes.
- Hard-coded `red-600` / `green-700` / `green-100`… replaced by tokens; text under 12 px raised to 12 px.
- Reduced-motion rule added.

## 2. Design direction and tokens (done)

See `docs/design-direction.md`.

- `app/globals.css` rebuilt as three layers (primitives, semantic, component). Light and dark both defined, every text pair measured at 4.5:1 or better, chart colours at 3:1 or better.
- No visible change on screen yet: semantic names are unchanged and values match the previous ones, except the two status colours above.

## 3. Directions explored (done, waiting for a choice)

- `/ui-lab` (development only, not in any production build): three directions for the counter dashboard, the closing page and the admin dashboard, at phone, tablet and desktop widths.
- Found and fixed while reviewing the previews: a counter name cut off by a status pill, a primary button squeezing a step title to three lines.

## 4. Build (not started)

Waits for the choice of direction.

## Not verified yet

- Lighthouse scores (not run).
- Real screen-reader and real-phone checks.
- Anything that needs data the test database lacks.
