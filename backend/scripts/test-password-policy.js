// node scripts/test-password-policy.js  (pure checks, no DB)
const assert = require("assert");
const { checkPasswordRules, generatePassword } = require("../utils/passwordPolicy");

const bad = ["Sh0r!A", "alllowercase1!", "ALLUPPERCASE1!", "NoNumbers!!", "NoSpecial123x", "Labh@1234", "Labh@4321", "Abcd@1111x",
  "Password@9x", "Qwerty@77a", "Aaaa@xyzK9", "Abc@Defg9", "Admin@1x"];
const good = ["Labh@7391", "Tr!ckyG0at", "mY#Gym2o26", "Ko$mos_47Z"];
for (const p of bad) assert.ok(checkPasswordRules(p), `should reject ${p}`);
for (const p of good) assert.strictEqual(checkPasswordRules(p), null, `should accept ${p}: ${checkPasswordRules(p)}`);
for (let i = 0; i < 500; i++) assert.strictEqual(checkPasswordRules(generatePassword()), null, "generated password must pass");
console.log("password policy OK");
