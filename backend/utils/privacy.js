const Member = require("../models/Member");
const User = require("../models/User");
const Session = require("../models/Session");
const Locker = require("../models/Locker");
const BodyMeasurement = require("../models/BodyMeasurement");

// Wipes a member's personal data but keeps the row (memberships and invoices still point at it for tax records).
async function anonymizeMember(member) {
  const id = member._id;
  const unset = {
    email: 1, altPhone: 1, photo: 1, dob: 1, anniversary: 1, occupation: 1, address: 1, city: 1, state: 1, pincode: 1,
    idProof: 1, emergencyContact: 1, health: 1, medicalNotes: 1, notes: 1, tags: 1, fitness: 1, source: 1,
  };
  await Member.collection.updateOne(
    { _id: id },
    { $set: { name: "Erased member", phone: `erased-${id}`, status: "inactive", whatsappOptIn: false, erasedAt: new Date(), userId: null }, $unset: unset },
  );
  if (member.userId) {
    await Session.deleteMany({ userId: member.userId });
    await User.deleteOne({ _id: member.userId });
  }
  await Locker.updateMany({ memberId: id, status: "assigned" }, { $set: { status: "available", memberId: null } });
  await BodyMeasurement.deleteMany({ memberId: id });
}

module.exports = { anonymizeMember };
