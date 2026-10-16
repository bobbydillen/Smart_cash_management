# Smart Cash Management

Daily cash management for Smart Mart & Smart Fashions: each counter records its
payments, sales and cash count, an in-charge verifies the cash, and the admin reviews
and confirms every day.

## Roles

| Role | Can do |
|---|---|
| **Counter** (Counter 1, Counter 2, Fancy, Fashion) | Verify opening cash, record payments and sales, count closing cash, plan next-day opening, transfer cash, submit the day |
| **Admin** | See every counter for any date, confirm or unlock days, override or revert opening cash, manage in-charges and passwords, view reports |
| **Supervisor** | Read-only view of the admin dashboard and reports |
| **Purchase** | Vendors, bills, payments (cash / cheque / voucher), the purchase cash drawer, cheque and voucher tracking, reports |

## A counter's day

1. **Opening cash** - the day opens with what the last closed day kept. The in-charge
   counts each denomination, ticks it and verifies (or reports a problem with a note).
   Nothing else can be entered until this is done.
2. **Payments** - money paid out or received. Cash can also be **transferred** to another
   counter or the admin; the receiver accepts it.
3. **Sales** - totals from the billing software (total, card/UPI, credit).
4. **Closing** - count notes and coins (saved automatically), choose the notes needed for
   tomorrow (all smaller notes first), tick the available cash, pick who is closing, submit.
5. **Admin** confirms the day, or unlocks it for corrections.

```
Expected cash = Opening + Cash sales + Money in - Money out
Shortage / excess = Expected - Counted
```

Status flow: `open` -> `submitted` -> `confirmed` (admin can unlock back to `open`).

## The Purchase counter

The purchase counter pays the vendors who supply goods.

- **Vendors** - name, phone, what they supply, and any amount already owed when they were added.
- **Bills** - bill number, date, amount, items, optional due date. Each shows Unpaid / Part paid / Paid.
- **Payments** - against a bill, in parts if needed, by **cash**, **cheque** or **voucher**, each recording who handled it.
  - *Cheque*: number, bank and the date on it (post-dated is fine). Tracked as Issued -> Cleared / Bounced / Cancelled.
    A bounced or cancelled cheque puts the amount back on the bill.
    **Cheques due** shows what is dated today, in the next 7 or 30 days, or any range, grouped by day with
    totals per day and per bank, so the bank balance can be planned.
    The bank on a cheque is chosen from a list kept on the Cheques page (**Manage banks**, available to the admin and the
    purchase counter), and the due view can be filtered to one bank.
  - *Voucher*: a promise to pay later. The bill counts as paid, but the voucher stays owed until it is
    **settled** with cash or a cheque when the vendor returns.
- **Who pays** - vendors are paid by the purchase counter (from its drawer), by the **admin** (from the admin's own
  money; also clears cheques) or by a **shop counter in cash**. A counter pays for a **new bill** the vendor has just handed over: it enters the bill number, date and
  amount and how much it is paying now. The bill is recorded, the payment is recorded against it, and the amount
  appears as *Money out* on its Payments page, all saved together. The purchase counter sees the bill and what is
  still due. Admin and counter payments never change the purchase
  counter's drawer; each payment shows who paid.
- **Returns** - goods sent back (expired, damaged, wrong items) are recorded from the vendor page with a reason, what was returned and the vendor's credit note number. The value comes off what is owed, against a bill or on account, and shows on the timeline. No cash moves. A return can be cancelled (purchase counter: today's own; admin: any).
- **Vendor page** - what they supply, total still to pay (bills + pending vouchers), every bill, cheque, voucher and payment.
  It ends with a **timeline** of when each bill arrived and every payment, cheque and voucher event, who made it, and
  what was still owed after each step.
- **Daily cash** - cash received (from the admin or other counters, as transfers the purchase counter accepts),
  cash paid to vendors, cash sent back, then a denomination count at the end of the day. After counting, the
  counter chooses how much to **keep for tomorrow** (nothing, some or all); the rest is **handed over to the admin**,
  who marks it received. Closed by an in-charge and confirmed by the admin like the other counters.
- **Reports** - per day (cash given, paid by each mode, vendors paid) and what is owed to each vendor.

```
total still to pay = (opening balance + bills - payments) + pending vouchers
cash in hand       = opening + received - sent back - cash paid
```

The rules live in `lib/purchase-service.ts` and are covered by `npm run test:purchase`.

## Setup

```bash
npm install
cp .env.example .env.local     # then fill in MONGODB_URI (and MONGODB_DB)
npm run dev                    # http://localhost:3000
npm run typecheck              # TypeScript check (run before deploying)
```

On first sign-in the app creates the default accounts if the database is empty
(`admin`, `supervisor`, `purchase`, `mart1`, `mart2`, `martfancy`, `fashion`).
**Change every password from Admin -> Passwords straight away**, and add people under
Admin -> In-charges, which has two lists: **Counter in-charges** (used by the shop counters) and **Purchase staff**
(used by the purchase counter). Counters cannot verify or submit, and the purchase counter cannot pay vendors or close
the day, until their list has at least one name.

Sign-in locks an account for 15 minutes after 5 wrong passwords. New passwords must be
6-72 characters.

## Database

MongoDB, database `smartmart_cash` by default (set `MONGODB_DB` to use another).
Collections: `users`, `sessions`, `entries`, `incharges`, `transfers`, `login_attempts`, and for purchase
`vendors`, `purchase_bills`, `purchase_payments`, `cheques`, `vouchers`, `purchase_days`.
Indexes (one entry per counter per day, expiring sessions and so on) are created
automatically when the app starts.

### Scripts

| Script | Purpose |
|---|---|
| `scripts/copy-db.mjs` | Copy `users` and `entries` into a new database, e.g. for testing an upgrade without touching live data |
| `scripts/clean-duplicate-entries.mjs` | Remove stray empty duplicate days left by an old bug. Dry run unless `--apply` |
| `scripts/test-purchase.mjs` | `npm run test:purchase`: checks the purchase money rules in a throwaway database |
| `scripts/reset-purchase-data.mjs` | Wipes purchase data in a *test* database (refuses the live one). Dry run unless `--apply` |

```bash
node --env-file=.env.local scripts/copy-db.mjs
node --env-file=.env.local scripts/clean-duplicate-entries.mjs          # dry run
node --env-file=.env.local scripts/clean-duplicate-entries.mjs --apply
```

Both scripts use the database named in `.env.local`, so check it first.

## Project layout

```
app/                 pages and server actions (app/actions)
components/          screens; components/pages = the counter's three steps
components/ui/       the few base components in use (button, card, input, ...)
lib/                 shared logic: types, report maths, next-day allocation,
                     validation, database helpers
hooks/               use-autosave (debounced, ordered saving)
scripts/             one-off database scripts
```

Stack: Next.js 16 (App Router), React 19, TypeScript, MongoDB (native driver),
Tailwind CSS v4, Recharts.
