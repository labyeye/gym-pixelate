import { useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getNavGroupsForRole } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, LogOut, X } from "lucide-react";
import logoLong from "@/assets/images/logo_long.png";
import logoShort from "@/assets/images/logo_short.png";
import { useState } from "react";

interface AppSidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export function AppSidebar({ mobileOpen, onClose }: AppSidebarProps) {
  const { user, logout, modules } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  if (!user) return null;

  const groups = getNavGroupsForRole(user.role, modules);

  return (
    <>
      <aside
        className={cn(
          "h-screen bg-white border-r-2 border-black flex flex-col transition-all duration-300 ease-out z-50 shrink-0",
          "fixed inset-y-0 left-0 lg:sticky lg:top-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          collapsed ? "lg:w-16" : "w-62",
        )}
        style={{ width: collapsed ? undefined : "15.5rem" }}
      >
        <div
          className={cn(
            "h-16 flex items-center border-b-2 border-black shrink-0",
            collapsed ? "lg:justify-center lg:px-2 px-4 gap-3" : "px-4 gap-3",
          )}
        >
          <img
            src={logoLong}
            alt="NestGym"
            className={cn("h-12 w-auto max-w-[11rem] object-contain", collapsed && "lg:hidden")}
          />
          <img
            src={logoShort}
            alt="NestGym"
            className={cn("hidden w-10 h-10 object-contain shrink-0", collapsed && "lg:block")}
          />

          <button
            onClick={onClose}
            className="ml-auto lg:hidden p-1 hover:bg-[#024BAB]/20 border border-transparent hover:border-black transition-colors"
          >
            <X className="w-4 h-4 text-black" />
          </button>
        </div>

        <nav className="flex-1 py-3 px-2 overflow-y-auto space-y-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {groups.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 select-none">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = location.pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      title={collapsed ? item.title : undefined}
                      onClick={onClose}
                      className={cn(
                        "group flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-all duration-150 ease-out border-2",
                        active
                          ? "bg-[#024BAB] border-black text-white border-2"
                          : "border-transparent text-black hover:bg-[#024BAB]/10 hover:border-black hover:translate-x-0.5",
                        collapsed && "lg:justify-center lg:px-0",
                      )}
                    >
                      <item.icon className="w-[18px] h-[18px] shrink-0 transition-transform duration-150 group-hover:scale-110" />
                      <span className={cn(collapsed && "lg:hidden")}>
                        {item.title}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div
          className={cn(
            "border-t-2 border-black px-3 py-3 shrink-0",
            collapsed && "lg:hidden",
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 bg-[#024BAB] border-2 text-white border-black flex items-center justify-center text-xs font-bold shrink-0">
              {user.name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-black truncate">
                {user.name}
              </p>
              <p className="text-[10px] text-muted-foreground truncate capitalize">
                {user.role?.replace(/_/g, " ")}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-xs font-semibold text-black hover:text-red-600 transition-colors w-full py-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute -right-4 top-20 w-7 h-7 bg-[#024BAB] border-2 border-black items-center justify-center hover:bg-[#013a87] transition-colors nb-shadow-sm"
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-white" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5 text-white" />
          )}
        </button>
      </aside>
    </>
  );
}
