import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  Award,
  BadgeCheck,
  Briefcase,
  Building2,
  Calendar,
  Clock,
  CreditCard,
  FileText,
  HeartPulse,
  Hash,
  IndianRupee,
  Layers,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Megaphone,
  Package,
  Phone,
  PhoneCall,
  Ruler,
  Scale,
  Search,
  Tag,
  Target,
  User,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedValue } from "./AnimatedValue";
import { PhoneInput } from "@/components/ui/PhoneInput";

/* ------------------------------------------------------------------ label icons */

// First keyword that appears in a field label / modal title picks its icon.
const ICONS: [string[], LucideIcon][] = [
  [["emergency"], PhoneCall],
  [["email"], Mail],
  [["phone", "mobile", "whatsapp"], Phone],
  [["password"], Lock],
  [["pincode", "address", "state", "city", "room", "studio"], MapPin],
  [["date", "due", "follow-up", "schedule", "birth"], Calendar],
  [["time", "slot", "shift", "duration", "start"], Clock],
  [["height", "waist"], Ruler],
  [["weight", "water"], Scale],
  [
    [
      "₹",
      "price",
      "fee",
      "discount",
      "collect",
      "refund",
      "commission",
      "gst",
      "rate",
      "cost",
      "amount",
      "invoice",
      "sell",
    ],
    IndianRupee,
  ],
  [["method", "payment", "reference", "txn"], CreditCard],
  [["id proof", "id number"], BadgeCheck],
  [["goal", "target", "outcome"], Target],
  [
    ["diet", "supplement", "medic", "injur", "calorie", "protein", "health"],
    HeartPulse,
  ],
  [["sku", "stock", "reorder", "opening"], Package],
  [["experience", "special", "level"], Award],
  [["occupation"], Briefcase],
  [["how did", "source"], Megaphone],
  [
    ["gender", "relation", "roster", "clients", "trainer", "assign", "for"],
    Users,
  ],
  [["name", "member", "login", "staff"], User],
  [["note", "reason", "description", "what was", "medical", "log"], FileText],
  [["plan", "package", "category", "type", "membership"], Tag],
  [["max", "sessions"], Hash],
];
export function iconFor(text: string): LucideIcon {
  const t = (text || "").toLowerCase();
  for (const [keys, Icon] of ICONS)
    if (keys.some((k) => t.includes(k))) return Icon;
  return Layers;
}
// "Weight (kg)" -> "weight", "Collect now (₹)" -> "collect now"
const plain = (label: string) =>
  label
    .replace(/\(.*?\)/g, "")
    .replace(/[?*:]/g, "")
    .trim()
    .toLowerCase();

/* ------------------------------------------------------------------ formatting */

