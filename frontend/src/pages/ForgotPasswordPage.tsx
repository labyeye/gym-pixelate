import { useState } from "react";
import Turnstile from "@/components/Turnstile";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle, Eye, EyeOff, KeyRound, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { authAPI } from "@/services/api";
import {
  AuthShell,
  ErrorBanner,
  inputCls,
  labelCls,
  primaryBtnCls,
} from "@/components/auth/AuthShell";
import { passkeysSupported, serializeAssertion, toRequestOptions } from "@/lib/webauthn";
import PasswordChecklist from "@/components/PasswordChecklist";

type Step = "email" | "choose" | "email_sent" | "code" | "done";
type Method = "email" | "whatsapp" | "totp" | "backup" | "passkey";

// Only the methods this account has actually set up are offered (the server decides).
const METHODS: Record<Method, { label: string; desc: string; icon: typeof Mail }> = {
  email: { label: "Email link", desc: "Get a password reset link in your inbox", icon: Mail },
  whatsapp: { label: "WhatsApp code", desc: "Get a 6-digit code on your verified WhatsApp number", icon: Smartphone },
  totp: { label: "Authenticator app", desc: "Enter the code from your authenticator app", icon: ShieldCheck },
  backup: { label: "Backup code", desc: "Use one of your saved one-time backup codes", icon: KeyRound },
  passkey: { label: "Passkey", desc: "Confirm with your fingerprint, face or screen lock", icon: KeyRound },
};

