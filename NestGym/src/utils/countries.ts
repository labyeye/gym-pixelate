// Keep in sync with backend/utils/phone.js and NestGym/src/utils/countries.ts.
// Storage format: India -> bare 10 digits (legacy data); others -> "+<dial><national>".
export interface Country {
  iso: string;
  name: string;
  dial: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { iso: "IN", name: "India", dial: "91", flag: "🇮🇳" },
  { iso: "AE", name: "United Arab Emirates", dial: "971", flag: "🇦🇪" },
  { iso: "US", name: "United States", dial: "1", flag: "🇺🇸" },
  { iso: "CA", name: "Canada", dial: "1", flag: "🇨🇦" },
  { iso: "GB", name: "United Kingdom", dial: "44", flag: "🇬🇧" },
  { iso: "AU", name: "Australia", dial: "61", flag: "🇦🇺" },
  { iso: "SG", name: "Singapore", dial: "65", flag: "🇸🇬" },
  { iso: "MY", name: "Malaysia", dial: "60", flag: "🇲🇾" },
  { iso: "SA", name: "Saudi Arabia", dial: "966", flag: "🇸🇦" },
  { iso: "QA", name: "Qatar", dial: "974", flag: "🇶🇦" },
  { iso: "KW", name: "Kuwait", dial: "965", flag: "🇰🇼" },
  { iso: "OM", name: "Oman", dial: "968", flag: "🇴🇲" },
  { iso: "BH", name: "Bahrain", dial: "973", flag: "🇧🇭" },
  { iso: "NP", name: "Nepal", dial: "977", flag: "🇳🇵" },
  { iso: "LK", name: "Sri Lanka", dial: "94", flag: "🇱🇰" },
  { iso: "BD", name: "Bangladesh", dial: "880", flag: "🇧🇩" },
  { iso: "PK", name: "Pakistan", dial: "92", flag: "🇵🇰" },
  { iso: "ID", name: "Indonesia", dial: "62", flag: "🇮🇩" },
  { iso: "PH", name: "Philippines", dial: "63", flag: "🇵🇭" },
  { iso: "TH", name: "Thailand", dial: "66", flag: "🇹🇭" },
  { iso: "DE", name: "Germany", dial: "49", flag: "🇩🇪" },
  { iso: "FR", name: "France", dial: "33", flag: "🇫🇷" },
  { iso: "IT", name: "Italy", dial: "39", flag: "🇮🇹" },
  { iso: "ES", name: "Spain", dial: "34", flag: "🇪🇸" },
  { iso: "NL", name: "Netherlands", dial: "31", flag: "🇳🇱" },
  { iso: "NZ", name: "New Zealand", dial: "64", flag: "🇳🇿" },
  { iso: "ZA", name: "South Africa", dial: "27", flag: "🇿🇦" },
  { iso: "NG", name: "Nigeria", dial: "234", flag: "🇳🇬" },
  { iso: "KE", name: "Kenya", dial: "254", flag: "🇰🇪" },
  { iso: "BR", name: "Brazil", dial: "55", flag: "🇧🇷" },
  { iso: "JP", name: "Japan", dial: "81", flag: "🇯🇵" },
  { iso: "KR", name: "South Korea", dial: "82", flag: "🇰🇷" },
  { iso: "CN", name: "China", dial: "86", flag: "🇨🇳" },
  { iso: "HK", name: "Hong Kong", dial: "852", flag: "🇭🇰" },
  { iso: "RU", name: "Russia", dial: "7", flag: "🇷🇺" },
  { iso: "TR", name: "Türkiye", dial: "90", flag: "🇹🇷" },
  { iso: "EG", name: "Egypt", dial: "20", flag: "🇪🇬" },
  { iso: "IE", name: "Ireland", dial: "353", flag: "🇮🇪" },
  { iso: "CH", name: "Switzerland", dial: "41", flag: "🇨🇭" },
  { iso: "SE", name: "Sweden", dial: "46", flag: "🇸🇪" },
];

const BY_DIAL = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
export const countryOf = (iso: string) =>
  COUNTRIES.find((c) => c.iso === iso) || COUNTRIES[0];

/** Split a stored value into country + national digits. Bare numbers are India. */
export function splitPhone(value?: string | null): {
  iso: string;
  national: string;
} {
  const s = String(value || "").trim();
  const digits = s.replace(/\D/g, "");
  if (!s.startsWith("+"))
    return {
      iso: "IN",
      national:
        digits.length > 10 && digits.startsWith("91")
          ? digits.slice(2)
          : digits,
    };
  const c = BY_DIAL.find((x) => digits.startsWith(x.dial));
  return c
    ? { iso: c.iso, national: digits.slice(c.dial.length) }
    : { iso: "IN", national: digits };
}

/** Build the stored value. Empty national -> "" so required/optional checks keep working. */
export function joinPhone(iso: string, national: string): string {
  const n = national.replace(/\D/g, "");
  if (!n) return "";
  return iso === "IN" ? n : `+${countryOf(iso).dial}${n}`;
}

export function phoneValid(value?: string | null): boolean {
  const { iso, national } = splitPhone(value);
  return iso === "IN"
    ? national.length === 10
    : national.length >= 6 && national.length <= 12;
}

/** Digits for wa.me links (adds 91 to bare Indian numbers only). */
export const waDigits = (value?: string | null) => {
  const d = String(value || "").replace(/\D/g, "");
  return String(value || "")
    .trim()
    .startsWith("+") || d.length !== 10
    ? d
    : `91${d}`;
};