export const inr = (n?: number | null, decimals = 0) => {
  const v = Number(n || 0);
  return (
    (v < 0 ? "-₹" : "₹") +
    Math.abs(v).toLocaleString("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
};
export const fmtDate = (d?: string | Date | null) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
export const fmtDateTime = (d?: string | Date | null) =>
  d
    ? new Date(d).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
/** today as YYYY-MM-DD in the browser's (gym's) own timezone — toISOString() would give the UTC date */
export const todayStr = (d: Date = new Date()) => d.toLocaleDateString("en-CA");
export const toInputDate = (d?: string | Date | null) =>
  d ? new Date(d).toISOString().slice(0, 10) : "";
export const idOf = (x: any): string =>
  (x && typeof x === "object" ? x._id || x.id : x) || "";
export const daysFromNow = (d: string | Date) =>
  Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
export const titleCase = (s?: string) =>
  (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/* ------------------------------------------------------------------ small pieces */

export const PILL: Record<string, string> = {
  active: "nb-tag-green",
  paid: "nb-tag-green",
  completed: "nb-tag-green",
  converted: "nb-tag-green",
  available: "nb-tag-green",
  working: "nb-tag-green",
  attended: "nb-tag-green",
  booked: "nb-tag-green",
  partial: "nb-tag-orange",
  pending: "nb-tag-orange",
  upcoming: "nb-tag-blue",
  frozen: "nb-tag-teal",
  scheduled: "nb-tag-blue",
  contacted: "nb-tag-blue",
  new: "nb-tag-purple",
  trial_booked: "nb-tag-teal",
  trial_done: "nb-tag-teal",
  negotiating: "nb-tag-orange",
  waitlisted: "nb-tag-orange",
  assigned: "nb-tag-blue",
  under_maintenance: "nb-tag-orange",
  expired: "nb-tag-red",
  cancelled: "nb-tag-red",
  lost: "nb-tag-red",
  refunded: "nb-tag-red",
  missed: "nb-tag-red",
  no_show: "nb-tag-red",
  out_of_order: "nb-tag-red",
  blacklisted: "nb-tag-red",
  inactive: "nb-tag-white",
  upgraded: "nb-tag-purple",
  maintenance: "nb-tag-orange",
};

const TAGS = ["green", "orange", "blue", "teal", "purple", "red"];
/** stable colour class for any free-text label (expense categories etc.) */
export const tagFor = (v: string) => {
  let h = 0;
  for (const c of v || "") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return "nb-tag-" + TAGS[h % TAGS.length];
};

/** round photo (or initial) + name, the way NestHR shows people */
export function Thumb({
  photo,
  name,
  sub,
}: {
  photo?: string;
  name: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="w-8 h-8 border border-black bg-[#024BAB] text-white flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden rounded-full">
        {photo ? (
          <img src={photo} alt="" className="w-full h-full object-cover" />
        ) : (
          (name || "?")[0]?.toUpperCase()
        )}
      </div>
      <div className="min-w-0">
        <p className="font-bold truncate">{name}</p>
        {sub && <p className="text-xs text-black/50 truncate">{sub}</p>}
      </div>
    </div>
  );
}

export function Pill({
  value,
  className,
}: {
  value?: string;
  className?: string;
}) {
  if (!value) return null;
  return (
    <span
      className={cn(
        "nb-badge capitalize whitespace-nowrap",
        PILL[value] || "nb-tag-white",
        className,
      )}
    >
      {value.replace(/_/g, " ")}
    </span>
  );
}

export const inputCls =
  "border-2 border-black w-full px-3 py-2.5 text-sm font-medium bg-white outline-none";

export function Field({
  label,
  required,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-black">
        {(() => {
          const Icon = iconFor(label);
          return <Icon className="w-3.5 h-3.5 shrink-0 text-[#024BAB]" />;
        })()}
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-black/50 font-medium">{hint}</p>}
    </div>
  );
}

export function PhoneField({
  label,
  required,
  hint,
  className,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label} required={required} hint={hint} className={className}>
      <PhoneInput
        value={value}
        onChange={onChange}
        required={required}
        inputClassName={inputCls}
      />
    </Field>
  );
}

export function TextInput({ label, required, hint, className, ...rest }: any) {
  return (
    <Field label={label} required={required} hint={hint} className={className}>
      <input
        className={inputCls}
        required={required}
        placeholder={`Enter ${plain(label)}`}
        {...rest}
      />
    </Field>
  );
}

export function SelectInput({
  label,
  required,
  hint,
  className,
  options,
  placeholder,
  value,
  onChange,
  ...rest
}: any) {
  return (
    <Field label={label} required={required} hint={hint} className={className}>
      <select
        className={cn(inputCls, "font-bold")}
        required={required}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {(options || []).map((o: any) => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? titleCase(o) : o.label;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
    </Field>
  );
}

export function TextArea({ label, hint, className, rows = 2, ...rest }: any) {
  return (
    <Field label={label} hint={hint} className={className}>
      <textarea
        rows={rows}
        className={cn(inputCls, "resize-none")}
        placeholder={`Enter ${plain(label)}`}
        {...rest}
      />
    </Field>
  );
}

export function Btn({
  children,
  color = "#024BAB",
  onClick,
  type = "button",
  disabled,
  busy,
  className,
  light,
}: {
  children: ReactNode;
  color?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  busy?: boolean;
  className?: string;
  light?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        "nb-btn px-4 py-2 text-sm flex items-center justify-center gap-1.5 disabled:opacity-50",
        light ? "bg-white text-black" : "text-white",
        className,
      )}
      style={light ? undefined : { backgroundColor: color }}
    >
      {busy && <Loader2 className="w-4 h-4 animate-spin" />} {children}
    </button>
  );
}

/* ------------------------------------------------------------------ stat card */

export function StatCard({
  label,
  value,
  icon: Icon,
  color = "#024BAB",
  sub,
  onClick,
  active,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  color?: string;
  sub?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const Tag: any = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "nb-rise nb-lift border-2 border-black bg-white p-4 flex items-center gap-3 text-left",
        !onClick &&
          "hover:!shadow-none hover:!translate-x-0 hover:!translate-y-0",
        active && "shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]",
      )}
      style={active ? { backgroundColor: `${color}14` } : undefined}
    >
      <div
        className="nb-chip nb-chip-hover w-10 h-10 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center shrink-0"
        style={{ backgroundColor: color }}
      >
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-black leading-tight tabular-nums">
          <AnimatedValue value={value} />
        </p>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider truncate">
          {label}
        </p>
        {sub ? (
          <p className="text-xs text-muted-foreground truncate">{sub}</p>
        ) : null}
      </div>
    </Tag>
  );
}

