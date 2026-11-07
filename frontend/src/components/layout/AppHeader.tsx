import { useAuth } from "@/contexts/AuthContext";
import { Bell, Search, Menu, Cake, PartyPopper } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { celebrationsAPI } from "@/services/api";
import { ProfileMenu } from "./ProfileMenu";

interface AppHeaderProps {
  title: string;
  onMenuOpen: () => void;
}

export function AppHeader({ title, onMenuOpen }: AppHeaderProps) {
  const { user } = useAuth();
  const [searchVal, setSearchVal] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user)
      celebrationsAPI
        .today()
        .then((r) => setItems(r.data ?? []))
        .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  if (!user) return null;

  return (
    <header className="h-16 border-b-2 border-black bg-white flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20 shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuOpen}
          className="lg:hidden w-9 h-9 border-2 border-black bg-white flex items-center justify-center hover:bg-[#024BAB] transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-[18px] h-[18px] text-black" />
        </button>
        <h1 className="font-display font-bold text-lg sm:text-xl text-black">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden md:flex items-center gap-2 border-2 border-black bg-white px-3 py-1.5 w-48 lg:w-52">
          <Search className="w-4 h-4 text-black shrink-0" />
          <input
            type="text"
            placeholder="Search members..."
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            className="bg-transparent text-sm outline-none w-full text-black placeholder:text-muted-foreground font-medium"
          />
        </div>

        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="relative w-9 h-9 border-2 border-black bg-white flex items-center justify-center hover:bg-[#024BAB] transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-[18px] h-[18px] text-black" />
            {items.length > 0 && (
              <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 border border-black" />
            )}
          </button>
          {open && (
            <div className="absolute right-0 top-11 w-72 border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] z-50">
              <div className="px-4 py-3 border-b-2 border-black bg-[#024BAB] text-sm font-bold text-white">
                Today
              </div>
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs font-bold text-muted-foreground">
                  No birthdays or anniversaries today
                </p>
              ) : (
                items.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-center gap-3 px-4 py-3 border-b border-black/10 last:border-0"
                  >
                    <div className="w-8 h-8 rounded-full border-2 border-black shrink-0 overflow-hidden bg-[#024BAB] flex items-center justify-center text-xs font-bold text-white">
                      {n.avatar ? (
                        <img
                          src={n.avatar}
                          alt={n.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        n.name?.[0]?.toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-black truncate">
                        {n.name}{" "}
                        <span className="font-normal text-muted-foreground">
                          · {n.who}
                        </span>
                      </p>
                      <p className="flex items-center gap-1 text-[11px] text-[#FA731C]">
                        {n.kind === "birthday" ? (
                          <Cake className="w-3 h-3" />
                        ) : (
                          <PartyPopper className="w-3 h-3" />
                        )}
                        {n.kind === "birthday" ? "🎂" : "🎉"} {n.detail}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <ProfileMenu />
      </div>
    </header>
  );
}
