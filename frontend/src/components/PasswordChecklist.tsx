import { Check } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/passwordRules";

/** Live checklist under a "new password" field: each rule gets a tick the moment it is met. */
export default function PasswordChecklist({ password }: { password: string }) {
  const done = PASSWORD_RULES.filter((r) => r.test(password)).length;
  const pct = password ? (done / PASSWORD_RULES.length) * 100 : 0;
  const color = pct < 50 ? "#EF4444" : pct < 100 ? "#F59E0B" : "#00C48C";
  return (
    <div className="border-2 border-black/10 bg-gray-50 p-3 mt-2" aria-live="polite">
      <div className="h-1.5 bg-gray-200 mb-3 overflow-hidden">
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${pct}%`, background: color }} />
      </div>
      <ul className="space-y-1.5">
        {PASSWORD_RULES.map((r) => {
          const ok = !!password && r.test(password);
          return (
            <li key={r.id} className={`flex items-center gap-2 text-xs font-medium transition-colors duration-300 ${ok ? "text-green-700" : "text-gray-500"}`}>
              <span
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-300 ${
                  ok ? "bg-green-500 border-green-500 scale-110" : "border-gray-300"
                }`}
              >
                <Check className={`w-2.5 h-2.5 text-white transition-all duration-300 ${ok ? "opacity-100 scale-100" : "opacity-0 scale-0"}`} strokeWidth={4} />
              </span>
              {r.label}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-gray-500 mt-3 leading-snug">
        Easy patterns like <b>1234</b> are on every hacker's list. You also can't reuse any of your last 5 passwords.
      </p>
    </div>
  );
}
