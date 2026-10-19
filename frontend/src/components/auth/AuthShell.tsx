import loginDash from "@/assets/images/login-dash.png";
import {
  Dumbbell,
  Users,
  CreditCard,
  BarChart2,
  Check,
} from "lucide-react";

const FEATURES = [
  { icon: Users, label: "Members & Plans" },
  { icon: Dumbbell, label: "Trainers & Classes" },
  { icon: CreditCard, label: "Billing & Invoices" },
  { icon: BarChart2, label: "Reports" },
];

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-11 h-11 bg-[#024BAB] border-2 border-black flex items-center justify-center shrink-0">
        <Dumbbell className="w-6 h-6 text-white" />
      </div>
      <span
        className={`font-display font-bold text-2xl ${light ? "text-white" : "text-black"}`}
      >
        NestGym
      </span>
    </div>
  );
}

// Same split layout as Nest Leads / Nest HR: blue pitch panel left, form right.
export function AuthShell({
  headline,
  points,
  children,
}: {
  headline: React.ReactNode;
  points?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-[#024BAB] flex-col justify-between p-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10">
          <Brand light />
        </div>

        <img
          src={loginDash}
          alt="Dashboard preview"
          className="relative z-10 max-w-3xl mx-auto"
        />

        <div className="relative z-10">
          <h1 className="text-3xl xl:text-4xl font-display font-bold text-white leading-tight mb-5">
            {headline}
          </h1>
          {points ? (
            <div className="space-y-3">
              {points.map((p) => (
                <div key={p} className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-white flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-[#024BAB]" />
                  </div>
                  <span className="text-white font-medium text-base">{p}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/70 text-base font-medium max-w-sm">
              Memberships, billing and trainers, all in one place.
            </p>
          )}
        </div>

        <div className="relative z-10 flex flex-wrap gap-2">
          {FEATURES.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 bg-white/10 border border-white/20 px-4 py-2 text-white text-sm font-bold"
            >
              <Icon className="w-4 h-4 text-white/70" />
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-white flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <Brand />
          </div>
          {children}
          <LegalFooter />
        </div>
      </div>
    </div>
  );
}

function LegalFooter() {
  const a = "font-bold text-[#024BAB] hover:underline";
  return (
    <p className="text-xs text-gray-500 mt-4 text-center">
      © 2026 Pixelate Nest. All rights reserved.{" "}
      <a
        href="https://www.pixelatenest.com/legal/privacy-policy.html"
        target="_blank"
        rel="noopener noreferrer"
        className={a}
      >
        Privacy Policy
      </a>
      {" · "}
      <a
        href="https://www.pixelatenest.com/legal/terms-of-service.html"
        target="_blank"
        rel="noopener noreferrer"
        className={a}
      >
        Terms of Service
      </a>
    </p>
  );
}

export const labelCls =
  "block text-xs font-bold text-black uppercase tracking-wider mb-1.5";
export const inputCls =
  "w-full px-4 py-3 border-2 border-black text-sm font-medium bg-white focus:outline-none transition-colors";
export const primaryBtnCls =
  "w-full bg-[#024BAB] text-white py-3.5 text-sm font-bold border-2 border-black hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_#0a0a0a] transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50";

export function ErrorBanner({ error }: { error: string }) {
  if (!error) return null;
  return (
    <div className="flex items-center gap-2 bg-red-50 border-2 border-red-400 text-red-600 text-sm px-3 py-2.5 mb-5">
      <span className="font-medium">{error}</span>
    </div>
  );
}
