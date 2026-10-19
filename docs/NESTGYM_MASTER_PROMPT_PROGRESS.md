# NestGym — master-prompt progress (2026-10-18)

Scope of this pass: audit the repo against the master prompt, then build the single highest-value missing module
(Priority 1: revenue recovery & retention). Everything else is recorded below as **already present**, **deferred** or **recommended**.
Nothing was committed; nothing was run against a real database (tests use an in-memory MongoDB).

## Audit snapshot (verified in code)

| Area | Status | Evidence |
|---|---|---|
| Tenant isolation | Working | `utils/tenantScope.js` plugin + cross-tenant tests in `scripts/test-gym.js` |
| Invoice/payment ledger, partial pay, refunds, idempotency | Working | `utils/gym.js` (append-only payments, idempotency keys), tests |
| Member online payment | Working | `gymPay.js` + `portalController.verifyPayment`: HMAC signature, server-side `fetchPayment`, idempotency key `rzp:<paymentId>` |
| Access engine | Working | `evaluateAccess` is shared by desk / QR / face |
| Renewal / dues / at-risk / birthday reports | Present but **read-only lists** (`reportController`) | no outcome tracking, no "already contacted", no money split |
| Follow-up outcomes, snooze, worklist | **Was missing → built** | see below |
| Lead conversion by source / staff, lost reasons | **Was missing → built** | `GET /api/retention/conversion` |
| Login brute-force lock + WhatsApp OTP unlock | **Was missing → built earlier today** | `authController`, `scripts/check-login-lock.js` |
| Automated WhatsApp/SMS/email reminders | Missing — **deferred** | needs provider credentials, approved templates and consent rules (the prompt forbids sending before the gym configures these). The worklist drafts a `wa.me` message that staff send themselves. |
| Razorpay webhooks (async confirmations, refunds) | Missing — recommended next | only the browser-initiated verify path exists |
| Razorpay `authorized` counted as paid | Note | `verifyPayment` accepts `captured` **or** `authorized`; if a gym's account is manual-capture, money may never arrive. Switch to `captured` only once confirmed that gyms use auto-capture. |
| Credit notes, CGST/SGST vs IGST, PDF invoices | Not verified in this pass | needs a GST review with a professional before changes |
| Supplier / purchase records, stock transfers, batch expiry | Missing — deferred | larger inventory module |
| PT trainer availability / leave / conflict prevention | Not verified | recommended |
| Face enrolment consent + deletion flow | Not verified | recommended (DPDP) |
| Data import (CSV) | Missing — deferred | |
| Platform-admin area (tenant directory, suspension) | Missing — deferred | |

## Built in this pass: Follow-ups & Revenue Recovery

**Backend**
- `models/FollowUp.js` — one row per contact attempt (kind, outcome, note, next date, who).
- `utils/retention.js` — `buildOpportunities()` / `summarize()`; reasons: expiring (default 14 d), lapsed (30 d), dues, at-risk (14 d without a visit), trials/negotiating enquiries, PT packages with ≤ 2 sessions left. Someone who already holds a later membership never appears as a renewal.
- Money is split: `pending` = invoiced & unpaid; `projected` = last plan price if the renewal converts. They are never summed together and projected is never shown as revenue.
- Logging an outcome rests the item for 2 days (or until the chosen date); `not_interested` closes it. `includeSnoozed=true` shows them again.
- `controllers/retentionController.js`, `routes/retentionRoutes.js`, mounted at `/api/retention`:
  - `GET /opportunities` (`Memberships:read`) · `GET /follow-ups` · `POST /follow-ups` (`Memberships:update`) · `GET /conversion` (`Reports:read`).
  - Tenant-scoped; branch-bound roles (branch manager / receptionist / trainer) are forced to their own branch; follow-ups can only target a member/enquiry of the caller's gym (404 otherwise).
- `ActivityLog` module enum gained `FollowUp`.

**Frontend** — `pages/gym/FollowUpsPage.tsx`, route `/follow-ups`, nav item "Follow-ups" (front desk). Tabs per reason, stat cards, "Log" modal, WhatsApp button (opens a drafted message; staff send it — nothing is sent automatically), and a "Lead funnel" tab.

**Tests** — `node scripts/test-gym.js`: 29 → **35 passing** (worklist reasons and money buckets, renewed members drop off, snooze/close, validation + tenant isolation, branch restriction, funnel maths). `node scripts/smoke-http.js` passes; frontend `tsc` clean and `vite build` OK.

**Deploy** — no new env vars, no migration (new `followups` collection is created on first write).

## Known limitations
- No automatic reminders and no delivery tracking yet (see deferred). "Reminder history" is the manual follow-up log.
- Thresholds (14 / 30 / 14 days) are query parameters with sane defaults, not yet per-gym settings.
- At-risk uses "no visit in N days", not each member's own attendance pattern.
- `GET /opportunities` is capped at 300 rows per request.

## Next three highest-value items
1. Razorpay webhooks (idempotent, signature-verified) + `captured`-only decision.
2. Notification service with gym-configured WhatsApp/SMS/email templates, consent, retry and duplicate prevention, driven by this worklist.
3. Per-gym settings for reminder timings, plus CSV member import with preview and row-level errors.
