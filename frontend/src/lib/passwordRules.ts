// Same rules as the backend (utils/passwordPolicy.js). Keep the wording identical.
export interface PasswordRule {
  id: string;
  label: string;
  test: (p: string) => boolean;
}

const COMMON_CONTAINS = [
  "password",
  "passw0rd",
  "qwerty",
  "asdfgh",
  "zxcvbn",
  "letmein",
  "welcome",
  "iloveyou",
  "monkey",
  "dragon",
  "football",
  "baseball",
  "sunshine",
  "princess",
  "superman",
  "trustno1",
  "changeme",
  "default",
  "secret",
  "admin",
  "pixelate",
  "nesthr",
  "nestgym",
  "nestleads",
  "nestacademy",
];
const COMMON_EXACT = [
  "root",
  "user",
  "test",
  "login",
  "abc",
  "pass",
  "guest",
  "demo",
  "temp",
  "qaz",
  "xyz",
];

const hasSeries = (s: string, len: number, digits: boolean) => {
  const re = digits ? /\d/ : /[a-z]/;
  for (let i = 0; i + len <= s.length; i++) {
    const w = s.slice(i, i + len);
    if (![...w].every((c) => re.test(c))) continue;
    const d = [...w].map((c) => c.charCodeAt(0));
    if (d.every((v, k) => k === 0 || v - d[k - 1] === 1)) return true;
    if (d.every((v, k) => k === 0 || d[k - 1] - v === 1)) return true;
  }
  return false;
};

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    label: "At least 8 characters",
    test: (p) => p.length >= 8 && p.length <= 128,
  },
  {
    id: "upper",
    label: "An uppercase letter (A–Z)",
    test: (p) => /[A-Z]/.test(p),
  },
  {
    id: "lower",
    label: "A lowercase letter (a–z)",
    test: (p) => /[a-z]/.test(p),
  },
  { id: "number", label: "A number (0–9)", test: (p) => /\d/.test(p) },
  {
    id: "special",
    label: "A special character (! @ # $ …)",
    test: (p) => /[^A-Za-z0-9]/.test(p),
  },
  {
    id: "series",
    label: "No simple series like 1234, 4321, abcd or 1111",
    test: (p) => {
      const s = p.toLowerCase();
      return !(
        hasSeries(s, 3, true) ||
        hasSeries(s, 4, false) ||
        /(.)\1{3,}/.test(s) ||
        /(\d)\1{2,}/.test(s)
      );
    },
  },
  {
    id: "common",
    label: "Not a common or compromised password",
    test: (p) => {
      const s = p.toLowerCase().replace(/[^a-z0-9]/g, "");
      const letters = p.toLowerCase().replace(/[^a-z]/g, "");
      return !(
        COMMON_CONTAINS.some((w) => s.includes(w)) ||
        COMMON_EXACT.includes(letters)
      );
    },
  },
];

export const passwordOk = (p: string) => PASSWORD_RULES.every((r) => r.test(p));
