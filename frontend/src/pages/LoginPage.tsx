import { PhoneInput } from "@/components/ui/PhoneInput";
import Turnstile from "@/components/Turnstile";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { authAPI } from "@/services/api";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, KeyRound, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { useNotify } from "@/components/ui/Notification";
import {
  AuthShell,
  ErrorBanner,
  inputCls,
  labelCls,
  primaryBtnCls,
} from "@/components/auth/AuthShell";

import { passkeysSupported, serializeAssertion, toRequestOptions } from "@/lib/webauthn";

type Mode = "password" | "otp";
type Channel = "whatsapp" | "email";

export default function LoginPage() {
  const { login, loginWithOtp, completeLogin } = useAuth();
  const navigate = useNavigate();
  const notify = useNotify();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Set when the password was right for an account with two-factor on.
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [tfaCode, setTfaCode] = useState("");
  // One-time code sign-in (WhatsApp or email); also the way to unlock an account locked after wrong passwords.
  const [mode, setMode] = useState<Mode>("password");
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  const signInWithPasskey = async () => {
    setError("");
    setPasskeyBusy(true);
    try {
      if (!passkeysSupported()) throw new Error("Passkeys are not supported on this browser or device.");
      const { data: options } = await authAPI.passkeyLoginOptions();
      const credential = (await navigator.credentials.get({ publicKey: toRequestOptions(options) })) as PublicKeyCredential | null;
      if (!credential) throw new Error("Passkey sign-in was cancelled.");
      const res = await authAPI.passkeyLogin({ challengeToken: options.challengeToken, ...serializeAssertion(credential) });
      completeLogin(res.data);
      navigate("/");
    } catch (err: any) {
      setError(err?.name === "NotAllowedError" ? "Passkey sign-in was cancelled." : err.message || "Passkey sign-in failed.");
    } finally {
      setPasskeyBusy(false);
    }
  };

  const run = async (fn: () => Promise<{ success: boolean; error?: string } | void>) => {
    setError("");
    setLoading(true);
    try {
      const r = await fn();
      if (r && r.success) navigate("/");
      else if (r && r.error) setError(r.error);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingToken) {
      return run(async () => {
        const res = await authAPI.verify2FA(pendingToken, tfaCode.trim());
        completeLogin(res.data);
        return { success: true };
      });
    }
    if (mode === "password") {
      return run(async () => {
        const r = await login(email, password);
        if (r.requires2FA) {
          setPendingToken(r.pendingToken || "");
          setTfaCode("");
          return;
        }
        return r.success ? r : { success: false, error: r.error || "Login failed. Please check your credentials." };
      });
    }
    if (!otpSent) {
      return run(async () => {
        if (channel === "whatsapp") await authAPI.otpSend(phone);
        else await authAPI.emailOtpSend(email.trim().toLowerCase());
        setOtpSent(true);
        notify.info("Code sent", channel === "whatsapp" ? "Check WhatsApp for your 6-digit code." : "Check your email for your 6-digit code.");
      });
    }
    return run(async () => {
      if (channel === "whatsapp") return loginWithOtp(phone, otp);
      const res = await authAPI.emailOtpVerify(email.trim().toLowerCase(), otp);
      completeLogin(res.data);
      return { success: true };
    });
  };

  const reset = (m: Mode) => {
    setMode(m);
    setOtpSent(false);
    setOtp("");
    setError("");
  };

  const title = pendingToken
    ? "Two-step check"
    : mode === "otp"
      ? otpSent
        ? "Enter code"
        : "Sign in with a code"
      : "Welcome back";
  const subtitle = pendingToken
    ? "Enter the 6-digit code from your authenticator app, or one of your backup codes."
    : mode === "otp"
      ? otpSent
        ? channel === "whatsapp"
          ? "We sent a 6-digit code to your WhatsApp."
          : "We sent a 6-digit code to your email."
        : channel === "whatsapp"
          ? "We'll send a one-time code to your WhatsApp."
          : "We'll send a one-time code to your email."
      : "Sign in to manage your gym";

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
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          {pendingToken ? (
            <ShieldCheck className="w-7 h-7 text-[#024BAB]" />
          ) : mode === "otp" ? (
            <Smartphone className="w-7 h-7 text-[#024BAB]" />
          ) : null}
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-black">{title}</h2>
        </div>
        <p className="text-sm text-gray-500 mt-1 font-medium">{subtitle}</p>
      </div>
      <ErrorBanner error={error} />

      <form onSubmit={handleSubmit} className="space-y-5 login-anim">
        {pendingToken ? (
          <div>
            <label className={labelCls}>Authentication or backup code</label>
            <input
              value={tfaCode}
              onChange={(e) => setTfaCode(e.target.value)}
              placeholder="123456"
              className={`${inputCls} text-lg font-bold tracking-[0.3em] text-center`}
              maxLength={11}
              autoCapitalize="characters"
              required
              autoFocus
            />
          </div>
        ) : mode === "otp" ? (
          <>
            {channel === "whatsapp" ? (
              <div>
                <label className={labelCls}>WhatsApp number</label>
                <PhoneInput value={phone} onChange={setPhone} inputClassName={inputCls} required disabled={otpSent} autoFocus />
              </div>
            ) : (
              <div>
                <label className={labelCls}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@gym.com"
                  className={inputCls}
                  required
                  disabled={otpSent}
                  autoFocus
                />
              </div>
            )}
            {otpSent && (
              <div>
                <label className={labelCls}>6-digit code</label>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className={`${inputCls} text-lg font-bold tracking-[0.5em] text-center`}
                  required
                  autoFocus
                />
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <label className={labelCls}>Email</label>
              <input
                type="text"
                inputMode="email"
                autoCapitalize="none"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                placeholder="you@gym.com"
                className={inputCls}
                required
                autoComplete="email"
                autoFocus
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-black uppercase tracking-wider">Password</label>
                <Link to="/forgot-password" className="text-xs font-bold text-[#024BAB] hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="flex border-2 border-black transition-colors">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  placeholder="Your password"
                  className="flex-1 px-4 py-3 bg-white text-sm font-medium outline-none"
                  required
                  autoComplete="current-password"
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
            </div>
          </>
        )}

        <Turnstile />

        <button type="submit" disabled={loading} className={primaryBtnCls}>
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Please wait...
            </>
          ) : (
            <>
              {pendingToken
                ? "Verify"
                : mode === "otp"
                  ? otpSent
                    ? "Verify code"
                    : channel === "whatsapp"
                      ? "Send code on WhatsApp"
                      : "Send code to email"
                  : "Sign In"}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        {pendingToken && (
          <button
            type="button"
            onClick={() => {
              setPendingToken(null);
              setTfaCode("");
              setError("");
            }}
            className="w-full py-2 text-xs font-bold text-gray-500 hover:text-black transition-colors"
          >
            ← Back to sign in
          </button>
        )}
        {!pendingToken && mode === "otp" && (
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => reset("password")} className="py-2 text-xs font-bold text-gray-500 hover:text-black transition-colors">
              ← Sign in with password
            </button>
            {otpSent && (
              <button type="button" onClick={() => { setOtpSent(false); setOtp(""); setError(""); }} className="py-2 text-xs font-bold text-[#024BAB] hover:underline">
                Change / resend
              </button>
            )}
          </div>
        )}
      </form>

      {!pendingToken && mode === "password" && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <div className="flex items-center gap-3 w-full">
            <div className="flex-1 h-px bg-black/10" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Or continue with</span>
            <div className="flex-1 h-px bg-black/10" />
          </div>
          <div className="grid grid-cols-2 gap-3 w-full">
            {([
              ["whatsapp", "WhatsApp code", Smartphone],
              ["email", "Email code", Mail],
            ] as [Channel, string, typeof Mail][]).map(([c, label, Icon]) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setChannel(c);
                  reset("otp");
                }}
                className="flex items-center justify-center gap-2 border-2 border-black py-2.5 text-xs font-bold text-black hover:bg-gray-50 hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_#0a0a0a] transition-all"
              >
                <Icon className="w-4 h-4 text-[#024BAB]" />
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={signInWithPasskey}
            disabled={passkeyBusy}
            className="w-full flex items-center justify-center gap-2 border-2 border-black py-2.5 text-xs font-bold text-black hover:bg-gray-50 hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_#0a0a0a] transition-all disabled:opacity-50"
          >
            <KeyRound className="w-4 h-4 text-[#024BAB]" />
            {passkeyBusy ? "Waiting for passkey…" : "Sign in with a passkey"}
          </button>
          <p className="text-[11px] text-gray-500 text-center">A code also unlocks an account locked after wrong passwords.</p>
        </div>
      )}

      <div className="mt-6 pt-6 border-t-2 border-black/10 text-center">
        <p className="text-xs text-gray-500">
          New to NestGym?{" "}
          <Link to="/register" className="font-bold text-[#024BAB] hover:underline transition-colors">
            Create an account
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
