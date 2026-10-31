# UI audit

Scope: every screen in `app/` and `components/` (13k lines), checked by code search, a script that reads whole JSX tags, a contrast calculation on the colour tokens, and screenshots at 360 px (phone) and desktop width. The 21st CLI is not installed, so `21st review` was not run; everything below was checked by hand and the evidence is given.

Screens looked at in the browser: login, counter (opening verify, Payments, Sales, Closing) at 360 px, admin dashboard at 360 px and desktop, counter reports, purchase.

Business logic, server actions, data and formulas were not touched.

## Fixed in this pass (high confidence, no design decisions)

| # | Defect | Evidence | Fix |
|---|---|---|---|
| 1 | **Closing step overflowed sideways on a 360 px phone.** Each denomination row was wider than the screen, so the subtotal was cut off and the whole page scrolled sideways. | Screenshot before; `components/denom-row.tsx` fixed widths (64 + 148 + 96 px inside 264 px). After: `scrollWidth` 360 = viewport 360. | Row is now a grid: label and subtotal on one line, the stepper below on a phone; one line from 640 px up. Subtotal uses tabular numbers. |
| 2 | **Form labels were not connected to their controls** in every purchase form (~48 controls). Screen readers announced "edit text" with no name, and clicking the label did nothing. | `components/purchase/common.tsx` `Field`: a `<label>` with no `htmlFor` next to the control. | The label now wraps the control. The required star is hidden from screen readers and replaced with "(required)". |
| 3 | **Status text below 4.5:1 contrast in light mode.** `success` on its soft background 4.09, `warning` on its soft background 3.70 and on white 4.09. Used for small chips and amounts. | Contrast calculation on `app/globals.css` tokens. | `--success` L 0.55 → 0.51, `--warning` L 0.60 → 0.54, same hue. Now 4.80 and 4.74 on soft, 5.3 on white. |
| 4 | **Dialogs did not manage focus.** Opening one left keyboard focus behind it; Tab could leave it; closing did not return focus. | `components/modal.tsx`. | Focus moves into the dialog, Tab/Shift+Tab wrap inside it, Escape closes, focus returns to the opener. Checked in the browser (focus moves in, Escape closes). |
| 5 | **Hard-coded colours** that ignore the tokens: `text-red-600`, `text-green-600`, `text-green-700`, `bg-green-100`, `bg-orange-100`, `bg-blue-100`. | `components/save-indicator.tsx`, `components/comparison-report.tsx`. | Replaced with `text-danger`, `text-success`, `bg-success-soft` and the other status tokens. |
| 6 | **Text below 12 px** (10 and 11 px) in the day timeline tags, denomination hint and report status pill. | grep `text-[10px]`/`text-[11px]`. | `text-xs`. |
| 7 | **No reduced-motion handling.** | No `prefers-reduced-motion` rule anywhere. | Global rule in `app/globals.css`; spinners keep turning because they show work in progress. |

## Open: accessibility

- **37 of 85 form controls still have no programmatic label** (placeholder only or a loose `<label>`/`<div>`): reconciliation 7, payments page 6, vendor payment card 5, cheques 3, transfer card 3, report filters 2, closing 2, opening verify 2, and singles elsewhere. Exact lines come from the script `audit2.mjs`; they are fixed screen by screen in the build phase.
- **40 native `confirm()` / `alert()` calls** (closing page 8, admin dashboard 6, vendor detail 5, cheques 4 ...). They cannot be styled, say nothing about consequences, and are blocked or auto-dismissed by some browsers and embedded views. The brief asks for obvious confirmations for destructive actions, so these become one in-app confirm dialog.
- **Touch targets under 44 px:** denomination `−`/`+` buttons are 36 px (`denom-row.tsx`), table icon buttons are 32–36 px (`payments-page.tsx` 361-379, `vendor-detail.tsx` 364 and 418, reconciliation steppers). Default button height is 40 px, small is 36 px. For counters counting cash on a phone these should be 44–48 px.
- **Dark mode is defined but never used.** `app/globals.css` has a full `.dark` palette and `comparison-report.tsx` styles `.dark .viz-root`, but nothing ever sets the `dark` class (`theme-provider` was removed, `layout.tsx` has no toggle). Dark-mode contrast also has failures that nobody currently sees: `danger` on card 3.64, `info` on card 3.62, `success` on card 4.34.
- **Step order is not announced.** The three steps are plain buttons with no `aria-current`; locked steps use `disabled` with no explanation of why.

