import io
BLUE = "#0B4AA8"; ORANGE = "#F97316"; NAVY = "#0A1F44"

CSS = f"""
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
@page {{ size: 794px 1123px; margin:0 }}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:'Plus Jakarta Sans',sans-serif;color:{NAVY};-webkit-print-color-adjust:exact}}
.page{{width:794px;height:1123px;position:relative;overflow:hidden;page-break-after:always;background:#fff;padding:0 52px}}
.hdr{{display:flex;justify-content:space-between;align-items:center;height:68px;border-bottom:1px solid #e3e8f2;margin:0 -52px;padding:0 52px}}
.hdr img{{height:26px}} .hdr span{{font-size:10px;letter-spacing:2px;color:#5b6784;font-weight:600}}
.ftr{{position:absolute;left:0;right:0;bottom:0;height:56px;border-top:1px solid #e3e8f2;display:flex;justify-content:space-between;align-items:center;padding:0 52px;font-size:11px;color:#5b6784}}
.ftr b{{color:{BLUE}}} .ftr .n{{font-weight:800;color:{NAVY};font-size:13px}}
.tag{{display:inline-flex;gap:10px;align-items:center;margin-top:34px;font-size:10.5px;letter-spacing:2px;font-weight:800;color:{ORANGE}}}
.tag i{{font-style:normal;background:{ORANGE};color:#fff;padding:4px 8px;border-radius:5px;letter-spacing:0}}
h1{{font-size:38px;line-height:1.1;font-weight:800;letter-spacing:-1.2px;margin-top:14px}} h1 em{{font-style:normal;color:{BLUE}}}
.lead{{font-size:13.5px;line-height:1.6;color:#5b6784;margin-top:14px;max-width:660px}}
.shot{{margin-top:22px;border:2px solid {NAVY};border-radius:12px;overflow:hidden;box-shadow:8px 8px 0 #dbe4f5;background:#fff}}
.shot .bar{{height:20px;background:#eef2f9;display:flex;gap:5px;align-items:center;padding-left:10px}}
.shot .bar b{{width:7px;height:7px;border-radius:50%;background:#c9d2e3}}
.shot img{{display:block;width:100%;object-fit:cover;object-position:top left}}
.grid2{{display:grid;grid-template-columns:1fr 1fr;gap:16px 36px;margin-top:22px}}
.f{{display:flex;gap:12px}} .f .ic{{flex:none;width:34px;height:34px;border-radius:9px;background:#e8effb;color:{BLUE};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px}}
.f:nth-child(even) .ic{{background:#ffeadb;color:{ORANGE}}}
.f h4{{font-size:13.5px;font-weight:700}} .f p{{font-size:11.5px;color:#5b6784;line-height:1.45;margin-top:2px}}
.band{{position:absolute;left:52px;right:52px;bottom:84px;background:{NAVY};color:#fff;border-radius:14px;padding:18px 22px;display:flex;gap:16px;align-items:center}}
.band .ic{{width:40px;height:40px;border-radius:10px;background:{ORANGE};flex:none;display:flex;align-items:center;justify-content:center;font-size:20px}}
.band h4{{font-size:14px}} .band p{{font-size:11.5px;color:#b9c6e3;margin-top:2px}}
.cover{{background:linear-gradient(160deg,#0A3A8C,#04163a);color:#fff;padding:0 52px}}
.pill{{display:inline-block;border:1px solid #ffffff55;border-radius:30px;padding:10px 18px;font-size:11.5px;font-weight:600;margin:0 8px 10px 0;background:#ffffff14}}
.cards{{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px}}
.card{{border:1px solid #e3e8f2;border-radius:12px;padding:13px 14px;display:flex;gap:12px}}
.card h4{{font-size:13px}} .card p{{font-size:11px;color:#5b6784;margin-top:2px;line-height:1.4}}
.stats{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:20px}}
.stat{{background:#f1f5fc;border-radius:12px;text-align:center;padding:18px 6px}} .stat b{{display:block;font-size:24px;color:{BLUE}}} .stat span{{font-size:11px;color:#5b6784}}
.box{{border:2px solid {NAVY};border-radius:12px;padding:16px 18px;box-shadow:6px 6px 0 {ORANGE}}} .box h4{{font-size:14px;margin-bottom:8px}}
.box li{{list-style:none;font-size:11.5px;color:#4a5878;padding:4px 0}} .box li:before{{content:'✓  ';color:{BLUE};font-weight:800}}
.phones{{display:flex;gap:20px;justify-content:center;margin-top:24px}}
.phone{{width:196px;border:5px solid {NAVY};border-radius:30px;overflow:hidden;background:#fff}} .phone img{{display:block;width:100%;height:400px;object-fit:cover;object-position:top}}
.cap{{text-align:center;font-size:11.5px;margin-top:8px}} .cap b{{display:block;font-size:13px}}
.ct{{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:30px}}
.ctc{{border:1px solid #ffffff30;border-radius:14px;padding:18px;background:#ffffff0d}} .ctc small{{font-size:10px;letter-spacing:2px;color:#9fb3da;font-weight:700}} .ctc div{{font-size:17px;font-weight:700;margin-top:6px}}
"""

