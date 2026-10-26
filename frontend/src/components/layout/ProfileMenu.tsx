import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Coins, Crown, LogOut, Plus, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { fmtCredits, useCredits } from "@/contexts/CreditsContext";

function Avatar({ src, name }: { src?: string; name?: string }) {
  return (
    <div className="w-8 h-8 border-2 border-black shrink-0 overflow-hidden bg-[#FA731C] flex items-center justify-center text-xs font-bold text-white rounded-full">
      {src ? <img src={src} alt={name} className="w-full h-full object-cover" /> : (name?.[0]?.toUpperCase() ?? "U")}
    </div>
  );
}

const titleCase = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);

/** Header profile: avatar + name, Premium badge and the WhatsApp credits pill (owner / manager). */
export function ProfileMenu() {
  const { user, tenant, logout } = useAuth();
  const { credits } = useCredits();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  if (!user) return null;

  const isTrial = tenant?.plan === "trial";
  const isPaid = !!tenant && tenant.status === "active" && !isTrial;
  const badge = isPaid ? "Premium" : isTrial ? "Trial" : null;
  const metered = !!credits?.metered;
  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 border-2 border-black bg-white px-2 py-1 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:bg-[#F8FAFF] transition-colors"
        aria-label="Account menu"
      >
        <Avatar src={user.avatar} name={user.name} />
        <span className="hidden md:block text-sm font-bold text-black max-w-[110px] truncate">{user.name}</span>
        {badge && (
          <span className="hidden sm:flex items-center gap-1 border-2 border-black bg-[#FFF4D6] px-1.5 py-0.5 text-[11px] font-bold text-black">
            <Crown className="w-3 h-3 text-[#024BAB]" /> {badge}
          </span>
        )}
        {metered && (
          <span
            className={`flex items-center gap-1 border-2 border-black px-1.5 py-0.5 text-[11px] font-bold text-white ${credits?.zero ? "bg-red-600" : credits?.low ? "bg-[#FA731C]" : "bg-[#00A878]"}`}
            title="WhatsApp credits"
          >
            <Coins className="w-3 h-3" /> {fmtCredits(credits?.total)}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-black transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-72 border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] z-50">
          <div className="flex items-center gap-3 px-4 py-3 border-b-2 border-black bg-[#024BAB]">
            <Avatar src={user.avatar} name={user.name} />
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{user.name}</p>
              <p className="text-[11px] text-white/70 truncate">{tenant?.name || user.email}</p>
            </div>
          </div>

          {badge && (
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-black/10">
              <span className="flex items-center gap-1.5 text-xs font-bold text-black">
                <Crown className="w-3.5 h-3.5 text-[#024BAB]" /> {badge}
              </span>
              <span className="text-[11px] text-muted-foreground font-medium">{isTrial ? "Free trial" : `${titleCase(tenant?.plan)} plan`}</span>
            </div>
          )}

          {metered && (
            <div className="px-4 py-3 border-b border-black/10 space-y-2">
              <div className="flex items-end justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">WhatsApp credits</span>
                <span className={`text-xl font-black ${credits?.zero ? "text-red-600" : "text-black"}`}>{fmtCredits(credits?.total)}</span>
              </div>
              {!!credits?.bonus && (
                <p className="text-[11px] text-gray-500">
                  incl. {fmtCredits(credits.bonus)} bonus
                  {credits.bonusExpiresAt ? ` (till ${new Date(credits.bonusExpiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })})` : ""}
                </p>
              )}
              {credits?.zero ? (
                <p className="text-[11px] font-bold text-red-600">Member WhatsApp messages are paused. Add credits to resume.</p>
              ) : credits?.low ? (
                <p className="text-[11px] font-bold text-[#FA731C]">Running low.</p>
              ) : null}
              <button
                onClick={() => go("/credits")}
                className="w-full flex items-center justify-center gap-1.5 border-2 border-black bg-[#024BAB] text-white text-xs font-bold py-2 hover:bg-[#013a85] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add credits
              </button>
            </div>
          )}

          <button onClick={() => go("/subscription")} className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-black hover:bg-[#024BAB]/5 text-left">
            <Wallet className="w-3.5 h-3.5" /> Plan &amp; billing
          </button>
          {metered && (
            <button onClick={() => go("/credits")} className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-black hover:bg-[#024BAB]/5 text-left border-t border-black/10">
              <Coins className="w-3.5 h-3.5" /> Credits &amp; usage
            </button>
          )}
          <button onClick={logout} className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 text-left border-t-2 border-black">
            <LogOut className="w-3.5 h-3.5" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
