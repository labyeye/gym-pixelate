import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type NotifVariant = "success" | "error" | "warning" | "info";

export interface NotifItem {
  id: string;
  variant: NotifVariant;
  title: string;
  message?: string;
  duration?: number;
  exiting?: boolean;
}

type NotifyFn = (title: string, message?: string, duration?: number) => void;

interface NotificationContextValue {
  success: NotifyFn;
  error: NotifyFn;
  warning: NotifyFn;
  info: NotifyFn;
}

const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);

export function useNotify() {
  const ctx = useContext(NotificationContext);
  if (!ctx)
    throw new Error("useNotify must be used inside NotificationProvider");
  return ctx;
}

const CONFIG: Record<
  NotifVariant,
  {
    icon: React.ElementType;
    bg: string;
    border: string;
    iconColor: string;
    progressColor: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    bg: "bg-white",
    border: "border-green-500",
    iconColor: "text-green-500",
    progressColor: "bg-green-500",
  },
  error: {
    icon: XCircle,
    bg: "bg-white",
    border: "border-red-500",
    iconColor: "text-red-500",
    progressColor: "bg-red-500",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-white",
    border: "border-[#FFDE00]",
    iconColor: "text-amber-500",
    progressColor: "bg-amber-400",
  },
  info: {
    icon: Info,
    bg: "bg-white",
    border: "border-[#024BAB]",
    iconColor: "text-[#024BAB]",
    progressColor: "bg-[#024BAB]",
  },
};

function NotifCard({
  item,
  onDismiss,
}: {
  item: NotifItem;
  onDismiss: (id: string) => void;
}) {
  const cfg = CONFIG[item.variant];
  const Icon = cfg.icon;
  const duration = item.duration ?? 3500;
  const [progress, setProgress] = useState(100);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = performance.now();
    const tick = () => {
      if (!startRef.current) return;
      const elapsed = performance.now() - startRef.current;
      const pct = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(pct);
      if (pct > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [duration]);

  return (
    <div
      className={cn(
        "relative flex items-start gap-3 w-80 p-4 border-2 border-black shadow-[4px_4px_0px_#000]",
        cfg.bg,

        item.exiting
          ? "animate-[slideOutRight_0.25s_ease-in_forwards]"
          : "animate-[slideInRight_0.3s_cubic-bezier(0.34,1.56,0.64,1)_forwards]",
      )}
    >
      {}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1",
          cfg.border.replace("border-", "bg-"),
        )}
      />

      <Icon className={cn("w-5 h-5 shrink-0 mt-0.5", cfg.iconColor)} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-black uppercase tracking-wide leading-tight">
          {item.title}
        </p>
        {item.message && (
          <p className="text-xs text-gray-600 mt-0.5 leading-snug">
            {item.message}
          </p>
        )}
      </div>

      <button
        onClick={() => onDismiss(item.id)}
        className="shrink-0 p-0.5 hover:bg-black/10 transition-colors"
      >
        <X className="w-3.5 h-3.5 text-black/50" />
      </button>

      {}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/10">
        <div
          className={cn("h-full transition-none", cfg.progressColor)}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [items, setItems] = useState<NotifItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, exiting: true } : n)),
    );
    setTimeout(() => {
      setItems((prev) => prev.filter((n) => n.id !== id));
    }, 260);
  }, []);

  const push = useCallback(
    (
      variant: NotifVariant,
      title: string,
      message?: string,
      duration = 3500,
    ) => {
      const id = Math.random().toString(36).slice(2);
      setItems((prev) => [
        ...prev.slice(-4),
        { id, variant, title, message, duration },
      ]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const ctx: NotificationContextValue = {
    success: (t, m, d) => push("success", t, m, d),
    error: (t, m, d) => push("error", t, m, d),
    warning: (t, m, d) => push("warning", t, m, d),
    info: (t, m, d) => push("info", t, m, d),
  };

  return (
    <NotificationContext.Provider value={ctx}>
      {children}
      {createPortal(
        <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 items-end">
          {items.map((item) => (
            <NotifCard key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </div>,
        document.body,
      )}
    </NotificationContext.Provider>
  );
}
