# NestGym — Audit, Refactor & Feature Pass

Written from the point of view of a gym owner / head trainer: *can the desk sell a plan in 30 seconds, never lose money, and never let the wrong person in?*

## 1. What was wrong (audit findings)

| # | Finding | Impact | Fix |
|---|---|---|---|
| 1 | **Cross-gym data access.** Controllers used `findById(req.params.id)` with no tenant filter (members, invoices, plans, memberships, branches, users, trainers, face). | Gym A could read/edit/delete Gym B's data by guessing an id. | `utils/tenantScope.js`: `protect` stores the caller's tenant in AsyncLocalStorage; a mongoose plugin forces `tenantId` onto every query of every tenant model and strips `tenantId` from update bodies. Covered by unit + HTTP tests. |
| 2 | **Invoice numbers globally unique** (`unique: true` on `invoiceNumber`) and generated from `countDocuments`. | 2nd gym's first invoice collided; deletes re-used numbers. | Per-tenant unique index + atomic `Counter` (never reuses a number). |
| 3 | **Frontend ↔ API contract broken.** UI sent `member`/`total`, API wanted `memberId`/`totalAmount`; dashboard read `revenueTrend`/`attendanceTrend`, API returned `revenueByDay`/`attendanceByDay`; Smart Entry read `res.matched`, API returned `res.data.matched` (always "Access denied"). | Billing page could not create invoices, dashboard charts always empty, face kiosk always denied. | Pages rewritten against the real contract. |
| 4 | **`branchId` required but never sent by the UI.** | Adding a member / invoice failed validation. | `ensureBranch` fills it (body → staff's branch → gym's first branch → auto "Main Branch") and validates a supplied id belongs to the gym. |
| 5 | **Invoices were a flat amount.** No items, discount, partial payment, dues, refunds. Membership price was not snapshotted. | Cannot run a real front desk (balance collection, refunds, GST register). | Line items, coupons, append-only payment ledger (refunds are negative rows), `paidAmount`/balance, conditional atomic updates (no overpay, idempotent retries). |
| 6 | **Check-in had no rules.** Anyone with a member id could be checked in; no expiry, dues, freeze, double-scan or hours checks; face verify created attendance directly. | Free entry for expired members, duplicate open visits. | `evaluateAccess` is the single rule set used by desk, kiosk and face check-in; one-open-visit unique index; manager override with mandatory reason. |
| 7 | **Membership lifecycle was thin.** Renew overwrote the same row; freeze never extended the end date; no expiry job; upgrade had no credit. | Wrong end dates, lost history, no pro-rata. | Renew queues after the running plan; freeze/unfreeze with limits and day give-back; upgrade credits unused days; cancel (+refund); transfer; hourly sweep. |
| 8 | **Privilege escalation.** A manager could create a `gym_owner`; an owner could set `super_admin`; `activity` log was super-admin only so owners had no audit trail. | Account takeover paths. | Role ceiling on create/update; activity log now tenant-scoped for owner/manager. |
| 9 | **Leads leftovers in billing.** `/billing/plans` advertised "2,000 leads/month, IndiaMART"; tenant limits were `leadsPerMonth/teamMembers`; the SaaS page didn't exist in the UI. | Wrong product sold. | Gym plans (§4), gym limits, new Subscription page with Razorpay checkout. |
| 10 | **Settings page saved nothing** (`gymName` isn't a Setting field), so invoices never had GSTIN/address. | Invoices not GST-compliant. | Business profile form (name, GSTIN with format check, PAN, address, prefix, timings, footer). |
| 11 | Misc: email regex rejected `.gym`, `.fitness`, `.test`; trainer assignment allowed duplicates / non-trainers; deleting a member or trainer with history erased the history; UTC dates made "today" empty on the desk. | Annoying to dangerous. | All fixed (see tests). |

## 2. Data model

Refactored: `Member` (member code, health/PAR-Q, goals, source, ID proof, waiver), `MembershipPlan` (admission fee, GST mode, inclusions, access hours, freeze/transfer/grace rules), `Membership` (price + dues snapshot, freeze history, renewal chain), `Invoice` (items, discount, coupon, payment ledger, status partial), `Attendance` (membership link, duration, override reason, auto-checkout), `User` (trainer profile, salary), `Tenant`/`Subscription` (gym limits and plans), `TrainerAssignment` (unique active).

New: `Counter`, `Enquiry`, `GymClass`, `ClassBooking`, `PTPackage`, `WorkoutPlan`, `DietPlan`, `BodyMeasurement`, `Locker`, `Product`, `Expense`, `Coupon`, `Announcement`, `Equipment`, `StaffAttendance`.

## 3. Features added

Front desk check-in with live reasons · enquiries → free trial → convert · member 360 profile · sell/renew/upgrade/freeze/cancel/transfer · dues & part-payments · printable GST invoice · coupons · group classes with capacity, waitlist auto-promotion and monthly credits · personal-training packages, trainer clash guard, per-session commission · workout & diet builders with templates · body measurements/progress · lockers · POS with atomic stock · expenses and P&L · equipment service tracker · announcements · staff attendance & payroll · reports (P&L, dues, renewals worklist with WhatsApp links, at-risk members, birthdays, peak-hour heatmap, GST register + CSV) · SaaS subscription page.

## 4. SaaS pricing (market-benchmarked)

Indian gym-management software (public pricing of vendors reviewed during research, e.g. Organised Gym; **re-check before launch**) clusters at: entry ₹600–900/mo (≈100–200 members), mid ₹1,300–2,000/mo (≈500 members + WhatsApp/app), top ₹2,500–3,500/mo (unlimited / multi-branch). Term discounts of 10 / 20 / 30 % for quarterly / half-yearly / yearly are the norm.

| Plan | ₹/month (ex-GST) | Members | Branches | Staff |
|---|---|---|---|---|
| Starter | 799 | 150 | 1 | 5 |
| Growth ⭐ | 1,499 | 500 | 1 | 15 |
| Pro | 2,499 | 1,500 | 3 | 40 |
| Elite | 3,999 | unlimited | 10 | 150 |
| Enterprise | custom | unlimited | unlimited | unlimited |

14-day free trial (100 members / 1 branch / 5 staff). Quarterly −10 %, 6-month −20 %, yearly −30 % (e.g. Growth yearly = ₹12,592 ≈ ₹1,049/mo). Source of truth: `models/Subscription.js` (`PLAN_PRICES_MONTHLY`, `TERM_DISCOUNT`, `PLAN_LIMITS`). Legacy `professional`/`business` keys keep working. Limits are enforced when adding members, branches and staff.

## 5. Deploying to an existing database

1. **Back up the database.**
2. `cd backend && npm i` (adds `mongodb-memory-server` as a dev dependency for tests).
3. `node scripts/migrate-gym.js` — dry run, prints what would change.
4. `node scripts/migrate-gym.js --apply` — drops the legacy global invoice-number index, closes duplicate open visits, assigns member codes, seeds counters, backfills invoices (items + payment ledger), memberships (price/paid snapshot) and tenant limits, then syncs indexes. Idempotent.
5. Deploy backend, then frontend (`npm run build`).

## 6. Tests

```
cd backend
node scripts/test-gym.js     # 28 integration tests on an in-memory MongoDB
node scripts/smoke-http.js   # 9-step HTTP smoke test (register 2 gyms, sell, bill, check-in, isolation)
```
Neither touches a real database.

## 7. Not built / known limits (be honest with customers)

- Native member mobile app (the web **member portal** exists, see §8).
- WhatsApp/SMS are **one-tap `wa.me` links** from the worklists, not automated sends (needs a WhatsApp Business API connection per gym).
- Plan-expiry enforcement for the SaaS trial (limits are enforced; a lapsed trial is not yet blocked).
- Hardware turnstile/biometric integration; the hourly sweep runs in-process (use a cron/queue if you scale to several API instances).

## 8. Member portal & online payments

- Desk: member profile → **Portal login** creates a login (their real email if free, else a generated ID) with a one-time password and a ready WhatsApp message; **Reset** / **Disable** from the same place.
- Members sign in on the normal login page and get a mobile-first portal: membership & days left, bills (pay online), class booking/cancel with waitlist, trainer/PT/locker, workout & diet plan, self-logged weigh-ins, announcements.
- A member token is refused on every staff API (only `/api/portal` and `/api/auth` work); portal handlers only ever touch the member's own records.
- Online payments use the **gym's own Razorpay keys** (Settings → Member online payments). The secret is AES-encrypted (`ENCRYPTION_SECRET` must be set), never returned by the API. The server verifies the signature, re-fetches the payment from Razorpay (so the browser can't forge amount/order), and records it through the same idempotent ledger (`rzp:<paymentId>`), so retries never double-count.
- Tested with Razorpay stubbed (forged signature, wrong order, failed payment, retry, cross-member access). **Not yet exercised against live Razorpay** — do one real ₹1 payment with test keys before enabling for a gym.