## Open: responsive and layout

- **The counter header takes about 26% of a 360 × 760 screen** (name row, status chips, transfer + date row, step tabs) and it is sticky, so it stays there while counting. The step tabs hide their numbers below 400 px (`counter-dashboard.tsx` 262-287).
- **Admin dashboard actions are hidden in a sideways-scrolling row** on a phone: Reconciliation is cut off, and In-charges, Passwords and Transfer cash are not visible without scrolling a row that only shows a thin scrollbar (`admin-dashboard.tsx` header nav). The title truncates to "Admin…".
- **Submit button text is wider than the button** on 360 px ("Complete the checklist to submit", `closing-page.tsx`).
- **No sticky running totals** on the counting screens: expected vs counted sits at the bottom of a long page.

## Open: states and feedback

- **Totals show a wrong number while loading.** On Sales and Closing the "Opening cash" starts at ₹0.00 and the expected total at ₹55,100 before settling at ₹9,120 / ₹64,220 (`sales-page.tsx` 69 and 85 start the state at 0 and fetch afterwards). A person reading it in that moment sees a false shortage.
- **"Balanced" in green when no counter has submitted** (admin dashboard "Cash position": `0 of 4 counters submitted` next to a green "Balanced"). It should say nothing has been submitted yet.
- **Whole-page spinner on every refresh.** `counter-dashboard.tsx` `refreshEntry` sets `loading`, which replaces the entire counter screen (header included) with a spinner after any transfer or verification, and loses focus. Not changed now because child pages rebuild their local state from the entry when they remount.
- Some lists have no empty or error state beyond a plain sentence (e.g. counter reports show only "Loading…" until data arrives; purchase Today shows "No purchase activity on this date." with no action).

## Open: consistency

- Currency is formatted in several ways: `inr()`, `toLocaleString("en-IN", ...)`, `money()`, `money2()`, and manual `₹{...}` (56 formatting sites). Amounts mostly use Indian grouping, but decimals vary (₹98,400.00 vs ₹98,400) and `tabular-nums` is used in only 22 places, so columns of money do not line up.
- Several one-off label and select styles (`Label` in the vendor card, `selectClass` in purchase, `rounded-lg border bg-card px-3 text-sm` copies) instead of one form field component.
- Two chart colour systems: `--series-1..3` (hex) and `--chart-1..5` (oklch, unused by the app), plus the local `--s1..s3` in the comparison report.

## Subjective recommendations (not defects)

- Group the counter header into one compact row plus a numbered step bar; move "Transfer cash" and the date into a menu on phones.
- A single running-totals bar at the bottom of the counting screens: expected, counted, difference with an icon and a word, not colour alone.
- Admin: a compact comparison table with sticky header and a persistent filter bar instead of a card per counter at desktop width.
- Purchase: make the vendor balance the first thing on vendor pages; show due / overdue / paid as chips with dates.

## What was inspected

All of `app/` and `components/` (excluding `components/ui/` primitives, which are unmodified shadcn), `app/globals.css`, `app/layout.tsx`. Not inspected: real Lighthouse scores (no Lighthouse run yet), screen-reader behaviour with real assistive technology, and any screen needing data the test database does not have (for example a submitted day awaiting admin confirmation on today's date).

## Status after the redesign

Everything under "Open" above was addressed in the redesign except two items, listed in `docs/ui-changes.md` under "Not verified, or left as it is" (steps are not separate addresses; the counter page's full-page spinner on refresh). Measured results are in the same file.

The first version of the dark theme had unchecked contrast; all text pairs now pass (see `docs/design-direction.md`).