def hdr(label):
    return f'<div class="hdr"><img src="assets/nestgym.png"><span>{label}</span></div>'

def ftr(n):
    return f'<div class="ftr"><span><b>NestGym</b> by Pixelate Nest</span><span class="n">{n:02d}</span></div>'

def shot(img, h, extra=""):
    return f'<div class="shot" {extra}><div class="bar"><b></b><b></b><b></b></div><img src="assets/{img}" style="height:{h}px"></div>'

def feats(items):
    return '<div class="grid2">' + "".join(f'<div class="f"><div class="ic">{i}</div><div><h4>{t}</h4><p>{d}</p></div></div>' for i, t, d in items) + '</div>'

def band(t, d, icon="★"):
    return f'<div class="band"><div class="ic">{icon}</div><div><h4>{t}</h4><p>{d}</p></div></div>'

def page(n, label, num, tag, h1, lead, body):
    return f'<section class="page">{hdr(label)}<div class="tag"><i>{num:02d}</i>{tag}</div><h1>{h1}</h1><p class="lead">{lead}</p>{body}{ftr(n)}</section>'

P = []
# 1 cover
P.append(f'''<section class="page cover">
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:52px"><div style="background:#fff;border-radius:14px;padding:14px 22px"><img src="assets/nestgym.png" style="height:40px"></div><div style="border:1px solid #ffffff55;border-radius:30px;padding:10px 20px;font-size:11px;letter-spacing:3px;font-weight:600">PRODUCT BROCHURE · 2026</div></div>
<h1 style="font-size:66px;margin-top:120px;letter-spacing:-2.5px">Run your whole <span style="color:{ORANGE}">gym</span> from one dashboard.</h1>
<p style="font-size:16px;line-height:1.6;color:#d3def5;margin-top:34px;max-width:520px">NestGym brings members, memberships, billing, trainers, classes and reports together — a web dashboard for your front desk and a mobile app for your members.</p>
<div style="position:absolute;left:52px;top:560px;width:690px"><div class="shot" style="border-color:#fff;box-shadow:10px 10px 0 #ffffff22">{'<div class="bar"><b></b><b></b><b></b></div>'}<img src="assets/d-dashboard.png" style="width:100%;height:280px;object-fit:cover;object-position:top left;display:block"></div></div>
<div style="position:absolute;left:52px;bottom:130px"><span class="pill">✓ Members &amp; renewals</span><span class="pill">✓ Billing &amp; GST invoices</span><br><span class="pill">✓ Trainers &amp; classes</span><span class="pill">✓ WhatsApp reminders</span></div>
<div style="position:absolute;left:52px;right:52px;bottom:40px;border-top:1px solid #ffffff33;padding-top:16px;display:flex;justify-content:space-between;font-size:11.5px;color:#c4d2ee"><span>A product of <b style="color:#fff">Pixelate Nest</b> · Muzaffarpur, Bihar</span><b style="color:#fff">www.pixelatenest.com</b></div>
</section>''')