// Same flow as NestHR: email first, then pick how to prove it is you.
export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [methods, setMethods] = useState<Method[]>([]);
  const [method, setMethod] = useState<Exclude<Method, "email">>("whatsapp");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setError("");
    setLoading(true);
    try {
      await fn();
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  const addr = email.trim().toLowerCase();

  const sendLink = async () => {
    await authAPI.forgotPassword(addr);
    setStep("email_sent");
  };

  const onContinue = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await authAPI.forgotPasswordMethods(addr);
      const list = res.data.methods as Method[];
      setMethods(list);
      if (list.length > 1) setStep("choose");
      else await sendLink();
    });
  };

  const choose = (m: Method) =>
    run(async () => {
      if (m === "email") return sendLink();
      if (m === "whatsapp") await authAPI.forgotPasswordWhatsapp(addr);
      setMethod(m);
      setCode("");
      setStep("code");
    });

  const onReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError("Passwords do not match.");
    run(async () => {
      if (method === "passkey") {
        if (!passkeysSupported()) throw new Error("Passkeys are not supported by your browser.");
        const { data: o } = await authAPI.resetPasskeyOptions();
        let credential: PublicKeyCredential | null;
        try {
          credential = (await navigator.credentials.get({ publicKey: toRequestOptions(o) })) as PublicKeyCredential | null;
        } catch (err: any) {
          throw new Error(err?.name === "NotAllowedError" ? "Passkey verification was cancelled." : err.message);
        }
        if (!credential) throw new Error("Passkey prompt was cancelled.");
        await authAPI.resetPasswordWithPasskey({ challengeToken: o.challengeToken, password, ...serializeAssertion(credential) });
      } else if (method === "whatsapp") await authAPI.resetPasswordWithOtp(addr, code.trim(), password);
      else if (method === "backup") await authAPI.resetWithBackupCode(addr, code.trim(), password);
      else await authAPI.resetPasswordWithTotp(addr, code.trim(), password);
      setStep("done");
    });
  };

  const backToLogin = (
    <Link to="/login" className="text-xs font-bold text-[#024BAB] hover:underline">
      ← Back to sign in
    </Link>
  );
  const spinner = <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />;

  return (
    <AuthShell
      headline={
        <>
          Every member.
          <br />
          Every renewal.
          <br />
          One place.
        </>
      }
    >
      {step === "email" && (
        <>
          <h2 className="text-2xl font-display font-bold text-black mb-1">Forgot password?</h2>
          <p className="text-sm text-gray-500 mb-6 font-medium">
            Enter the email you signed up with to see how you can reset your password.
          </p>
          <ErrorBanner error={error} />
          <form onSubmit={onContinue} className="space-y-5 login-anim">
            <div>
              <label className={labelCls}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@gym.com"
                className={inputCls}
                required
                autoFocus
                autoComplete="email"
              />
            </div>
            <Turnstile />
            <button type="submit" disabled={loading} className={primaryBtnCls}>
              {loading ? (
                <>
                  {spinner} Checking...
                </>
              ) : (
                <>
                  Continue <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
          <div className="mt-6">{backToLogin}</div>
        </>
      )}

      {step === "choose" && (
        <>
          <h2 className="text-2xl font-display font-bold text-black mb-1">How do you want to reset it?</h2>
          <p className="text-sm text-gray-500 mb-6 font-medium">Choose one of the methods set up on your account.</p>
          <ErrorBanner error={error} />
          <div className="space-y-3">
            {methods.map((m) => {
              const info = METHODS[m];
              const Icon = info.icon;
              return (
                <button
                  key={m}
                  onClick={() => choose(m)}
                  disabled={loading}
                  className="w-full flex items-center gap-3 border-2 border-black p-3.5 text-left hover:bg-[#F0F6FF] transition-colors disabled:opacity-50"
                >
                  <span className="w-9 h-9 border-2 border-black flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-[#024BAB]" />
                  </span>
                  <span>
                    <span className="block font-bold text-sm text-black">{info.label}</span>
                    <span className="block text-xs text-gray-500">{info.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <button onClick={() => setStep("email")} className="text-xs font-bold text-gray-500 hover:text-black mt-6">
            ← Back
          </button>
        </>
      )}

      {step === "email_sent" && (
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle className="w-14 h-14 text-green-500" />
          </div>
          <h2 className="text-xl font-display font-bold text-black mb-2">Check your email</h2>
          <p className="text-sm text-gray-600 mb-6">
            If an account exists for <strong>{addr}</strong>, we've sent a password reset link. It expires in 1 hour.
          </p>
          {backToLogin}
        </div>
      )}

      {step === "code" && (
        <>
          <h2 className="text-2xl font-display font-bold text-black mb-1">
            {method === "passkey" ? "Choose a new password" : method === "whatsapp" ? "Enter WhatsApp code" : method === "backup" ? "Enter a backup code" : "Enter authenticator code"}
          </h2>
          <p className="text-sm text-gray-500 mb-6 font-medium">
            {method === "passkey"
              ? "Pick a new password, then confirm with your passkey when asked."
              : method === "whatsapp"
              ? "We sent a 6-digit code to your verified WhatsApp number."
              : method === "backup"
                ? "Enter one of your saved backup codes. It stops working after this."
                : "Open your authenticator app and enter the current 6-digit code (or a backup code)."}
          </p>
          <ErrorBanner error={error} />
          <form onSubmit={onReset} className="space-y-5 login-anim">
            {method !== "passkey" && <div>
              <label className={labelCls}>{method === "whatsapp" ? "WhatsApp code" : method === "backup" ? "Backup code" : "Authenticator code"}</label>
              <input
                value={code}
                onChange={(e) => setCode(method === "backup" ? e.target.value.toUpperCase().trim() : e.target.value.trim())}
                inputMode={method === "whatsapp" ? "numeric" : "text"}
                maxLength={method === "backup" ? 11 : 8}
                placeholder={method === "backup" ? "XXXXX-XXXXX" : "123456"}
                className={`${inputCls} text-lg font-bold tracking-[0.3em] text-center`}
                required
                autoFocus
              />
            </div>}
            <div>
              <label className={labelCls}>New password</label>
              <div className="flex border-2 border-black">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="flex-1 px-4 py-3 bg-white text-sm font-medium outline-none"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="px-3 border-l-2 border-black hover:bg-gray-50 transition-colors"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff className="w-4 h-4 text-black" /> : <Eye className="w-4 h-4 text-black" />}
                </button>
              </div>
              {password && <PasswordChecklist password={password} />}
            </div>
            <div>
              <label className={labelCls}>Confirm new password</label>
              <input
                type={showPw ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputCls}
                required
                autoComplete="new-password"
              />
            </div>
            <button type="submit" disabled={loading} className={primaryBtnCls}>
              {loading ? (
                <>
                  {spinner} Resetting...
                </>
              ) : (
                "Reset Password"
              )}
            </button>
          </form>
          <button
            onClick={() => {
              setError("");
              setStep("choose");
            }}
            className="text-xs font-bold text-gray-500 hover:text-black mt-6"
          >
            ← Choose a different method
          </button>
        </>
      )}

      {step === "done" && (
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle className="w-14 h-14 text-green-500" />
          </div>
          <h2 className="text-xl font-display font-bold text-black mb-2">Password reset!</h2>
          <p className="text-sm text-gray-600 mb-6">Your password has been changed. You can now sign in.</p>
          {backToLogin}
        </div>
      )}
    </AuthShell>
  );
}
