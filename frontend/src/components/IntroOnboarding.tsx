import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import img1 from "@/assets/onboarding/1.png";
import img2 from "@/assets/onboarding/2.png";
import img3 from "@/assets/onboarding/3.png";
import nestgymlogo from "../assets/images/logo_long.png"

const SLIDES = [
  { title: "Your whole gym, in one place", body: "Manage members, memberships, trainers, classes and billing from one simple workspace.", color: "#EAF2FF", image: img1 },
  { title: "Keep members coming back", body: "Track renewals and dues, send payment links on WhatsApp and keep every member informed.", color: "#FFF1E8", image: img2 },
  { title: "Grow with clear numbers", body: "See revenue, collections and member trends in clear reports, so you can run a stronger gym.", color: "#E9F9F3", image: img3 },
];

const key = (id: string) => `nestgym:intro:${id}`;

// Shown once per user per browser, on their first login.
export default function IntroOnboarding() {
  const { isAuthenticated, user } = useAuth();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const id = (user as any)?.id || (user as any)?._id;

  let seen = true;
  try {
    seen = !id || localStorage.getItem(key(id)) === "1";
  } catch {
    // storage blocked: skip rather than nag every load
  }
  if (!isAuthenticated || seen || done || (user as any)?.role === "member") return null;

  const finish = () => {
    try {
      localStorage.setItem(key(id), "1");
    } catch {
      /* ignore */
    }
    setDone(true);
  };
  const last = step === SLIDES.length - 1;
  const s = SLIDES[step];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white text-slate-900" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between px-6 py-4">
        <img src={nestgymlogo} className="h-20"/>
        <button onClick={finish} className="text-sm font-semibold text-slate-500 hover:text-slate-800">
          Skip
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-6 pb-6">
        <div
          className="flex aspect-square w-full max-w-[380px] items-center justify-center overflow-hidden rounded-3xl"
          style={{ background: s.color }}
        >
          <img src={s.image} alt="" className="h-full w-full object-contain" />
        </div>
        <div className="max-w-md text-center">
          <h1 className="mb-3 text-3xl font-bold leading-tight">{s.title}</h1>
          <p className="text-base leading-relaxed text-slate-500">{s.body}</p>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 p-6">
        <div className="flex justify-center gap-2">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-2 rounded-full transition-all ${i === step ? "w-7 bg-primary" : "w-2 bg-slate-300"}`}
            />
          ))}
        </div>
        <button
          onClick={() => (last ? finish() : setStep(step + 1))}
          className="flex h-[54px] items-center justify-center gap-3 rounded-lg bg-primary text-base font-bold text-white"
        >
          {last ? "Get started" : "Next"} <span className="text-xl">→</span>
        </button>
      </div>
    </div>
  );
}