# 2 about + why
P.append(f'''<section class="page">{hdr("ABOUT US")}
<div class="tag"><i>01</i>ABOUT PIXELATE NEST</div><h1>Technology partner for businesses that want to <em>grow smarter</em></h1>
<p class="lead">Pixelate Nest is an AI-powered technology partner and creative digital agency based in Muzaffarpur, Bihar. Since 2022 we have been building custom software, web and mobile apps, and digital experiences for businesses across India and beyond.</p>
<div class="stats"><div class="stat"><b>2022</b><span>Founded</span></div><div class="stat"><b>Web + App</b><span>Every product</span></div><div class="stat"><b>Nest</b><span>Product family</span></div><div class="stat"><b>5</b><span>Countries served</span></div></div>
<div class="cards" style="grid-template-columns:1fr 1fr"><div class="box"><h4>What we do</h4><ul><li>Custom software &amp; enterprise web applications</li><li>Android &amp; iOS mobile app development</li><li>Digital marketing, branding &amp; video production</li><li>AI-powered products and automation</li></ul></div><div class="box"><h4>The Nest product family</h4><ul><li><b>NestGym</b> — gym &amp; fitness management</li><li><b>NestHR</b> — attendance, payroll &amp; HR</li><li><b>NestLeads</b> — CRM &amp; lead management</li><li><b>NestAcademy</b> — sports academy management</li></ul></div></div>
<div class="tag" style="margin-top:34px"><i>02</i>WHY NESTGYM</div><h1 style="font-size:30px">Stop chasing renewals. <em>Run your gym on one system.</em></h1>
<p class="lead">Registers, Excel sheets and WhatsApp groups hide who has expired, who owes money and which trainer is overloaded. Every gap between those tools is lost revenue.</p>
<div style="display:grid;grid-template-columns:1fr 1.2fr;gap:20px;margin-top:20px;align-items:center"><div style="border:1.5px dashed {ORANGE};background:#fff6ee;border-radius:12px;padding:16px"><b style="color:{ORANGE};font-size:10.5px;letter-spacing:2px">TODAY</b><p style="font-size:12px;margin-top:8px;line-height:1.9;text-decoration:line-through;color:#6b6b6b">Paper register · Excel dues sheet · Notebook for lockers · Separate billing app · Trainer WhatsApp group</p></div><div style="background:#e8effb;border:1px solid #b9cdf0;border-radius:12px;padding:16px"><b style="color:{BLUE};font-size:10.5px;letter-spacing:2px">WITH NESTGYM</b><div style="font-size:17px;font-weight:800;margin-top:6px">One login. One member record.</div><p style="font-size:11.5px;color:#4a5878;margin-top:4px;line-height:1.5">Plans feed invoices, payments close dues, and every change is logged — for owners, front desk and trainers.</p></div></div>
{ftr(2)}</section>''')

# 3 platform
mods = [("◉","Members","Profiles, goals, photos, documents and full history."),("▣","Memberships & Plans","Plans, freezes, transfers, renewals and expiry tracking."),("₹","Billing & Invoices","GST invoices, part payments, refunds and pay links."),("◔","Group Classes","Weekly schedules, bookings and waitlists."),("♥","Personal Training","PT packages, session tracking and trainer commission."),("✎","Workout & Diet","Assign workout and diet plans to each member."),("⚙","Trainers & Staff","Shifts, clients, leave and attendance."),("▤","Shop / POS","Inventory, low-stock alerts, coupons and sales."),("▦","Lockers & Equipment","Locker allotment and equipment service reminders."),("▲","Reports & Insights","Revenue, GST, churn, renewals and utilisation.")]
cards = "".join(f'<div class="card"><div class="f"><div class="ic" style="background:{"#e8effb" if i%2==0 else "#ffeadb"};color:{BLUE if i%2==0 else ORANGE}">{ic}</div></div><div><h4>{t}</h4><p>{d}</p></div></div>' for i,(ic,t,d) in enumerate(mods))
P.append(f'''<section class="page">{hdr("PLATFORM OVERVIEW")}<div class="tag"><i>03</i>THE PLATFORM</div><h1>Everything a gym runs on, <em>in one place</em></h1><p class="lead">Every module shares the same member record. One sale updates the membership, raises the invoice, closes the due and refreshes your reports — with no re-entry.</p>
<div class="cards">{cards}</div>
<div class="tag" style="margin-top:26px">ONE SYSTEM · THREE KINDS OF USERS</div>
<div class="stats" style="grid-template-columns:repeat(3,1fr)"><div class="stat" style="text-align:left;padding:16px"><b style="font-size:14px">Owners &amp; managers</b><span>Full control of plans, pricing, finance and reports.</span></div><div class="stat" style="text-align:left;padding:16px"><b style="font-size:14px">Front desk &amp; trainers</b><span>Sell memberships, take payments, run classes and PT.</span></div><div class="stat" style="text-align:left;padding:16px"><b style="font-size:14px">Members</b><span>See plan, dues and bookings on their phone.</span></div></div>
{band("Web dashboard for the gym. Mobile app for everyone else.","Your team works from the desktop; members stay in touch from the NestGym mobile app.","▣")}{ftr(3)}</section>''')

