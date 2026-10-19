import { PhoneInput } from "@/components/ui/PhoneInput";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowRight } from "lucide-react";
import {
  AuthShell,
  ErrorBanner,
  inputCls,
  labelCls,
  primaryBtnCls,
} from "@/components/auth/AuthShell";

// Same flow as Nest HR: a short signup (name, email, password), then the onboarding wizard
// collects the gym details and takes payment.
export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((p) => ({ ...p, [key]: e.target.value }));
      setError("");
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await register(form);
    setLoading(false);
    if (result.success) navigate("/onboarding");
    else setError(result.error || "Registration failed.");
  };

  return (
    <AuthShell
      headline={
        <>
          Run your gym
          
          in minutes.
        </>
      }
      points={[
        "Add members, plans and trainers",
        "Class bookings and personal training",
        "Invoices and online payments",
        "WhatsApp renewal reminders",
      ]}
    >
      <div className="mb-8">
        <h2 className="text-2xl sm:text-3xl font-display font-bold text-black">
          Create account
        </h2>
        <p className="text-sm text-gray-500 mt-1 font-medium">
          Set up your gym workspace ·{" "}
          <Link
            to="/login"
            className="font-bold text-[#024BAB] hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
      <ErrorBanner error={error} />

      <form onSubmit={handleSubmit} className="space-y-5 login-anim">
        <div>
          <label className={labelCls}>Full name</label>
          <input
            value={form.name}
            onChange={set("name")}
            placeholder="Rahul Sharma"
            className={inputCls}
            required
            autoFocus
            autoComplete="name"
          />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={set("email")}
            placeholder="you@gym.com"
            className={inputCls}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label className={labelCls}>WhatsApp number</label>
          <PhoneInput
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            inputClassName={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Password</label>
          <input
            type="password"
            value={form.password}
            onChange={set("password")}
            placeholder="Min. 8 characters"
            className={inputCls}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <button type="submit" disabled={loading} className={primaryBtnCls}>
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Creating account...
            </>
          ) : (
            <>
              Create Account <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
