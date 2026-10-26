const crypto = require("crypto");

/*
 * Field-level encryption for personal / health data (DPDP). Values are AES-256-GCM encrypted *before* they reach MongoDB,
 * so a leaked database dump or backup shows ciphertext. Use as schema options: { type: String, ...FIELD }.
 *   stored:  enc1:<iv>.<tag>.<ciphertext>   (base64url)
 *   legacy plaintext (no prefix) still reads fine and is encrypted the next time the document is saved,
 *   or in bulk with `node scripts/encrypt-existing.js --apply`.
 * Key: FIELD_ENCRYPTION_KEY (required in production). Rotating it needs a re-encrypt pass: decrypt with the old key, save with the new.
 */
const PREFIX = "enc1:";

const key = () => {
  const secret = process.env.FIELD_ENCRYPTION_KEY || process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("FIELD_ENCRYPTION_KEY is not set");
  return crypto.createHash("sha256").update("nestgym-field-v1|" + secret).digest();
};

const b64 = (b) => b.toString("base64url");

function encryptValue(v) {
  if (v === undefined || v === null || v === "") return v;
  if (typeof v !== "string") return v;
  if (v.startsWith(PREFIX)) return v; // already encrypted
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(v, "utf8"), c.final()]);
  return `${PREFIX}${b64(iv)}.${b64(c.getAuthTag())}.${b64(ct)}`;
}

function decryptValue(v) {
  if (typeof v !== "string" || !v.startsWith(PREFIX)) return v; // plaintext / legacy / empty
  const [iv, tag, ct] = v.slice(PREFIX.length).split(".").map((x) => Buffer.from(x, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

/** Spread into a String path: { type: String, trim: true, ...FIELD } */
const FIELD = { set: encryptValue, get: decryptValue };

const isEncrypted = (v) => typeof v === "string" && v.startsWith(PREFIX);

/** On every save, any listed path still holding plaintext (legacy rows) is encrypted. */
function encryptOnSave(schema, paths) {
  schema.pre("save", function () {
    for (const p of paths) {
      const v = this.get(p, null, { getters: false });
      if (Array.isArray(v) ? v.some((x) => typeof x === "string" && x && !isEncrypted(x)) : typeof v === "string" && v && !isEncrypted(v)) this.set(p, Array.isArray(v) ? [...v] : v);
    }
  });
}

const SENSITIVE_MEMBER_PATHS = ["idProof.number", "emergencyContact.name", "emergencyContact.phone", "health.injuries", "health.allergies", "health.medications", "health.conditions", "medicalNotes"];

module.exports = { SENSITIVE_MEMBER_PATHS, encryptOnSave, FIELD, encryptValue, decryptValue, isEncrypted, PREFIX };