export const StatGrid = ({
  children,
  cols = 4,
}: {
  children: ReactNode;
  cols?: number;
}) => (
  <div
    className={cn(
      "grid grid-cols-2 gap-3 mb-5",
      cols === 4
        ? "lg:grid-cols-4"
        : cols === 3
          ? "lg:grid-cols-3"
          : "lg:grid-cols-5",
    )}
  >
    {children}
  </div>
);

/* ------------------------------------------------------------------ row actions */

export function RowActions({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function ActionButton({
  label,
  icon: Icon,
  onClick,
  to,
  disabled,
  tone,
}: {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  to?: string;
  disabled?: boolean;
  tone?: "danger" | "primary";
}) {
  const cls = cn(
    "p-1.5 border-2 border-transparent hover:border-black hover:bg-[#024BAB]/10 transition-colors disabled:opacity-30 disabled:pointer-events-none",
    tone === "danger" && "text-red-600 hover:bg-red-50",
  );
  if (to && !disabled)
    return (
      <Link to={to} aria-label={label} title={label} className={cls}>
        <Icon className="w-3.5 h-3.5" />
      </Link>
    );
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cls}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

/* ------------------------------------------------------------------ modal */

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
  tabs,
  tab,
  onTab,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  tabs?: string[];
  tab?: number;
  onTab?: (i: number) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div
      className="nb-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={cn(
          "nb-modal flex max-h-[94vh] w-full flex-col border-2 border-black bg-white nb-shadow-lg",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b-2 border-black bg-[#024BAB] px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            {(() => {
              const Icon = iconFor(title);
              return (
                <div className="w-9 h-9 shrink-0 border-2 border-black bg-white flex items-center justify-center">
                  <Icon className="w-4 h-4 text-[#024BAB]" />
                </div>
              );
            })()}
            <div className="min-w-0">
              <h2 className="font-black uppercase tracking-wider text-white text-base truncate">
                {title}
              </h2>
              {subtitle && (
                <p className="text-xs text-white/80 font-medium truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shrink-0 hover:bg-[#FA731C]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {tabs && (
          <div className="flex overflow-x-auto border-b-2 border-black bg-[#024BAB]/5">
            {tabs.map((t, i) => (
              <button
                key={t}
                type="button"
                onClick={() => onTab?.(i)}
                className={cn(
                  "flex-1 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest whitespace-nowrap border-r-2 border-black last:border-r-0",
                  tab === i
                    ? "bg-[#FA731C] text-white"
                    : "bg-white text-black hover:bg-[#024BAB]/10",
                )}
              >
                {i + 1}. {t}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-black bg-white px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ table + toolbar */

export function SearchBox({
  value,
  onChange,
  placeholder = "Search...",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => onChange(v), 300);
    return () => clearTimeout(t);
  }, [v]); // debounce
  useEffect(() => setV(value), [value]);
  return (
    <div className="flex items-center gap-2 border-2 border-black bg-white px-3 py-2 w-full sm:w-72">
      <Search className="w-4 h-4 shrink-0" />
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent text-sm outline-none w-full font-medium placeholder:text-black/40"
      />
    </div>
  );
}

export function Toolbar({
  children,
  right,
}: {
  children?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 mb-5">
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 w-full lg:flex-1 min-w-0">
        {children}
      </div>
      <div className="flex gap-2 flex-wrap shrink-0">{right}</div>
    </div>
  );
}

export function DataTable({
  head,
  loading,
  empty,
  children,
  colSpan,
}: {
  head: string[];
  loading?: boolean;
  empty?: boolean;
  children: ReactNode;
  colSpan?: number;
}) {
  const span = colSpan || head.length;
  return (
    <div className="border-2 border-black overflow-x-auto bg-white nb-clean">
      <table className="w-full text-sm border-collapse min-w-[640px]">
        <thead>
          <tr className="border-b-2 border-black bg-[#024BAB]/5">
            {head.map((h, i) => (
              <th
                key={h + i}
                className={cn(
                  "px-4 py-3 text-xs font-bold text-black uppercase tracking-wider text-left whitespace-nowrap",

                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={span} className="text-center py-14">
                <Loader2 className="w-7 h-7 animate-spin mx-auto text-[#024BAB]" />
              </td>
            </tr>
          ) : empty ? (
            <tr>
              <td
                colSpan={span}
                className="text-center py-14 text-sm font-black uppercase tracking-widest text-black/30"
              >
                Nothing here yet.
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export const Tr = ({
  children,
  onClick,
  i = 0,
}: {
  children: ReactNode;
  onClick?: () => void;
  i?: number;
}) => (
  <tr
    onClick={onClick}
    className={cn(
      "border-b border-black/10 hover:bg-[#024BAB]/5 transition-colors",
      i % 2 === 1 && "bg-[#F8FAFF]",
      onClick && "cursor-pointer",
    )}
  >
    {children}
  </tr>
);
export const Td = ({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) => <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;

export function Pager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 mt-4">
      <Btn
        light
        onClick={() => onPage(Math.max(1, page - 1))}
        disabled={page <= 1}
      >
        Prev
      </Btn>
      <span className="text-xs font-black uppercase tracking-widest">
        Page {page} / {pages}
      </span>
      <Btn
        light
        onClick={() => onPage(Math.min(pages, page + 1))}
        disabled={page >= pages}
      >
        Next
      </Btn>
    </div>
  );
}

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex overflow-x-auto border-2 border-black bg-white mb-5 w-fit max-w-full">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "px-4 py-2 text-[11px] font-black uppercase tracking-widest whitespace-nowrap border-r-2 border-black last:border-r-0",
            value === t.id
              ? "bg-[#FA731C] text-white"
              : "hover:bg-[#024BAB]/10",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="ml-1.5 opacity-70">({t.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}

export const Panel = ({
  title,
  children,
  right,
  className,
}: {
  title?: string;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) => (
  <div className={cn("nb-card nb-rise", className)}>
    {title && (
      <div className="flex items-center justify-between border-b-2 border-black px-4 py-2.5 bg-[#024BAB]/5">
        <h3 className="text-xs font-black uppercase tracking-widest">
          {title}
        </h3>
        {right}
      </div>
    )}
    <div className="p-4">{children}</div>
  </div>
);

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
