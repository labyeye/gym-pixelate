const express = require("express");
const router = express.Router();
const AttendanceDevice = require("../models/AttendanceDevice");
const User = require("../models/User");
const Member = require("../models/Member");
const Setting = require("../models/Setting");
const { runWithTenant } = require("../utils/tenantScope");
const { staffPunch, memberPunch } = require("../utils/punch");
const hr = require("../utils/staffHr");
const AttendanceDeviceLog = require("../models/AttendanceDeviceLog");

// one line in Biometric > Activity Logs; never lets a logging problem break the device protocol
const log = (d, req, entry) =>
  AttendanceDeviceLog.create({
    tenantId: d.tenantId,
    serialNumber: d.serialNumber,
    ip: req.ip,
    ...entry,
  }).catch(() => {});

/*
 * ADMS "push" protocol used by ZKTeco / eSSL terminals (set the device's Cloud Server address to this API's host,
 * path /iclock). The device is trusted only if its serial number is registered by a gym (Settings > Attendance devices).
 * Each ATTLOG line is "PIN<TAB>YYYY-MM-DD HH:mm:ss<TAB>state<TAB>verify...". PIN = the person's Biometric ID in NestGym.
 * ponytail: no command queue (we never push users/templates down to the device) and no per-device secret, since the
 * protocol has none; add IP allow-listing per device if a gym is worried about a spoofed serial.
 */
router.use(express.text({ type: "*/*", limit: "1mb" }));

const device = (req) =>
  AttendanceDevice.findOne({ serialNumber: String(req.query.SN || "").trim() });
const touch = (d, req, extra = {}) =>
  AttendanceDevice.updateOne(
    { _id: d._id },
    { $set: { lastSeenAt: new Date(), ip: req.ip, ...extra } },
  ).catch(() => {});

// device handshake / config
router.get("/cdata", async (req, res) => {
  const d = await device(req);
  if (!d) return res.status(404).type("text").send("UNKNOWN DEVICE");
  touch(d, req);
  log(d, req, { kind: "handshake", detail: "Device connected" });
  res
    .type("text")
    .send(
      `GET OPTION FROM: ${d.serialNumber}\nStamp=9999\nOpStamp=9999\nErrorDelay=60\nDelay=30\nTransTimes=00:00;14:00\nTransInterval=1\nTransFlag=TransData AttLog\nRealtime=1\nEncrypt=0\n`,
    );
});

// punches
router.post("/cdata", async (req, res) => {
  const d = await device(req);
  if (!d) return res.status(404).type("text").send("UNKNOWN DEVICE");
  if (String(req.query.table).toUpperCase() !== "ATTLOG")
    return res.type("text").send("OK");
  const lines = String(req.body || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let done = 0;
  const why = {};
  let newest = d.lastLogAt;
  await runWithTenant(d.tenantId, async () => {
    const s = await Setting.findOne({ tenantId: d.tenantId }).lean();
    for (const line of lines) {
      const [pin, stamp] = line.split("\t");
      if (!pin || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(stamp || "")) {
        why["bad line"] = (why["bad line"] || 0) + 1;
        continue;
      }
      const at = new Date(`${stamp.replace(" ", "T")}+05:30`); // devices here run on IST
      if (
        Number.isNaN(at.getTime()) ||
        (d.lastLogAt && at <= d.lastLogAt) ||
        at.getTime() > Date.now() + 3600000
      ) {
        why["resend / future time"] = (why["resend / future time"] || 0) + 1;
        continue;
      }
      try {
        const user = await User.findOne({
          tenantId: d.tenantId,
          biometricId: pin.trim(),
          status: "active",
        });
        if (user) {
          if (!hr.moduleOn(s, user.role))
            throw new Error(`${user.role} attendance is off`);
          await staffPunch(user, { mode: "biometric", at });
        } else {
          const member = await Member.findOne({
            tenantId: d.tenantId,
            biometricId: pin.trim(),
          });
          if (!member)
            throw new Error(`ID ${pin.trim()} is not assigned to anyone`);
          if (!hr.moduleOn(s, "member"))
            throw new Error("member attendance is off");
          await memberPunch(member, { mode: "biometric", at });
        }
        done++;
      } catch (e) {
        // already checked in/out, plan expired, unknown ID...: skip this line, keep the rest, and say why in the log
        why[e.message] = (why[e.message] || 0) + 1;
      }
      if (!newest || at > newest) newest = at;
    }
  });
  touch(d, req, newest ? { lastLogAt: newest } : {});
  log(d, req, {
    kind: "punches",
    received: lines.length,
    marked: done,
    skipped: lines.length - done,
    detail: Object.entries(why)
      .map(([k, n]) => `${n}x ${k}`)
      .join("; ")
      .slice(0, 600),
  });
  res.type("text").send(`OK:${done}`);
});

// polling for commands: we never send any
router.get("/getrequest", async (req, res) => {
  const d = await device(req);
  if (d) touch(d, req);
  res.type("text").send("OK");
});
router.post("/devicecmd", (req, res) => res.type("text").send("OK"));

module.exports = router;
