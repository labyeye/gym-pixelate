# NestGym — Google Play Console: what to enter in every field

App id: `com.nestgym` · Version 1.0 (code 1) · minSdk 24 · targetSdk 36 · Permissions in manifest: INTERNET, CAMERA only.

---

## 0. Fix these BEFORE you upload (the build is not ready yet)

| # | Problem found in the code | Fix |
|---|---|---|
| 1 | `android/app/build.gradle` signs **release** with `debug.keystore`. Play rejects it / you can never update safely. | Make an upload keystore (`keytool -genkeypair -v -storetype PKCS12 -keystore nestgym-upload.jks -alias nestgym -keyalg RSA -keysize 2048 -validity 10000`), add a `release` signingConfig reading passwords from `~/.gradle/gradle.properties`. Back the .jks up in 2 places; keep **Play App Signing** ON. |
| 2 | `src/config/env.ts` points to `http://192.168.1.139:5000/api` (your laptop). The prod URL `gym-backend.pixelatenest.com` is a guess and did not resolve. | Deploy the backend on a real **HTTPS** domain, put that URL in `env.ts`. Release builds block `http://` (cleartext). Reviewers must be able to log in from anywhere. |
| 3 | No in-app / web **account deletion** (only owner-side "erase member"). Play requires it because the app has a Register screen. | Add "Delete my account" (Settings → Security) calling a backend endpoint, plus a public web page (e.g. `https://www.pixelatenest.com/legal/delete-account.html`) that explains how to request deletion (email support@pixelatenest.com, done within 30 days, what is kept: invoices for tax law). Paste that URL in the Data safety form. |
| 4 | Terms gate exists in the app now, but the Terms/Privacy pages must be live. | Check https://www.pixelatenest.com/legal/terms-of-service.html and /legal/privacy-policy.html (NestGym tab) open publicly. |
| 5 | Photos are uploaded to your server; camera is used. | Privacy policy must mention photos + camera (it lists photos already — confirm). |
| 6 | Reviewer needs a working login. | Create a dedicated demo owner account with sample data (use `labh@gym.com` style seed) and a password you are happy to share. Terms must already be accepted on it, 2FA off, no OTP/WhatsApp step. |

Build the bundle: `cd NestGym/NestGym/android && ./gradlew bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`. Bump `versionCode` on every upload.

---

## 1. Developer account (one time)

- Fee: US$25 one-time. Choose **Organization** (Kalahanu Tech Studios LLP). Needs a **D-U-N-S number** (free, 1–2 weeks) and a business website/email domain. Verify phone + email.
- If you register as **Personal** (created after Nov 2023): you must run a **closed test with at least 12 testers for 14 continuous days** before Production access. Organization accounts skip this.
- Developer name shown on Play: **Pixelate Nest** (or Kalahanu Tech Studios LLP). Public contact: support@pixelatenest.com, website https://www.pixelatenest.com, phone +91-84069-12345.

---

## 2. Create app

| Field | Enter |
|---|---|
| App name (max 30) | `NestGym: Gym Management` |
| Default language | English (India) – en-IN |
| App or game | App |
| Free or paid | Free (the gym subscription is bought outside Play — see §7) |
| Declarations | Tick Developer Program Policies + US export laws |

---

## 3. Main store listing

**Short description (max 80):**
`Run your gym: members, fees, attendance, classes and reports in one app.`

