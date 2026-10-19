const crypto = require("crypto");
const Razorpay = require("razorpay");
const Setting = require("../models/Setting");
const { encrypt, decrypt } = require("./encryption");
const { fail } = require("./gym");

/*
 * Member -> gym payments go to the GYM's own Razorpay account (their keys, saved in Settings),
 * never through NestGym's SaaS account. The secret is stored AES-encrypted and never returned by the API.
 * createOrder / fetchPayment are the only network calls; tests replace them.
 */
const api = {
  createOrder: (creds, params) =>
    new Razorpay({
      key_id: creds.keyId,
      key_secret: creds.keySecret,
    }).orders.create(params),
  fetchPayment: (creds, id) =>
    new Razorpay({
      key_id: creds.keyId,
      key_secret: creds.keySecret,
    }).payments.fetch(id),
};

async function getCreds(tenantId) {
  const s = await Setting.findOne({ tenantId }).select(
    "+razorpayKeySecretEnc razorpayKeyId onlinePaymentsEnabled",
  );
  if (!s?.onlinePaymentsEnabled || !s.razorpayKeyId || !s.razorpayKeySecretEnc)
    throw fail(
      400,
      "Online payments are not enabled for this gym. Please pay at the front desk.",
    );
  return { keyId: s.razorpayKeyId, keySecret: decrypt(s.razorpayKeySecretEnc) };
}

const verifySignature = (secret, orderId, paymentId, signature) => {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const a = Buffer.from(expected),
    b = Buffer.from(String(signature || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = { api, getCreds, verifySignature, encrypt };
