import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Copy, Fingerprint, KeyRound, Laptop, Loader2, LogOut, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { authAPI, setToken, settingsAPI } from "@/services/api";
import { useNotify } from "@/components/ui/Notification";
import { passkeysSupported, serializeAttestation, toCreationOptions } from "@/lib/webauthn";
import PrivacySettings from "@/components/settings/PrivacySettings";
import PasswordChecklist from "@/components/PasswordChecklist";

const box = "border-2 border-black bg-white p-5 space-y-3";
const input = "border-2 border-black w-full px-3 py-2.5 text-sm font-medium outline-none";
const btn =
  "border-2 border-black bg-[#024BAB] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-50 hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_#0a0a0a] transition-all";
const ghost =
  "border-2 border-black bg-white text-black px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-50 hover:bg-gray-50";

const Badge = ({ ok, yes, no }: { ok: boolean; yes: string; no: string }) => (
  <span
    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border-2 ${
      ok ? "border-green-600 text-green-700 bg-green-50" : "border-amber-500 text-amber-700 bg-amber-50"
    }`}
  >
    {ok ? yes : no}
  </span>
);

// Owner switch: owners and branch managers must turn on two-factor before using the app.
function Require2fa() {
  const notify = useNotify();
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["settings"], queryFn: async () => (await settingsAPI.get()).data });
  return (
    <section className={box}>
      <label className="flex items-center gap-3 text-sm font-bold cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 accent-[#024BAB]"
          checked={!!s.data?.require2fa}
          onChange={async (e) => {
            try {
              await settingsAPI.update({ require2fa: e.target.checked });
              qc.invalidateQueries({ queryKey: ["settings"] });
            } catch (err: any) {
              notify.error(err.message);
            }
          }}
        />
        Require two-factor for owners and managers
      </label>
      <p className="text-xs text-gray-600">They will be asked to set it up before they can use the app.</p>
    </section>
  );
}

// Account security for the signed-in user: verify email/phone, two-factor, recovery codes, devices, password.
export default function SecuritySettings() {
  const notify = useNotify();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me-security"], queryFn: async () => (await authAPI.getMe()).data });
  const codes = useQuery({
    queryKey: ["backup-codes"],
    queryFn: async () => (await authAPI.backupCodesStatus()).data,
    enabled: !!me.data?.twoFactorEnabled,
  });
  const passkeys = useQuery({ queryKey: ["passkeys"], queryFn: async () => (await authAPI.passkeyList()).data });
  const [pkName, setPkName] = useState("");
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: async () => (await authAPI.sessions()).data });
  const refresh = () => qc.invalidateQueries({ queryKey: ["me-security"] });

  const [busy, setBusy] = useState("");
  const act = async (key: string, fn: () => Promise<void>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) notify.success(ok);
    } catch (e: any) {
      notify.error("Could not do that", e.message);
    } finally {
      setBusy("");
    }
  };

  // verification
  const [emailCode, setEmailCode] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneSent, setPhoneSent] = useState(false);

  // two-factor
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [tfaCode, setTfaCode] = useState("");
  const [shown, setShown] = useState<string[] | null>(null);
  const [offPw, setOffPw] = useState("");
  const [offCode, setOffCode] = useState("");
  const [regenPw, setRegenPw] = useState("");

  // password
  const [pw, setPw] = useState({ current: "", next: "", again: "" });

  if (me.isLoading) return <Loader2 className="w-5 h-5 animate-spin" />;
  const u = me.data || {};
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => notify.success("Copied"));

  return (
    <div className="max-w-3xl space-y-6">
      {/* verification */}
      <section className={box}>
        <h3 className="font-display font-bold text-lg flex items-center gap-2">
          <BadgeCheck className="w-5 h-5 text-[#024BAB]" /> Verification
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground">Email</p>
              <p className="text-sm font-medium">{u.email}</p>
            </div>
            <Badge ok={!!u.emailVerified} yes="Verified" no="Not verified" />
          </div>
          {!u.emailVerified && (
            <div className="flex gap-2 flex-wrap">
              {!emailSent ? (
                <button className={btn} disabled={busy === "email"} onClick={() => act("email", async () => { await authAPI.sendEmailVerifyOtp(u.email); setEmailSent(true); }, "Code sent to your email")}>
                  Send code
                </button>
              ) : (
                <>
                  <input className={`${input} max-w-[10rem]`} inputMode="numeric" maxLength={6} placeholder="6-digit code" value={emailCode} onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ""))} />
                  <button className={btn} disabled={busy === "email" || emailCode.length < 6} onClick={() => act("email", async () => { await authAPI.verifyEmailOtp(emailCode); setEmailSent(false); setEmailCode(""); refresh(); }, "Email verified")}>
                    Verify
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <div className="space-y-2 pt-2 border-t border-black/10">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground">WhatsApp number</p>
              <p className="text-sm font-medium">{u.phone || "Not added (add it in General Info > profile)"}</p>
            </div>
            {u.phone && <Badge ok={!!u.phoneVerified} yes="Verified" no="Not verified" />}
          </div>
          {u.phone && !u.phoneVerified && (
            <div className="flex gap-2 flex-wrap">
              {!phoneSent ? (
                <button className={btn} disabled={busy === "phone"} onClick={() => act("phone", async () => { await authAPI.sendPhoneVerifyOtp(); setPhoneSent(true); }, "Code sent on WhatsApp")}>
                  <Smartphone className="w-3.5 h-3.5 inline mr-1" /> Send code
                </button>
              ) : (
                <>
                  <input className={`${input} max-w-[10rem]`} inputMode="numeric" maxLength={6} placeholder="6-digit code" value={phoneCode} onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ""))} />
                  <button className={btn} disabled={busy === "phone" || phoneCode.length < 6} onClick={() => act("phone", async () => { await authAPI.verifyPhoneOtp(phoneCode); setPhoneSent(false); setPhoneCode(""); refresh(); }, "Phone verified")}>
                    Verify
                  </button>
                </>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">A verified number lets you reset your password with a WhatsApp code.</p>
        </div>
      </section>

      {u.role === "gym_owner" && (
        <>
          <Require2fa />
          <PrivacySettings />
        </>
      )}

      {/* two-factor */}
      <section className={box}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-display font-bold text-lg flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#024BAB]" /> Two-factor authentication
          </h3>
          <Badge ok={!!u.twoFactorEnabled} yes="On" no="Off" />
        </div>
        {!u.twoFactorEnabled && !setup && (
          <>
            <p className="text-sm text-muted-foreground">Ask for a code from an authenticator app (Google Authenticator, Authy) every time you sign in with your password.</p>
            <button className={btn} disabled={busy === "2fa"} onClick={() => act("2fa", async () => setSetup((await authAPI.setup2FA()).data))}>
              Turn on
            </button>
          </>
        )}
        {!u.twoFactorEnabled && setup && (
          <div className="space-y-3">
            <p className="text-sm">1. Scan this QR code with your authenticator app (or type the key).</p>
            <img src={setup.qr} alt="2FA QR code" className="w-44 h-44 border-2 border-black" />
            <button className="text-xs font-mono break-all text-left hover:underline" onClick={() => copy(setup.secret)}>
              {setup.secret} <Copy className="w-3 h-3 inline" />
            </button>
            <p className="text-sm">2. Enter the 6-digit code it shows.</p>
            <div className="flex gap-2 flex-wrap">
              <input className={`${input} max-w-[10rem]`} inputMode="numeric" maxLength={6} placeholder="123456" value={tfaCode} onChange={(e) => setTfaCode(e.target.value.replace(/\D/g, ""))} />
              <button className={btn} disabled={busy === "2fa" || tfaCode.length < 6} onClick={() => act("2fa", async () => { const r = await authAPI.confirm2FA(tfaCode); setShown(r.data.backupCodes); setSetup(null); setTfaCode(""); refresh(); codes.refetch(); }, "Two-factor is on")}>
                Confirm
              </button>
              <button className={ghost} onClick={() => setSetup(null)}>Cancel</button>
            </div>
          </div>
        )}
        {u.twoFactorEnabled && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">To turn it off, enter your password and a current code (or backup code).</p>
            <div className="grid sm:grid-cols-2 gap-2">
              <input type="password" className={input} placeholder="Password" autoComplete="current-password" value={offPw} onChange={(e) => setOffPw(e.target.value)} />
              <input className={input} placeholder="Code" value={offCode} onChange={(e) => setOffCode(e.target.value)} />
            </div>
            <button className={ghost} disabled={busy === "2fa" || !offPw || !offCode} onClick={() => act("2fa", async () => { await authAPI.disable2FA(offPw, offCode.trim()); setOffPw(""); setOffCode(""); refresh(); }, "Two-factor is off")}>
              Turn off
            </button>
          </div>
        )}
      </section>

      {/* recovery codes */}
      {u.twoFactorEnabled && (
        <section className={box}>
          <h3 className="font-display font-bold text-lg flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#024BAB]" /> Backup codes
          </h3>
          <p className="text-sm text-muted-foreground">
            {codes.data ? `${codes.data.remaining} unused codes left.` : ""} Each code signs you in once if you lose your authenticator. Making new codes replaces the old ones.
          </p>
          {shown && (
            <div className="border-2 border-dashed border-black p-3 bg-[#F0F6FF]">
              <p className="text-xs font-bold mb-2">Save these now. They are shown only once.</p>
              <div className="grid grid-cols-2 gap-1 font-mono text-sm">{shown.map((c) => <span key={c}>{c}</span>)}</div>
              <button className={`${ghost} mt-3`} onClick={() => copy(shown.join("\n"))}>Copy all</button>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <input type="password" className={`${input} max-w-xs`} placeholder="Password to make new codes" autoComplete="current-password" value={regenPw} onChange={(e) => setRegenPw(e.target.value)} />
            <button className={btn} disabled={busy === "codes" || !regenPw} onClick={() => act("codes", async () => { setShown((await authAPI.generateBackupCodes(regenPw)).data.codes); setRegenPw(""); codes.refetch(); }, "New codes ready")}>
              Make new codes
            </button>
          </div>
        </section>
      )}

      {/* passkeys */}
      <section className={box}>
        <h3 className="font-display font-bold text-lg flex items-center gap-2">
          <Fingerprint className="w-5 h-5 text-[#024BAB]" /> Passkeys
        </h3>
        <p className="text-sm text-muted-foreground">
          Sign in with your fingerprint, face or screen lock instead of a password. A passkey also lets you reset a forgotten password.
        </p>
        <div className="divide-y divide-black/10">
          {(passkeys.data || []).map((p) => (
            <div key={p._id} className="py-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  Added {new Date(p.createdAt).toLocaleDateString()} · {p.lastUsedAt ? `used ${new Date(p.lastUsedAt).toLocaleDateString()}` : "never used"}
                </p>
              </div>
              <button className={ghost} onClick={() => act("pk" + p._id, async () => { await authAPI.passkeyDelete(p._id); passkeys.refetch(); }, "Passkey removed")}>
                <Trash2 className="w-3.5 h-3.5 inline mr-1" /> Remove
              </button>
            </div>
          ))}
          {!passkeys.isLoading && !(passkeys.data || []).length && <p className="py-2 text-sm text-muted-foreground">No passkeys yet.</p>}
        </div>
        {passkeysSupported() ? (
          <div className="flex gap-2 flex-wrap">
            <input className={`${input} max-w-xs`} placeholder="Name, e.g. My laptop" value={pkName} onChange={(e) => setPkName(e.target.value)} />
            <button
              className={btn}
              disabled={busy === "pk"}
              onClick={() =>
                act("pk", async () => {
                  const { data: o } = await authAPI.passkeyRegisterOptions();
                  let cred: PublicKeyCredential | null;
                  try {
                    cred = (await navigator.credentials.create({ publicKey: toCreationOptions(o) })) as PublicKeyCredential | null;
                  } catch (err: any) {
                    throw new Error(err?.name === "NotAllowedError" ? "Passkey setup was cancelled." : err.message);
                  }
                  if (!cred) throw new Error("Passkey setup was cancelled.");
                  await authAPI.passkeyRegister({ challengeToken: o.challengeToken, name: pkName.trim() || undefined, ...serializeAttestation(cred) });
                  setPkName("");
                  passkeys.refetch();
                }, "Passkey added")
              }
            >
              Add a passkey
            </button>
          </div>
        ) : (
          <p className="text-xs text-amber-700">This browser does not support passkeys.</p>
        )}
      </section>

      {/* password */}
      <section className={box}>
        <h3 className="font-display font-bold text-lg">Change password</h3>
        <div className="grid sm:grid-cols-3 gap-2">
          <input type="password" className={input} placeholder="Current password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <input type="password" className={input} placeholder="New password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          <input type="password" className={input} placeholder="Repeat new" autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} />
        </div>
        {pw.next && <PasswordChecklist password={pw.next} />}
        <button
          className={btn}
          disabled={busy === "pw" || !pw.current || !pw.next}
          onClick={() =>
            act("pw", async () => {
              if (pw.next !== pw.again) throw new Error("The new passwords do not match");
              const r = await authAPI.changePassword(pw.current, pw.next);
              if (r.data?.token) setToken(r.data.token); // this device keeps its session; the others are signed out
              setPw({ current: "", next: "", again: "" });
              sessions.refetch();
            }, "Password changed. Other devices were signed out.")
          }
        >
          Change password
        </button>
      </section>

      {/* devices */}
      <section className={box}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-display font-bold text-lg flex items-center gap-2">
            <Laptop className="w-5 h-5 text-[#024BAB]" /> Signed-in devices
          </h3>
          {(sessions.data?.length || 0) > 1 && (
            <button className={ghost} onClick={() => act("others", async () => { await authAPI.removeOtherSessions(); sessions.refetch(); }, "Signed out of other devices")}>
              Sign out all others
            </button>
          )}
        </div>
        <div className="divide-y divide-black/10">
          {(sessions.data || []).map((s) => (
            <div key={s._id} className="py-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">
                  {s.deviceName} {s.current && <span className="text-[10px] text-green-700 border border-green-600 px-1 ml-1 uppercase">This device</span>}
                </p>
                <p className="text-xs text-muted-foreground">{s.platform} · {s.ip || "unknown IP"} · active {new Date(s.lastActiveAt).toLocaleString()}</p>
              </div>
              {!s.current && (
                <button className={ghost} onClick={() => act("s" + s._id, async () => { await authAPI.removeSession(s._id); sessions.refetch(); }, "Device signed out")}>
                  <LogOut className="w-3.5 h-3.5 inline mr-1" /> Sign out
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