**Full description (max 4000):**
```
NestGym is the all-in-one gym management app for gym owners, managers, trainers and front-desk staff — and a simple portal for your members.

MANAGE MEMBERS
• Add members in seconds with photo, health notes, fitness goals and emergency contact
• Search by name, phone or member code
• See plan, validity, dues and renewal status at a glance
• Import and export members

MEMBERSHIPS, BILLING & FEES
• Create plans (monthly, quarterly, half-yearly, annual, student, custom)
• Sell and renew memberships, apply discounts and coupons, collect part-payments
• GST invoices with your own logo and details, share as PDF
• Track dues, expenses and daily collection

TRAINING & CLASSES
• Assign trainers, manage personal-training packages and sessions
• Schedule classes, bookings and capacity
• Workout and diet plan templates, body measurements and progress

TEAM & ACCESS
• Roles for owner, branch manager, receptionist, accountant and trainer
• Lockers, equipment, announcements and staff payroll basics

REPORTS
• Revenue, dues, expiring memberships, birthdays, collections and growth charts

FOR YOUR MEMBERS
• Members can see their plan, validity, payments and announcements

SECURITY
• Password + optional two-factor authentication, passkeys and app lock
• Your gym's data is private to your gym

NestGym is built in India by Pixelate Nest. Need help? support@pixelatenest.com
```

| Field | Enter |
|---|---|
| App icon | 512×512 PNG, 32-bit, ≤1 MB (export from `mipmap-xxxhdpi/ic_launcher.png` at higher res or the brand logo) |
| Feature graphic | 1024×500 PNG/JPG, no transparency |
| Phone screenshots | 2–8, 9:16 portrait, 1080×1920 recommended. Suggested set: Dashboard, Members list, Member profile, Sell membership, Invoice, Classes, Reports, Settings |
| 7"/10" tablet screenshots | Optional |
| Promo video | Optional (YouTube URL) |

**App category:** `Health & Fitness` (best discovery for gym owners). Alternative: `Business`.
**Tags (pick up to 5):** Fitness, Health & Fitness tracking, Business tools / Productivity-style tags offered in the list.
**Store listing contact:** Email support@pixelatenest.com · Phone +91 84069 12345 · Website https://www.pixelatenest.com
**Privacy policy URL:** https://www.pixelatenest.com/legal/privacy-policy.html

---

## 4. App content (Policy → App content)

| Section | Answer |
|---|---|
| **Privacy policy** | URL above |
| **App access** | "All or some functionality is restricted". Add instructions: *"Open the app → Login. Email: `<demo email>` Password: `<demo password>`. The account is a gym owner with sample members, plans, invoices and classes. No OTP or 2FA is needed."* |
| **Ads** | No, my app does not contain ads |
| **Content rating** | Category: *Utility, Productivity, Communication or Other*. Answer **No** to violence, sexual content, profanity, drugs/alcohol/tobacco, gambling, user-generated public content, location sharing, and online purchases between users. Expect rating: **Everyone / 3+**. (The app has no public chat or social feed.) |
| **Target audience** | Age group **18 and over** only. Not designed for children. |
| **News app** | No |
| **COVID-19 contact tracing/status** | No |
| **Data safety** | See §5 |
| **Government app** | No |
| **Financial features** | Select **"My app doesn't provide any financial features"** — it only records gym fees and optionally opens a Razorpay checkout for a gym's own membership payment; it is not a bank, loan, wallet or investment app. If Play asks about payments, say payments are processed by Razorpay. |
| **Health apps** | Declare the app has **health & fitness features**: "Activity, fitness and nutrition tracking" (workout/diet plans, body measurements). It is **not** a medical device, does not diagnose, and does not process data from Health Connect. Add the disclaimer: *"NestGym is for gym administration and fitness tracking, not medical advice."* |
| **Advertising ID** | Not used (no ads / analytics SDK that reads it) — answer **No** |
| **Account deletion** | URL from step 0 #3 |

---

## 5. Data safety form (exact answers)

**Does your app collect or share user data?** Yes.
**Is all data encrypted in transit?** Yes (HTTPS) — only true after fixing step 0 #2.
**Can users request data deletion?** Yes (in-app + web URL).

