/*
 * Fills the gym of labh@gym.com with realistic sample data for client demos:
 *   node scripts/seed-demo-labh.js
 * Refuses to run if that gym already has members, so it can never mix with real data.
 * Demo members have WhatsApp switched OFF so no reminder ever reaches a real phone number.
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");

const models = {};
for (const n of ["User", "Branch", "MembershipPlan", "Member", "Membership", "Invoice", "Attendance", "Enquiry", "FollowUp", "GymClass", "ClassBooking", "Expense", "Product", "Coupon", "Locker", "Equipment", "PTPackage", "Announcement", "BodyMeasurement", "TrainerAssignment", "WorkoutPlan", "DietPlan", "Setting", "Tenant"]) {
  models[n] = require(`../models/${n}`);
}
const { nextCode, computeTotals } = require("../utils/gym");
const M = models;

// deterministic "random" so every run builds the same gym
let seed = 20261019;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const DAY = 86400000;
const now = Date.now();
const daysAgo = (n, h = 0, m = 0) => {
  const d = new Date(now - n * DAY);
  d.setHours(h, m, 0, 0);
  return d;
};
const daysAhead = (n) => new Date(now + n * DAY);

const MEN = ["Rahul Sharma", "Amit Verma", "Karan Mehta", "Vikram Singh", "Rohan Patel", "Siddharth Jain", "Arjun Nair", "Manish Gupta", "Deepak Yadav", "Nikhil Rao", "Sanjay Desai", "Harsh Agarwal", "Pranav Kulkarni", "Yash Bansal"];
const WOMEN = ["Priya Singh", "Neha Kapoor", "Anjali Mishra", "Sneha Iyer", "Pooja Reddy", "Kavya Menon", "Isha Malhotra", "Ritu Chawla", "Divya Joshi", "Aditi Saxena", "Meera Pillai", "Tanvi Shah"];
const AREAS = ["Green Park", "Model Town", "Sector 21", "Civil Lines", "Lake View Colony", "MG Road", "Rose Garden"];
const GOALS = ["weight_loss", "muscle_gain", "strength", "endurance", "general_fitness", "flexibility"];
const SOURCES = ["walk_in", "referral", "instagram", "google", "facebook", "poster"];

let tenantId = null;
const startAt = new Date();

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const owner = await M.User.findOne({ email: "labh@gym.com" });
  if (!owner || !owner.tenantId) throw new Error("labh@gym.com (with a gym) was not found");
  tenantId = owner.tenantId;
  if (await M.Member.countDocuments({ tenantId })) throw new Error("This gym already has members; not seeding over real data.");
  const branch = await M.Branch.findOne({ tenantId });
  if (!branch) throw new Error("No branch found for this gym");
  const branchId = branch._id;
  const base = { tenantId, branchId };
  console.log("Seeding into tenant", String(tenantId));

  /* ---- company details (only blanks are filled) ---- */
  const setting = (await M.Setting.findOne({ tenantId })) || (await M.Setting.create({ tenantId }));
  const fill = {
    companyName: "Iron Paradise Fitness",
    companyAddress: "Plot 14, Model Town Road\nNear City Mall, Jaipur, Rajasthan 302018",
    companyPhone: "9876500011",
    companyEmail: "hello@ironparadise.fit",
    companyGST: "08ABCDE1234F1Z5",
    companyPAN: "ABCDE1234F",
    companyWebsite: "www.ironparadise.fit",
    companyState: "Rajasthan",
    companyStateCode: "08",
    bankName: "HDFC Bank",
    bankAccountName: "Iron Paradise Fitness",
    bankAccountNumber: "50200012345678",
    bankIFSC: "HDFC0001234",
    bankBranch: "Model Town, Jaipur",
    bankAccountType: "Current",
  };
  for (const [k, v] of Object.entries(fill)) if (!setting[k]) setting[k] = v;
  if (!setting.invoiceTerms?.length) setting.invoiceTerms = ["Fees once paid are non-refundable and non-transferable.", "Membership is valid only for the period mentioned on this invoice.", "Management is not responsible for loss of personal belongings."];
  await setting.save();
  await M.Branch.updateOne({ _id: branchId }, { name: branch.name || "Main Branch", address: branch.address || "Plot 14, Model Town Road", city: branch.city || "Jaipur", phone: branch.phone || "9876500011" });

  /* ---- plans ---- */
  const planDefs = [
    ["Monthly", "monthly", 30, 1500, 500, { gymAccess: true }],
    ["Quarterly", "quarterly", 90, 4000, 500, { gymAccess: true, dietConsult: true }],
    ["Half Yearly", "half_yearly", 180, 7000, 0, { gymAccess: true, dietConsult: true, locker: true }],
    ["Annual", "annual", 365, 12000, 0, { gymAccess: true, dietConsult: true, locker: true, classes: true, classCreditsPerMonth: 8 }],
    ["Student Monthly", "monthly", 30, 1000, 300, { gymAccess: true }],
  ];
  const plans = [];
  for (const [name, type, durationDays, price, admissionFee, includes] of planDefs) {
    plans.push(await M.MembershipPlan.create({ ...base, name, type, category: "gym", durationDays, price, admissionFee, gstPercent: 18, includes, freezeAllowedDays: durationDays >= 90 ? 15 : 0, description: `${name} access to the gym floor and cardio zone` }));
  }

  /* ---- trainers ---- */
  const trainerDefs = [
    ["Arjun Rathore", "arjun", "male", ["Weight training", "Strength", "Bodybuilding"], ["ACE CPT", "ISSA"], 8, 700, 35],
    ["Simran Kaur", "simran", "female", ["Yoga", "Zumba", "Weight loss"], ["RYT-200", "Zumba Instructor"], 6, 600, 30],
    ["Mohit Sharma", "mohit", "male", ["CrossFit", "HIIT", "Functional training"], ["CrossFit L2"], 5, 800, 40],
  ];
  const trainers = [];
  for (const [i, [name, h, gender, spec, cert, exp, rate, comm]] of trainerDefs.entries()) {
    trainers.push(
      await M.User.create({
        tenantId, branchId, name, email: `${h}@demo.nestgym.test`, password: "Trainer@123", role: "trainer", phone: `98765000${20 + i}`,
        employeeId: await nextCode(tenantId, "employee", "EMP", 3), monthlySalary: 22000 + i * 3000,
        avatar: `https://randomuser.me/api/portraits/${gender === "male" ? "men" : "women"}/${40 + i}.jpg`,
        trainerProfile: { specializations: spec, certifications: cert, experienceYears: exp, ptRate: rate, commissionPercent: comm, shift: i === 1 ? "05:30-13:30" : "06:00-14:00", maxClients: 25, gender, languages: ["English", "Hindi"], employmentType: "full_time", joiningDate: daysAgo(400 + i * 90), city: "Jaipur", bio: `${exp} years of coaching experience.` },
      }),
    );
  }
  const staffDefs = [["Rekha Gupta", "rekha", "receptionist"], ["Suresh Kumar", "suresh", "accountant"]];
  for (const [i, [name, h, role]] of staffDefs.entries()) {
    await M.User.create({ tenantId, branchId, name, email: `${h}@demo.nestgym.test`, password: "Staff@123", role, phone: `98765000${30 + i}`, employeeId: await nextCode(tenantId, "employee", "EMP", 3), monthlySalary: 15000 + i * 5000 });
  }

  /* ---- members, memberships, invoices ---- */
  const people = [...MEN.map((n) => [n, "male"]), ...WOMEN.map((n) => [n, "female"])].sort(() => rnd() - 0.5);
  const members = [];
  const memberships = [];
  const invoices = [];
  for (const [idx, [name, gender]] of people.entries()) {
    const plan = idx % 7 === 0 ? plans[4] : idx % 5 === 0 ? plans[3] : idx % 3 === 0 ? plans[2] : idx % 2 === 0 ? plans[1] : plans[0];
    // timeline: most members are active, some expiring soon, some expired, a few dues
    const kind = idx < 14 ? "active" : idx < 19 ? "expiring" : idx < 23 ? "expired" : "dues";
    let startAgo;
    if (kind === "active") startAgo = between(2, Math.max(3, plan.durationDays - 25));
    else if (kind === "expiring") startAgo = plan.durationDays - between(1, 6);
    else if (kind === "expired") startAgo = plan.durationDays + between(4, 40);
    else startAgo = between(1, 10);
    const start = daysAgo(startAgo);
    const end = new Date(start.getTime() + plan.durationDays * DAY);
    const photoIdx = idx + 1;
    const m = await M.Member.create({
      ...base, memberCode: await nextCode(tenantId, "member", "GYM"), name,
      phone: `9${between(100000000, 999999999)}`, email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`, whatsappOptIn: false,
      photo: `https://randomuser.me/api/portraits/${gender === "male" ? "men" : "women"}/${photoIdx}.jpg`,
      gender, dob: new Date(between(1982, 2005), between(0, 11), between(1, 28)), occupation: pick(["Software engineer", "Student", "Business owner", "Teacher", "CA", "Doctor", "Designer", "Banker"]),
      address: `${between(1, 99)}, ${pick(AREAS)}`, city: "Jaipur", state: "Rajasthan", pincode: `3020${between(10, 30)}`,
      emergencyContact: { name: pick(MEN), phone: `9${between(100000000, 999999999)}`, relation: pick(["Father", "Spouse", "Brother", "Friend"]) },
      health: { bloodGroup: pick(["A+", "B+", "O+", "AB+", "O-"]), conditions: [] },
      fitness: { goal: pick(GOALS), level: pick(["beginner", "intermediate", "advanced"]), heightCm: between(155, 188), startWeightKg: between(52, 95), targetWeightKg: between(50, 85), preferredSlot: pick(["early_morning", "morning", "evening"]) },
      source: pick(SOURCES), joinedOn: start, status: kind === "expired" && idx % 2 ? "inactive" : "active",
    });
    members.push({ doc: m, kind, start, end, plan });

    const status = kind === "expired" ? "expired" : "active";
    const t = computeTotals(
      [
        { kind: "membership", description: `${plan.name} membership`, quantity: 1, unitPrice: plan.price, gstPercent: plan.gstPercent },
        ...(plan.admissionFee ? [{ kind: "admission", description: "Admission fee", quantity: 1, unitPrice: plan.admissionFee, gstPercent: plan.gstPercent }] : []),
      ],
      kind === "active" && idx % 4 === 0 ? 200 : 0,
    );
    const paid = kind === "dues" ? Math.round(t.total * 0.5) : t.total;
    const ms = await M.Membership.create({
      ...base, memberId: m._id, planId: plan._id, planName: plan.name, startDate: start, endDate: end, status, price: plan.price, admissionFee: plan.admissionFee,
      discount: t.discount, gstAmount: t.gst, totalAmount: t.total, paidAmount: paid, dueDate: kind === "dues" ? daysAhead(between(2, 9)) : undefined, soldBy: owner._id,
    });
    memberships.push(ms);
    const method = pick(["upi", "cash", "card", "upi"]);
    invoices.push(
      await M.Invoice.create({
        ...base, memberId: m._id, membershipId: ms._id, invoiceNumber: await nextCode(tenantId, "invoice", "INV"),
        items: t.lines.map((l) => ({ ...l, refId: ms._id })), amount: t.taxable, discount: t.discount, gstAmount: t.gst, totalAmount: t.total, paidAmount: paid,
        paymentMethod: method, status: paid >= t.total ? "paid" : "partial", dueDate: kind === "dues" ? daysAhead(between(2, 9)) : undefined, issuedAt: start, createdBy: owner._id,
        payments: [{ amount: paid, method, paidAt: start, reference: method === "upi" ? `UPI${between(100000, 999999)}` : undefined, receivedBy: owner._id }],
      }),
    );
  }

  /* ---- attendance: last 14 days + a few people inside right now ---- */
  const attendance = [];
  for (const { doc, kind, start } of members) {
    if (kind === "expired") continue;
    const slot = doc.fitness.preferredSlot === "evening" ? 18 : doc.fitness.preferredSlot === "morning" ? 9 : 6;
    for (let d = 0; d < 14; d++) {
      if (daysAgo(d) < start || rnd() < 0.4) continue;
      const inAt = daysAgo(d, slot + between(0, 2), between(0, 59));
      const dur = between(45, 95);
      attendance.push({ ...base, memberId: doc._id, checkinAt: inAt, checkoutAt: new Date(inAt.getTime() + dur * 60000), durationMin: dur, method: pick(["face", "face", "manual", "qr"]), recordedBy: owner._id });
    }
  }
  const inside = members.filter((x) => x.kind === "active").slice(0, 4);
  for (const { doc } of inside) attendance.push({ ...base, memberId: doc._id, checkinAt: new Date(now - between(10, 70) * 60000), method: "face", recordedBy: owner._id });
  await M.Attendance.insertMany(attendance);

  /* ---- trainer assignments, PT packages, measurements ---- */
  const active = members.filter((x) => x.kind !== "expired");
  for (const [i, x] of active.slice(0, 12).entries()) await M.TrainerAssignment.create({ ...base, trainerId: trainers[i % 3]._id, memberId: x.doc._id, assignedAt: x.start });
  for (const [i, x] of active.slice(0, 4).entries()) {
    const tr = trainers[i % 3];
    const sessions = Array.from({ length: 10 }, (_, s) => ({ scheduledAt: s < 5 ? daysAgo(25 - s * 4 - i, 7) : daysAhead((s - 4) * 3 + i), status: s < 5 ? "completed" : "scheduled", completedAt: s < 5 ? daysAgo(25 - s * 4 - i, 8) : undefined }));
    await M.PTPackage.create({ ...base, memberId: x.doc._id, trainerId: tr._id, name: "Personal Training - 10 sessions", totalSessions: 10, pricePerSession: tr.trainerProfile.ptRate, totalAmount: tr.trainerProfile.ptRate * 10, paidAmount: tr.trainerProfile.ptRate * 10, commissionPercent: tr.trainerProfile.commissionPercent, validTill: daysAhead(45), sessions });
  }
  for (const x of active.slice(0, 4)) {
    const w0 = x.doc.fitness.startWeightKg;
    for (let k = 0; k < 4; k++) await M.BodyMeasurement.create({ tenantId, memberId: x.doc._id, measuredAt: daysAgo(90 - k * 28), weightKg: w0 - k * 1.8, heightCm: x.doc.fitness.heightCm, bodyFatPct: 26 - k * 1.2, waistCm: 92 - k * 2, chestCm: 100 + k, recordedBy: owner._id });
  }

  /* ---- classes ---- */
  const classDefs = [
    ["Morning Yoga", "yoga", 1, [1, 3, 5], "06:30", 20], ["Zumba", "zumba", 1, [2, 4, 6], "18:30", 25], ["HIIT Burn", "hiit", 2, [1, 3, 5], "07:30", 15],
    ["CrossFit WOD", "crossfit", 2, [2, 4, 6], "19:30", 12], ["Evening Yoga", "yoga", 1, [1, 2, 3, 4, 5], "19:00", 20],
  ];
  const classes = [];
  for (const [name, category, ti, days, start, capacity] of classDefs) {
    classes.push(await M.GymClass.create({ ...base, name, category, trainerId: trainers[ti]._id, room: category === "yoga" ? "Studio A" : "Functional Zone", capacity, durationMin: 60, schedule: days.map((day) => ({ day, start })), dropInPrice: 300 }));
  }
  const nextSession = (c) => {
    for (let i = 0; i < 8; i++) {
      const d = new Date(now + i * DAY);
      if (c.schedule.some((s) => s.day === d.getDay())) { d.setHours(0, 0, 0, 0); return d; }
    }
    return daysAhead(1);
  };
  for (const c of classes.slice(0, 3)) for (const x of active.slice(0, 6)) await M.ClassBooking.create({ ...base, classId: c._id, memberId: x.doc._id, sessionDate: nextSession(c), status: "booked" });

  /* ---- workout & diet templates ---- */
  const ex = (name, sets, reps) => ({ name, sets, reps });
  await M.WorkoutPlan.create({ tenantId, branchId, name: "Beginner Full Body (4 weeks)", goal: "general_fitness", level: "beginner", weeks: 4, isTemplate: true, trainerId: trainers[0]._id, days: [{ label: "Day 1 - Full body", focus: "Strength basics", exercises: [ex("Goblet squat", 3, "12"), ex("Push-ups", 3, "10"), ex("Lat pulldown", 3, "12")] }, { label: "Day 2 - Cardio & core", focus: "Conditioning", exercises: [ex("Treadmill", 1, "20 min"), ex("Plank", 3, "45s")] }] });
  await M.WorkoutPlan.create({ tenantId, branchId, name: "Muscle Gain Push-Pull-Legs", goal: "muscle_gain", level: "intermediate", weeks: 8, isTemplate: true, trainerId: trainers[0]._id, days: [{ label: "Day 1 - Push", focus: "Chest, shoulders, triceps", exercises: [ex("Bench press", 4, "8-10"), ex("Overhead press", 3, "10"), ex("Triceps pushdown", 3, "12")] }, { label: "Day 2 - Pull", focus: "Back, biceps", exercises: [ex("Lat pulldown", 4, "10"), ex("Seated row", 3, "12"), ex("Barbell curl", 3, "10")] }, { label: "Day 3 - Legs", focus: "Quads, hamstrings, calves", exercises: [ex("Squat", 4, "8"), ex("Leg press", 3, "12"), ex("Calf raise", 4, "15")] }] });
  await M.DietPlan.create({ tenantId, branchId, name: "Weight loss - 1,600 kcal (veg)", type: "veg", goal: "weight_loss", targetCalories: 1600, targetProteinG: 90, waterLitres: 3.5, isTemplate: true, trainerId: trainers[1]._id, meals: [{ slot: "breakfast", time: "08:00", items: "Oats with milk, 1 banana", calories: 350 }, { slot: "lunch", time: "13:00", items: "2 roti, dal, sabzi, salad", calories: 500 }, { slot: "evening_snack", time: "17:00", items: "Roasted chana, green tea", calories: 200 }, { slot: "dinner", time: "20:00", items: "Paneer bhurji, 1 roti, soup", calories: 450 }] });

  /* ---- enquiries & follow-ups ---- */
  const enqs = [];
  const enqDefs = [["Rohit Malhotra", "new"], ["Sakshi Arora", "contacted"], ["Varun Tiwari", "trial_booked"], ["Nidhi Bhatia", "trial_done"], ["Gaurav Sethi", "negotiating"], ["Pallavi Rao", "lost"], ["Ankit Joshi", "contacted"], ["Shruti Nair", "new"]];
  for (const [i, [name, status]] of enqDefs.entries()) {
    enqs.push(await M.Enquiry.create({ ...base, name, phone: `9${between(100000000, 999999999)}`, goal: pick(["Weight loss", "Muscle gain", "General fitness"]), interestedPlanId: pick(plans)._id, source: pick(["walk_in", "call", "instagram", "google"]), status, lostReason: status === "lost" ? "price" : "", assignedTo: owner._id, followUpAt: status === "lost" ? undefined : daysAhead(i % 3), trial: status === "trial_booked" || status === "trial_done" ? { date: status === "trial_done" ? daysAgo(2) : daysAhead(1), slot: "morning", attended: status === "trial_done" } : undefined }));
  }
  const fuMembers = members.filter((x) => x.kind === "expiring" || x.kind === "expired").slice(0, 5);
  for (const [i, x] of fuMembers.entries()) await M.FollowUp.create({ ...base, memberId: x.doc._id, kind: x.kind === "expired" ? "lapsed" : "renewal", outcome: pick(["contacted", "interested", "no_answer"]), note: "Called regarding renewal", nextFollowUpAt: daysAhead(i + 1), by: owner._id, byName: owner.name });

  /* ---- shop, coupons, lockers, equipment, expenses, announcements ---- */
  await M.Product.insertMany([
    ["Whey Protein 1 kg", "supplement", 2400, 1800, 14], ["Creatine Monohydrate 250 g", "supplement", 1200, 800, 9], ["Pre-workout 300 g", "supplement", 1500, 1000, 6], ["BCAA 250 g", "supplement", 1100, 750, 4],
    ["Protein Bar (box of 6)", "snack", 720, 480, 22], ["Shaker Bottle", "accessory", 350, 150, 30], ["Gym Towel", "accessory", 250, 100, 18], ["Electrolyte Drink", "beverage", 60, 35, 3],
  ].map(([name, category, price, costPrice, stock]) => ({ ...base, name, sku: name.split(" ")[0].toUpperCase().slice(0, 6) + between(10, 99), category, price, costPrice, gstPercent: category === "supplement" ? 18 : 12, stock, reorderLevel: 5 })));
  await M.Coupon.insertMany([
    { tenantId, code: "NEWYEAR20", description: "20% off any plan", type: "percent", value: 20, maxDiscount: 1500, validFrom: daysAgo(10), validTill: daysAhead(40), usageLimit: 100 },
    { tenantId, code: "FRIEND500", description: "Rs. 500 off on referral", type: "flat", value: 500, minAmount: 3000, validFrom: daysAgo(30), validTill: daysAhead(90) },
    { tenantId, code: "STUDENT10", description: "10% student discount", type: "percent", value: 10, validFrom: daysAgo(60), validTill: daysAhead(120) },
  ]);
  const lockerRows = [];
  for (let n = 1; n <= 12; n++) {
    const holder = n <= 5 ? active[n + 2]?.doc : null;
    lockerRows.push({ ...base, number: `L-${String(n).padStart(2, "0")}`, zone: n <= 6 ? "men" : "women", monthlyRent: 300, deposit: 500, status: n === 12 ? "maintenance" : holder ? "assigned" : "available", memberId: holder?._id || null, assignedOn: holder ? daysAgo(20) : undefined, validTill: holder ? daysAhead(10) : undefined });
  }
  await M.Locker.insertMany(lockerRows);
  await M.Equipment.insertMany([
    ["Treadmill Pro 3000", "cardio", "Cosco", 185000, "working", 60], ["Treadmill Pro 3000 #2", "cardio", "Cosco", 185000, "under_maintenance", 60], ["Elliptical Cross Trainer", "cardio", "Life Fitness", 120000, "working", 90],
    ["Olympic Bench Press", "strength", "Body Solid", 45000, "working", 120], ["Leg Press Machine", "strength", "Hammer Strength", 210000, "working", 90], ["Cable Crossover", "strength", "Technogym", 260000, "working", 90],
    ["Dumbbell Set 2-50 kg", "free_weights", "Rubberex", 150000, "working", 180], ["Smith Machine", "strength", "Body Solid", 95000, "out_of_order", 90],
  ].map(([name, category, brand, purchaseCost, status, every], i) => ({ ...base, name, category, brand, serialNo: `SN${between(10000, 99999)}`, purchasedOn: daysAgo(300 + i * 40), purchaseCost, warrantyTill: daysAhead(200 - i * 50), status, serviceEveryDays: every, lastServiceOn: daysAgo(every - (i % 3 === 0 ? -5 : 20)), nextServiceOn: daysAhead(i % 3 === 0 ? -5 : 20 + i * 4) })));
  const exp = [["rent", 65000, "Landlord - Model Town"], ["salary", 112000, "Staff salaries"], ["electricity", 18400, "JVVNL"], ["marketing", 12000, "Instagram ads"], ["supplies", 4500, "Cleaning supplies"], ["maintenance", 8200, "Treadmill service"], ["water", 2100, "Water tanker"], ["software", 3000, "NestGym subscription"]];
  await M.Expense.insertMany([...exp.map(([category, amount, vendor], i) => ({ ...base, category, amount, vendor, description: vendor, paidOn: daysAgo(3 + i * 3), method: pick(["bank_transfer", "upi", "cash"]), recordedBy: owner._id })), ...exp.slice(0, 5).map(([category, amount, vendor], i) => ({ ...base, category, amount, vendor, description: vendor, paidOn: daysAgo(33 + i * 3), method: "bank_transfer", recordedBy: owner._id }))]);
  await M.Announcement.insertMany([
    { tenantId, title: "Gym closed on Holi", body: "The gym will remain closed on Holi. Regular timings resume the next day.", kind: "holiday", audience: "all", publishAt: daysAgo(1), expiresAt: daysAhead(14), pinned: true, createdBy: owner._id },
    { tenantId, title: "New batch: Evening Yoga", body: "Evening Yoga now runs Monday to Friday at 7:00 PM with Simran.", kind: "event", audience: "active_members", publishAt: daysAgo(3), expiresAt: daysAhead(30), createdBy: owner._id },
    { tenantId, title: "Refer a friend, get Rs. 500 off", body: "Use code FRIEND500 on your next renewal.", kind: "offer", audience: "active_members", publishAt: daysAgo(6), expiresAt: daysAhead(60), createdBy: owner._id },
  ]);

  console.log(`Done: ${members.length} members, ${plans.length} plans, ${trainers.length} trainers, ${invoices.length} invoices, ${attendance.length} check-ins, ${enqs.length} enquiries.`);
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error("FAILED:", e.message);
  // undo a half-finished run: remove everything this run created (nothing older is touched)
  if (tenantId && !/already has members|not found|No branch/.test(e.message)) {
    for (const n of ["Member", "Membership", "Invoice", "Attendance", "Enquiry", "FollowUp", "GymClass", "ClassBooking", "Expense", "Product", "Coupon", "Locker", "Equipment", "PTPackage", "Announcement", "BodyMeasurement", "TrainerAssignment", "WorkoutPlan", "DietPlan", "MembershipPlan"]) {
      await M[n].deleteMany({ tenantId, createdAt: { $gte: startAt } }).catch(() => {});
    }
    await M.User.deleteMany({ tenantId, role: { $ne: "gym_owner" }, createdAt: { $gte: startAt } }).catch(() => {});
    console.error("Rolled back the partial data.");
  }
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
