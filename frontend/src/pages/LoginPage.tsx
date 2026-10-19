import { PhoneInput } from "@/components/ui/PhoneInput";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { authAPI } from "@/services/api";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Smartphone } from "lucide-react";
import { useNotify } from "@/components/ui/Notification";
import {
  AuthShell,
  ErrorBanner,
  inputCls,
  labelCls,
  primaryBtnCls,
} from "@/components/auth/AuthShell";

export default function LoginPage() {
  const { login, loginWithOtp } = useAuth();
  const navigate = useNavigate();
  const notify = useNotify();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // WhatsApp OTP sign-in; also the way to unlock an account after 4 wrong passwords.
  const [otpMode, setOtpMode] = useState(false);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    let result: { success: boolean; error?: string };
    if (!otpMode) {
      result = await login(email, password);
    } else if (!otpSent) {
      try {
        await authAPI.otpSend(phone);
        setOtpSent(true);
        result = { success: false };
        notify.info("OTP sent", "Check WhatsApp for your 6-digit code.");
      } catch (err: any) {
        result = { success: false, error: err.message };
      }
    } else {
      result = await loginWithOtp(phone, otp);
    }
    setLoading(false);
    if (result.success) {
      navigate("/");
    } else {
      if (result.error) setError(result.error);
      else if (!otpMode)
        setError("Login failed. Please check your credentials.");
    }
  };

  const backToPassword = () => {
    setOtpMode(false);
    setOtpSent(false);
    setOtp("");
    setError("");
  };

  return (
    <AuthShell
      headline={
        <>
          Every member.
          <br />
          Every check-in.
          <br />
          One place.
        </>
      }
    >
      <div className="mb-8">
        {otpMode ? (
          <div className="flex items-center gap-3 mb-2">
            <Smartphone className="w-7 h-7 text-[#024BAB]" />
            <h2 className="text-2xl font-display font-bold text-black">
              {otpSent ? "Enter OTP" : "Phone Login"}
            </h2>
          </div>
        ) : (
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-black">
            Welcome back
          </h2>
        )}
        <p className="text-sm text-gray-500 mt-1 font-medium">
          {otpMode
            ? otpSent
              ? "We sent a 6-digit OTP to your WhatsApp."
              : "We'll send a one-time password to your WhatsApp."
            : "Sign in to manage your gym"}
        </p>
      </div>
      <ErrorBanner error={error} />

      <form onSubmit={handleSubmit} className="space-y-5 login-anim">
        {otpMode ? (
          <>
            <div>
              <label className={labelCls}>WhatsApp number</label>
              <PhoneInput
                value={phone}
                onChange={setPhone}
                inputClassName={inputCls}
                required
                disabled={otpSent}
                autoFocus
              />
            </div>
            {otpSent && (
              <div>
                <label className={labelCls}>WhatsApp OTP</label>
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
                <label className="block text-xs font-bold text-black uppercase tracking-wider">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() =>
                    notify.info(
                      "Password reset",
                      "Contact your gym owner to reset your password.",
                    )
                  }
                  className="text-xs font-bold text-[#024BAB] hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="flex border-2 border-black focus-within:border-[#024BAB] transition-colors">
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
                >
                  {showPw ? (
                    <EyeOff className="w-4 h-4 text-black" />
                  ) : (
                    <Eye className="w-4 h-4 text-black" />
                  )}
                </button>
              </div>
            </div>
          </>
        )}

        <button type="submit" disabled={loading} className={primaryBtnCls}>
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Please wait...
            </>
          ) : (
            <>
              {otpMode
                ? otpSent
                  ? "Verify OTP"
                  : "Send OTP on WhatsApp"
                : "Sign In"}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
        {otpMode && (
          <button
            type="button"
            onClick={backToPassword}
            className="w-full py-2 text-xs font-bold text-gray-500 hover:text-black transition-colors"
          >
            ← Sign in with Email
          </button>
        )}
      </form>

      {!otpMode && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <div className="flex items-center gap-3 w-full">
            <div className="flex-1 h-px bg-black/10" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Or continue with
            </span>
            <div className="flex-1 h-px bg-black/10" />
          </div>
          <button
            type="button"
            onClick={() => {
              setOtpMode(true);
              setError("");
            }}
            className="w-full flex items-center justify-center gap-2 border-2 border-black py-2.5 text-xs font-bold text-black hover:bg-gray-50 hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_#0a0a0a] transition-all"
          >
            <Smartphone className="w-4 h-4 text-[#024BAB]" />
            Phone OTP (also unlocks a locked account)
          </button>
        </div>
      )}

      <div className="mt-6 pt-6 border-t-2 border-black/10 text-center">
        <p className="text-xs text-gray-500">
          New to NestGym?{" "}
          <Link
            to="/register"
            className="font-bold text-[#024BAB] hover:underline transition-colors"
          >
            Create an account
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