# 4 dashboard
P.append(page(4,"DASHBOARD",4,"COMMAND CENTRE",'Your gym, <em>at a glance</em>',"Open NestGym and see what needs attention today — who is expiring, who owes money, what came in this week — before you open a single register.",
 shot("d-dashboard.png",430)+feats([("◉","Active memberships","Active, expired and frozen counts, live."),("₹","Collections","Today, this month and the last 7 days."),("!","Dues outstanding","See who owes what, with member count."),("⚑","Renewals due","Memberships expiring in the next 7 days.")])+band("Decisions in seconds, not hours.","No month-end scramble to compile numbers — the dashboard is always current.","⚡")))

# 5 members
P.append(page(5,"MEMBERS",5,"MEMBER MANAGEMENT",'One record for every <em>member</em>',"Contact details, plan, validity, dues, goals and history live in a single searchable profile. Add members one by one or import your whole base from Excel.",
 shot("d-members.png",430)+feats([("◉","Complete profiles","Plan, validity, dues, goal and source at a glance."),("▤","Document vault","Store IDs, forms and waivers securely per member."),("⇪","Excel import & export","Bring in existing members with a ready template."),("⚿","Role-based access","Control who sees finance, documents and reports.")])+band("Plan, payments, bookings — together.","Open any member and see their whole journey in one view.","▣")))

# 6 memberships & plans
P.append(page(6,"MEMBERSHIPS & PLANS",6,"RENEWALS THAT HAPPEN",'Plans that <em>sell and renew</em> themselves',"Build monthly to yearly plans, include lockers or classes, and watch expiry dates, dues and renewals from one screen.",
 shot("d-plans.png",235)+shot("d-memberships.png",235)+feats([("▣","Flexible plans","Duration, price, GST, joining fee and inclusions."),("❄","Freeze & transfer","Allow holiday freezes and plan transfers."),("⚑","Expiry tracking","Expiring, expired and with-dues filters."),("↻","One-click renewal","Renew or upgrade straight from the list.")]).replace("margin-top:22px","margin-top:14px")+band("Never miss a renewal again.","Every membership shows time left, fees paid and balance due.","↻")))

# 7 classes & PT
P.append(page(7,"CLASSES & TRAINING",7,"CLASSES & PERSONAL TRAINING",'Fill every class, <em>track every session</em>',"Publish a weekly class timetable, let members book seats, and run personal-training packages with sessions left and trainer commission worked out for you.",
 shot("d-classes.png",235)+shot("d-pt.png",235)+feats([("◔","Weekly schedule","Yoga, Zumba, CrossFit — by trainer and studio."),("▥","Seats & waitlist","Capacity, bookings and waiting lists."),("♥","PT packages","Sessions left, validity and amount paid."),("%","Trainer commission","Commission and PT rates per trainer.")]).replace("margin-top:22px","margin-top:14px")+band("From timetable to payout.","Classes and PT sessions feed straight into trainer reports.","♥")))

# 8 billing + POS
P.append(page(8,"BILLING & SHOP",8,"BILLING & POS",'Invoices, payments and <em>shop sales</em>',"Every membership and product sale creates a proper invoice. Take full or part payments, track balances and send payment links — all in the same ledger.",
 shot("d-invoices.png",235)+shot("d-shop.png",235)+feats([("₹","GST invoices","Numbered invoices with GST and a GST register."),("◐","Part payments & refunds","Every rupee recorded against the invoice."),("⇗","Pay links & reminders","Send dues reminders on WhatsApp."),("▤","Inventory & coupons","Stock, low-stock alerts and discount coupons.")]).replace("margin-top:22px","margin-top:14px")+band("Money in, money out — one ledger.","Dues, collections and expenses always reconcile.","₹")))

# 9 trainers & attendance
P.append(page(9,"TRAINERS & ATTENDANCE",9,"TEAM & ATTENDANCE",'Know who is <em>on the floor</em>',"Keep trainer profiles, shifts, clients and commission in one place — and track trainer, staff and member attendance the way your gym actually works.",
 shot("d-trainers.png",200)+shot("d-staffatt.png",235)+feats([("◉","Trainer profiles","Specialisation, shift, clients and PT rate."),("◔","Attendance modes","Desk marking, self check-in with location, face or biometric."),("☂","Leave management","Apply and approve staff and trainer leave."),("⚙","Optional by group","Switch attendance on for trainers, staff or members.")]).replace("margin-top:22px","margin-top:14px")+band("Hardware optional, accuracy included.","Works with common ESSL / ADMS biometric terminals.","⚙")))

