// Phone numbers are stored in one of two shapes (clients send the same):
//   India  -> the bare 10 digits (all legacy data is like this)
//   others -> "+<dial code><national number>", e.g. "+971501234567"
// Keep DIAL in sync with frontend/src/lib/countries.ts and NestGym/src/utils/countries.ts.
const DIAL = {
  IN: "91",
  AE: "971",
  US: "1",
  CA: "1",
  GB: "44",
  AU: "61",
  SG: "65",
  MY: "60",
  SA: "966",
  QA: "974",
  KW: "965",
  OM: "968",
  BH: "973",
  NP: "977",
  LK: "94",
  BD: "880",
  PK: "92",
  ID: "62",
  PH: "63",
  TH: "66",
  DE: "49",
  FR: "33",
  IT: "39",
  ES: "34",
  NL: "31",
  NZ: "64",
  ZA: "27",
  NG: "234",
  KE: "254",
  BR: "55",
  JP: "81",
  KR: "82",
  CN: "86",
  HK: "852",
  RU: "7",
  TR: "90",
  EG: "20",
  IE: "353",
  CH: "41",
  SE: "46",
};
// Longest dial code first so "+971" wins over "+97"-style prefixes; "1" and "7" are shared (NANP / RU-KZ) -> first listed.
const BY_LENGTH = Object.entries(DIAL).sort(
  (a, b) => b[1].length - a[1].length,
);

/** @returns {{iso: string, dial: string, national: string, e164: string} | null} */
function parsePhone(raw) {
  const s = String(raw || "").trim();
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  if (!s.startsWith("+")) {
    // legacy / default-India input: 10 digits, or with a 91 prefix
    const national =
      digits.length > 10 && digits.startsWith("91")
        ? digits.slice(2)
        : digits.slice(-10);
    return national.length === 10
      ? { iso: "IN", dial: "91", national, e164: `91${national}` }
      : null;
  }
  for (const [iso, dial] of BY_LENGTH) {
    if (digits.startsWith(dial)) {
      const national = digits.slice(dial.length);
      if (national.length >= 6 && national.length <= 12)
        return { iso, dial, national, e164: digits };
    }
  }
  return null;
}

/** Every spelling an existing record might have been saved with, for $in lookups. */
function phoneVariants(raw) {
  const p = parsePhone(raw);
  if (!p) return [String(raw)];
  if (p.iso === "IN")
    return [
      p.national,
      `+91${p.national}`,
      `91${p.national}`,
      `+91 ${p.national}`,
    ];
  return [`+${p.e164}`, p.e164];
}

module.exports = { parsePhone, phoneVariants };
