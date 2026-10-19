import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { COUNTRIES, countryOf, joinPhone, splitPhone } from "@/lib/countries";

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /** match the surrounding form's input style */
  inputClassName?: string;
}

// Emoji flags do not render on Windows (they show as "IN"), so use real flag images.
function Flag({ iso, name }: { iso: string; name: string }) {
  const [bad, setBad] = useState(false);
  if (bad) return <span className="text-[10px] font-black">{iso}</span>;
  return (
    <img
      src={`https://flagcdn.com/w40/${iso.toLowerCase()}.png`}
      alt={name}
      width={22}
      height={16}
      loading="lazy"
      onError={() => setBad(true)}
      className="h-4 w-[22px] shrink-0 border border-black/30 object-cover"
    />
  );
}

/**
 * Country-code picker + number box. The picker is rounded on the left only and the number box on
 * the right only, so they read as one field. Emits the stored format (see lib/countries.ts).
 */
export function PhoneInput({
  value,
  onChange,
  className = "",
  required,
  disabled,
  autoFocus,
  inputClassName = "border-2 border-black bg-white px-3 py-2.5 text-sm font-medium outline-none",
}: Props) {
  const init = splitPhone(value);
  const [iso, setIso] = useState(init.iso);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // follow external resets (e.g. opening a different record) without fighting the user's own country choice
  useEffect(() => {
    const s = splitPhone(value);
    if (value && countryOf(s.iso).dial !== countryOf(iso).dial) setIso(s.iso); // US/CA share +1: keep the user's pick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const national = splitPhone(value).national;
  const country = COUNTRIES.find((c) => c.iso === iso) || COUNTRIES[0];

  return (
    <div ref={root} className={`relative ${className}`}>
      <div className="flex">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Country code"
          title={`${country.name} (+${country.dial})`}
          className={`${inputClassName} no-nb shadow-[3px_3px_0px_#0a0a0a] flex !w-auto shrink-0 items-center gap-1.5 rounded-l-lg rounded-r-none border-r-0 font-bold disabled:opacity-60`}
        >
          <Flag iso={country.iso} name={country.name} />
          <span>+{country.dial}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          required={required}
          disabled={disabled}
          value={national}
          maxLength={iso === "IN" ? 10 : 12}
          placeholder={iso === "IN" ? "98765 43210" : "Phone number"}
          title={`${country.name} (+${country.dial})`}
          onChange={(e) => onChange(joinPhone(iso, e.target.value))}
          className={`${inputClassName} min-w-0 flex-1 rounded-l-none rounded-r-lg`}
        />
      </div>

      {open && (
        <ul role="listbox" className="absolute left-0 top-full z-50 mt-1.5 max-h-60 w-72 overflow-auto border-2 border-black bg-white shadow-[3px_3px_0px_#0a0a0a]">
          {COUNTRIES.map((c) => (
            <li key={c.iso}>
              <button
                type="button"
                role="option"
                aria-selected={c.iso === iso}
                onClick={() => {
                  setIso(c.iso);
                  onChange(joinPhone(c.iso, national));
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-[#024BAB]/10 ${c.iso === iso ? "bg-[#024BAB]/10 font-bold" : ""}`}
              >
                <Flag iso={c.iso} name={c.name} />
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-black/50">+{c.dial}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
