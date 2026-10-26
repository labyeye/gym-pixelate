const Setting = require("../models/Setting");
const Tenant = require("../models/Tenant");
const Member = require("../models/Member");
const Membership = require("../models/Membership");
const NotificationLog = require("../models/NotificationLog");
const { runWithTenant } = require("./tenantScope");
const { parsePhone } = require("./phone");
const { sendPlatformTemplate } = require("./whatsappOtp");

/*
 * Automatic member reminders on the platform WhatsApp number: plan expiring in 3 days, plan expired in the
 * last 3 days (and not renewed), birthday. Each gym switches each kind on in Settings (all off by default).
 * Templates (3 text params: member name, gym name, date / blank) come from env:
 *   WHATSAPP_REMINDER_EXPIRING_TEMPLATE, WHATSAPP_REMINDER_EXPIRED_TEMPLATE, WHATSAPP_REMINDER_BIRTHDAY_TEMPLATE
 * A kind without its template configured is skipped.
 */
const DAY = 86400000;
const IST_MS = 5.5 * 3600000;
const TEMPLATE = {
  expiring: () => process.env.WHATSAPP_REMINDER_EXPIRING_TEMPLATE,
  expired: () => process.env.WHATSAPP_REMINDER_EXPIRED_TEMPLATE,
  birthday: () => process.env.WHATSAPP_REMINDER_BIRTHDAY_TEMPLATE,
};
const fmt = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

async function send(tenantId, gym, member, kind, refKey, dateText) {
  const phone = member.whatsappOptIn !== false && !member.erasedAt && parsePhone(member.phone);
  if (!phone) return "skip";
  try {
    await NotificationLog.create({ tenantId, memberId: member._id, kind, refKey });
  } catch (e) {
    if (e.code === 11000) return "skip"; // already sent / in flight
    throw e;
  }
  try {
    await sendPlatformTemplate(phone.e164, TEMPLATE[kind](), [member.name, gym, dateText || "-"], process.env.WHATSAPP_REMINDER_TEMPLATE_LANG || "en", { tenantId, kind });
    await NotificationLog.updateOne({ tenantId, refKey }, { status: "sent" });
    return "sent";
  } catch (err) {
    if (err.code === "NO_CREDITS") {
      // not the member's fault: forget this attempt so the next run (after a top-up) sends it, and stop this gym's run
      await NotificationLog.deleteOne({ tenantId, refKey });
      throw err;
    }
    await NotificationLog.updateOne({ tenantId, refKey }, { status: "failed", error: String(err.message).slice(0, 300) });
    return "failed";
  }
}

async function runForGym(s, now = new Date()) {
  const tenantId = s.tenantId;
  const on = s.reminders || {};
  const out = { sent: 0, failed: 0, skipped: 0 };
  const bump = (r) => (out[r === "sent" ? "sent" : r === "failed" ? "failed" : "skipped"]++);
  const gym = s.companyName || (await Tenant.findById(tenantId).select("name").lean())?.name || "your gym";
  const member = (id) => Member.findById(id).select("name phone whatsappOptIn erasedAt status");

  if (on.expiring && TEMPLATE.expiring()) {
    const list = await Membership.find({ tenantId, status: "active", endDate: { $gt: now, $lte: new Date(now.getTime() + 3 * DAY) } }).limit(500);
    for (const ms of list) {
      const next = await Membership.exists({ tenantId, memberId: ms.memberId, _id: { $ne: ms._id }, endDate: { $gt: ms.endDate }, status: { $in: ["active", "upcoming"] } });
      const m = !next && (await member(ms.memberId));
      bump(m ? await send(tenantId, gym, m, "expiring", `expiring:${ms._id}`, fmt(ms.endDate)) : "skip");
    }
  }
  if (on.expired && TEMPLATE.expired()) {
    const list = await Membership.find({ tenantId, status: "expired", endDate: { $gte: new Date(now.getTime() - 3 * DAY), $lte: now } }).limit(500);
    for (const ms of list) {
      const later = await Membership.exists({ tenantId, memberId: ms.memberId, endDate: { $gt: now }, status: { $in: ["active", "upcoming", "frozen"] } });
      const m = !later && (await member(ms.memberId));
      bump(m && m.status === "active" ? await send(tenantId, gym, m, "expired", `expired:${ms._id}`, fmt(ms.endDate)) : "skip");
    }
  }
  if (on.birthday && TEMPLATE.birthday()) {
    const ist = new Date(now.getTime() + IST_MS);
    const month = ist.getUTCMonth() + 1;
    const day = ist.getUTCDate();
    const list = await Member.find({
      tenantId, status: "active", erasedAt: { $exists: false }, dob: { $ne: null },
      $expr: { $and: [{ $eq: [{ $month: "$dob" }, month] }, { $eq: [{ $dayOfMonth: "$dob" }, day] }] },
    }).select("name phone whatsappOptIn erasedAt status").limit(500);
    for (const m of list) bump(await send(tenantId, gym, m, "birthday", `birthday:${m._id}:${ist.getUTCFullYear()}`));
  }
  return out;
}

async function runAll() {
  const gyms = await Setting.find({ $or: [{ "reminders.expiring": true }, { "reminders.expired": true }, { "reminders.birthday": true }] }).lean();
  for (const s of gyms) {
    try {
      const r = await runWithTenant(s.tenantId, () => runForGym(s));
      if (r.sent || r.failed) console.log(`[reminders] ${s.tenantId}`, r);
    } catch (e) {
      if (e.code === "NO_CREDITS") console.warn("[reminders]", s.tenantId, e.message);
      else console.error("[reminders]", s.tenantId, e.message);
    }
  }
}

// ponytail: in-process timer like the payment-link job; on serverless call runAll from a real cron.
function startReminderJob() {
  if (process.env.VERCEL || process.env.REMINDERS_AUTO_SEND === "false") return;
  if (!process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN) return;
  setTimeout(() => runAll().catch(() => {}), 90 * 1000).unref();
  setInterval(() => runAll().catch(() => {}), 6 * 3600000).unref();
}

module.exports = { runForGym, runAll, startReminderJob };
