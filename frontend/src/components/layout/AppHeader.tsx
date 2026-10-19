import { useAuth } from "@/contexts/AuthContext";
import { Bell, Search, Menu } from "lucide-react";
import { useState } from "react";

interface AppHeaderProps {
  title: string;
  onMenuOpen: () => void;
}

export function AppHeader({ title, onMenuOpen }: AppHeaderProps) {
  const { user } = useAuth();
  const [searchVal, setSearchVal] = useState("");

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

        <button
          className="relative w-9 h-9 border-2 border-black bg-white flex items-center justify-center hover:bg-[#024BAB] transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-[18px] h-[18px] text-black" />
          <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 border border-black" />
        </button>

        <div className="flex items-center gap-2 border-2 border-black bg-[#024BAB] px-2 sm:px-3 py-1.5">
          <div className="w-6 h-6 border border-white shrink-0 overflow-hidden">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-white flex items-center justify-center text-[10px] font-bold text-black">
                {user.name?.[0]?.toUpperCase() ?? "U"}
              </div>
            )}
          </div>
          <span className="hidden sm:block text-sm font-bold text-white max-w-[100px] truncate">
            {user.name}
          </span>
        </div>
      </div>
    </header>
  );
}