# 10 reports & security
P.append(page(10,"REPORTS & SECURITY",10,"REPORTS & SECURITY",'Insights for owners. <em>Safety</em> for your data.',"Generate finance and member reports in one click, and keep your gym protected with strong sign-in controls and a clear activity trail.",
 shot("d-reports.png",380)+f'<div class="cards" style="margin-top:22px"><div class="box"><h4>Reports &amp; analytics</h4><ul><li>P&amp;L overview and GST register</li><li>Outstanding dues and daily transactions</li><li>Upcoming renewals and churn / cohorts</li><li>Trainer utilisation and birthdays</li></ul></div><div class="box"><h4>Security &amp; control</h4><ul><li>Two-factor sign-in and passkeys</li><li>Role-based staff permissions</li><li>Activity log of who changed what</li><li>Terms &amp; privacy acceptance built in</li></ul></div></div>'+band("Every number traceable to its source.","Reports are built from the same members, invoices and payments your team uses daily.","▲")))

# 11 mobile
P.append(page(11,"ON MOBILE",11,"ON THE GO",'Your gym in <em>every pocket</em>',"The NestGym mobile experience keeps owners, trainers and members connected — and the web app adapts to any phone screen.",
 '<div class="phones"><div><div class="phone"><img src="assets/m-dashboard.png"></div><div class="cap"><b>Dashboard</b>Collections &amp; renewals</div></div><div><div class="phone"><img src="assets/m-members.png"></div><div class="cap"><b>Members</b>Search and manage</div></div><div><div class="phone"><img src="assets/m-invoices.png"></div><div class="cap"><b>Invoices</b>Payments &amp; dues</div></div></div>'+
 feats([("▣","Mobile app","Owners and members stay connected on the go."),("◔","Class bookings","Members view schedules and book seats."),("⇗","WhatsApp reminders","Renewal and dues reminders to members."),("▤","Self-service","Members see plan, validity and invoices.")])+band("The web app works on any phone too.","Responsive layouts adapt every module to small screens — the same login works everywhere.","▣")))

# 12 contact
P.append(f'''<section class="page cover">
<div style="font-size:11px;letter-spacing:3px;color:{ORANGE};font-weight:800;margin-top:70px">LET'S TALK</div>
<h1 style="font-size:54px;margin-top:16px;letter-spacing:-2px">Ready to fill your <span style="color:{ORANGE}">gym</span>?</h1>
<p style="font-size:15px;line-height:1.6;color:#d3def5;margin-top:20px;max-width:560px">Book a live walkthrough and see NestGym with your own plans, trainers and classes. We will answer every question — and get you set up.</p>
<div class="ct"><div class="ctc"><small>CALL OR WHATSAPP</small><div>+91 84069 12345</div></div><div class="ctc"><small>EMAIL</small><div>support@pixelatenest.com</div></div><div class="ctc"><small>WEBSITE</small><div>www.pixelatenest.com</div></div><div class="ctc"><small>VISIT US</small><div style="font-size:15px">Kala Bhawan, Akharaghat Road, Muzaffarpur, Bihar 842001</div></div></div>
<div style="background:#fff;color:{NAVY};border-radius:14px;padding:22px 26px;margin-top:24px;display:flex;justify-content:space-between;align-items:center"><div><b style="font-size:19px">Book your live demo today</b><div style="font-size:12px;color:#5b6784;margin-top:4px">Message us on WhatsApp — we usually reply the same day.</div></div><div style="background:{BLUE};color:#fff;border-radius:10px;padding:14px 22px;font-weight:700;font-size:13px">wa.me/918406912345</div></div>
<div class="shot" style="margin-top:34px;border-color:#fff;box-shadow:10px 10px 0 #ffffff22"><div class="bar"><b></b><b></b><b></b></div><img src="assets/d-members.png" style="width:100%;height:330px;object-fit:cover;object-position:top left;display:block"></div>
<div style="position:absolute;left:52px;right:52px;bottom:34px;border-top:1px solid #ffffff33;padding-top:16px;display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:#c4d2ee"><div style="display:flex;gap:12px"><div style="background:#fff;border-radius:10px;padding:8px 14px"><img src="assets/pixelatenest.png" style="height:24px"></div><div style="background:#fff;border-radius:10px;padding:8px 14px"><img src="assets/nestgym.png" style="height:24px"></div></div><span style="text-align:right">© 2026 Pixelate Nest. All rights reserved.<br>NestGym is a product of Pixelate Nest.</span></div>
</section>''')

html = f'<!doctype html><html><head><meta charset="utf-8"><title>NestGym Brochure</title><style>{CSS}</style></head><body>{"".join(P)}</body></html>'
io.open("brochure.html", "w", encoding="utf-8", newline="").write(html)
print("ok")