| Data type (Play category) | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|
| Personal info → **Name** | Yes | No | App functionality, Account management | Required |
| Personal info → **Email address** | Yes | No | App functionality, Account management, Communications | Required for staff; optional for members |
| Personal info → **Phone number** | Yes | No* | App functionality, Account management, Communications (reminders/OTP) | Required |
| Personal info → **Address** | Yes | No | App functionality (member and gym address on invoices) | Optional |
| Personal info → **User IDs** | Yes | No | App functionality, Account management | Required |
| Personal info → **Other info** (date of birth, gender, emergency contact, ID proof number) | Yes | No | App functionality | Optional |
| Health & fitness → **Health info** (blood group, health conditions) | Yes | No | App functionality | Optional |
| Health & fitness → **Fitness info** (goals, workout/diet plans, body measurements) | Yes | No | App functionality | Optional |
| Financial info → **Purchase history** (memberships, invoices, payments) | Yes | No | App functionality | Required |
| Financial info → **Payment info** | **No** — card/UPI details are entered on Razorpay's own checkout and never reach NestGym servers | — | — | — |
| Photos and videos → **Photos** (member/staff profile photo, taken with camera or picked from gallery) | Yes | No | App functionality | Optional |
| App activity → **App interactions** (screens viewed) | Yes | No | Analytics (own dashboard) | Required |
| App info and performance → **Crash logs**, **Diagnostics** (errors, device platform, app version, IP address in server logs) | Yes | No | App functionality, Analytics, Fraud prevention/security | Required |
| Location, Contacts, Calendar, Messages, Audio, Files & docs | **No** | — | — | — |
| Device or other IDs (Advertising ID, IMEI) | **No** | — | — | — |

\*Data sent to processors acting on your behalf (Razorpay for payment checkout, Meta WhatsApp Cloud API for reminders, your hosting/MongoDB provider) is a **service provider transfer**, which Google does **not** count as "sharing". Keep "Shared = No" for those. If you add third-party analytics/ads later, update this form.

Security practices to tick: *Data is encrypted in transit*; *You provide a way for users to request deletion*; *Committed to Play Families policy* — **No** (not for children).

---

## 6. Permissions declaration

Manifest has only `INTERNET` (normal, no declaration) and `CAMERA` (to take a member/staff profile photo). No special-permission forms needed. Camera is optional: the app also works with the gallery photo picker.

---

## 7. Payments and Play billing policy (important)

NestGym's own **subscription for gym owners** is paid on the web / Razorpay link. Google requires Play Billing for digital goods **consumed inside the app**. Safest options:
1. **Keep the app free and do not sell the NestGym subscription inside the app.** Show "Manage your plan on gym.pixelatenest.com" only as plain text, no payment button/link to outside checkout (Play's "external offers" rules are strict outside the US/EEA). This is the lowest-risk path for review.
2. If you want in-app subscription purchases, integrate Google Play Billing (30%/15% fee).
Gym **members paying their gym** (real-world service: gym membership) via Razorpay is a physical-service payment and is allowed.

---

## 8. Release

1. **Testing → Internal testing** first (up to 100 testers, instant). Upload the AAB, add testers' Gmail IDs, test login/photo/camera/Razorpay on real phones.
2. Complete every item in the Play Console dashboard checklist ("Set up your app").
3. **Production → Create release** → upload AAB → release name `1.0` → release notes (en-IN):
   `First release of NestGym: manage members, memberships, billing, classes and reports.`
4. Countries: India (add others later). Submit for review — first review usually 2–7 days.

## 9. Pre-submission checklist

- [ ] Release signed with upload key, AAB builds
- [ ] HTTPS prod API, login works from mobile data
- [ ] Demo reviewer account + sample data, Terms already accepted
- [ ] Account deletion in app + web URL
- [ ] Privacy policy & Terms URLs public and mention camera, photos, health data, Razorpay, WhatsApp
- [ ] Icon 512, feature graphic 1024×500, ≥2 screenshots
- [ ] Data safety, content rating, target audience, health, financial, ads forms saved
- [ ] No debug logs, no test keys (check `RAZORPAY_KEY_ID` is the **live** key on the server)
