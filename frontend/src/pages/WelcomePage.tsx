import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowRight,
  BarChart3,
  CheckCircle,
  CreditCard,
  Dumbbell,
  Users,
  CalendarCheck,
  Megaphone,
} from "lucide-react";

const FEATURES = [
  { icon: Users, label: "Members & Plans", color: "#024BAB" },
  { icon: Dumbbell, label: "Trainers & Classes", color: "#FA731C" },
  { icon: CreditCard, label: "Billing & Invoices", color: "#00C48C" },
  { icon: BarChart3, label: "Reports & Analytics", color: "#A855F7" },
  { icon: CalendarCheck, label: "Classes & Bookings", color: "#EF4444" },
  { icon: Megaphone, label: "WhatsApp Reminders", color: "#F59E0B" },
];

const STEPS = [
  {
    num: "01",
    title: "Add your membership plans",
    desc: "Set up monthly, quarterly and yearly packages",
  },
  {
    num: "02",
    title: "Add your members",
    desc: "Enrol them one by one from the Members page",
  },
  {
    num: "03",
    title: "Invite your trainers and staff",
    desc: "Give your team their own logins",
  },
];

export default function WelcomePage() {
  const { user, tenant } = useAuth();
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (countdown === 0) {
      void navigate("/", { replace: true });
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, navigate]);

  const userName = user?.name?.split(" ")[0] || "there";

  return (
    <div className="min-h-screen bg-[#F0F6FF] flex flex-col overflow-hidden">
      <header className="bg-white border-b-2 border-black">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center gap-3">
          <div className="w-9 h-9 bg-[#024BAB] border-2 border-black flex items-center justify-center">
            <Dumbbell className="w-5 h-5 text-white" />
          </div>
          <span className="font-display font-bold text-xl text-black">
            NestGym
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-12 flex flex-col gap-10">
        <div className="bg-white border-2 border-black overflow-hidden nb-rise">
          <div className="bg-[#024BAB] px-8 py-10 relative overflow-hidden">
            <div className="flex items-center gap-4 mb-5 relative">
              <div className="w-14 h-14 bg-white border-2 border-black flex items-center justify-center shrink-0 animate-bounce">
                <CheckCircle className="w-7 h-7 text-[#024BAB]" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-0.5">
                  {tenant?.plan === "trial"
                    ? "Free trial started"
                    : "Subscription active"}
                </p>
                <p className="text-white font-bold text-lg leading-tight">
                  {tenant?.name || "Your gym"} is ready to go
                </p>
              </div>
            </div>
            <h1 className="font-display font-bold text-3xl sm:text-4xl text-white leading-tight">
              Welcome aboard,
              <br />
              <span className="text-[#FA731C]">{userName}!</span>
            </h1>
            <p className="mt-3 text-white/80 text-sm font-medium max-w-md">
              Your NestGym workspace is live. Memberships, billing
              and trainers are all set up for you.
            </p>
          </div>
          <div className="px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-4 border-t-2 border-black bg-white">
            <p className="text-sm font-bold text-gray-500">
              Redirecting to your dashboard in{" "}
              <span className="text-[#024BAB] font-bold tabular-nums">
                {countdown}s
              </span>
            </p>
            <button
              onClick={() => navigate("/", { replace: true })}
              className="flex items-center gap-2 bg-[#FA731C] text-white border-2 border-black font-bold uppercase text-sm px-6 py-3 hover:bg-[#e06419] transition-all active:scale-95"
            >
              Go to Dashboard <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">
            Everything included in your plan
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {FEATURES.map(({ icon: Icon, label, color }) => (
              <div
                key={label}
                className="bg-white border-2 border-black px-4 py-3 flex items-center gap-3"
              >
                <div
                  className="w-8 h-8 border-2 border-black flex items-center justify-center shrink-0"
                  style={{ backgroundColor: color + "15" }}
                >
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <span className="text-xs font-bold text-black">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">
            Quick setup checklist
          </p>
          <div className="bg-white border-2 border-black divide-y-2 divide-black">
            {STEPS.map(({ num, title, desc }) => (
              <div key={num} className="flex items-center gap-5 px-6 py-5">
                <div className="w-10 h-10 bg-[#024BAB] border-2 border-black flex items-center justify-center shrink-0">
                  <span className="text-white font-bold text-xs">{num}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-black">{title}</p>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 font-medium">
          Need help?{" "}
          <a
            href="mailto:support@pixelatenest.com"
            className="text-[#024BAB] font-bold underline"
          >
            support@pixelatenest.com
          </a>
        </p>
      </main>
    </div>
  );
}
