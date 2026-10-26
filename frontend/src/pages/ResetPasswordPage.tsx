import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, CheckCircle, Eye, EyeOff } from "lucide-react";
import { authAPI } from "@/services/api";
import {
  AuthShell,
  ErrorBanner,
  inputCls,
  labelCls,
  primaryBtnCls,
} from "@/components/auth/AuthShell";
import PasswordChecklist from "@/components/PasswordChecklist";

// Landing page of the emailed reset link: /reset-password/<token>.
export default function ResetPasswordPage() {
  const { token = "" } = useParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      await authAPI.resetPassword(token, password);
      setDone(true);
    } catch (err: any) {
      setError(err.message || "Could not reset the password.");
    } finally {
      setLoading(false);
    }
  };

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
      {done ? (
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle className="w-14 h-14 text-green-500" />
          </div>
          <h2 className="text-xl font-display font-bold text-black mb-2">Password reset!</h2>
          <p className="text-sm text-gray-600 mb-6">Your password has been changed. You can now sign in.</p>
          <Link to="/login" className="text-xs font-bold text-[#024BAB] hover:underline">
            ← Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <h2 className="text-2xl font-display font-bold text-black mb-1">Choose a new password</h2>
          <p className="text-sm text-gray-500 mb-6 font-medium">At least 8 characters with upper, lower case and a number.</p>
          <ErrorBanner error={error} />
          <form onSubmit={submit} className="space-y-5 login-anim">
            <div>
              <label className={labelCls}>New password</label>
              <div className="flex border-2 border-black">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1 px-4 py-3 bg-white text-sm font-medium outline-none"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  autoFocus
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
              {loading ? "Resetting..." : (
                <>
                  Reset Password <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
          <div className="mt-6">
            <Link to="/login" className="text-xs font-bold text-[#024BAB] hover:underline">
              ← Back to sign in
            </Link>
          </div>
        </>
      )}
    </AuthShell>
  );
}
