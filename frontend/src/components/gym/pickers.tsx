import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, UserRound, X } from "lucide-react";
import { gym } from "@/services/gymApi";
import { Field, inputCls, useDebounced, idOf } from "./kit";
import { cn } from "@/lib/utils";

/** Search-as-you-type member picker (scales to thousands of members, unlike a giant <select>). */
export function MemberPicker({
  label = "Member",
  value,
  onChange,
  required,
  className,
}: {
  label?: string;
  value: any;
  onChange: (m: any | null) => void;
  required?: boolean;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q.trim());
  const { data } = useQuery({
    queryKey: ["member-pick", dq],
    queryFn: () => gym.members.list({ search: dq, limit: 8 }),
    enabled: open,
  });
  const rows = data?.data || [];

  return (
    <Field
      label={label}
      required={required}
      className={cn("relative", className)}
    >
      {value ? (
        <div className="flex items-center justify-between gap-2 border-2 border-black bg-[#00C48C]/15 px-3 py-2 text-sm">
          <span className="flex items-center gap-2 font-bold min-w-0">
            <UserRound className="w-4 h-4 shrink-0" />
            <span className="truncate">{value.name}</span>
            <span className="text-xs text-black/50 shrink-0">
              {value.memberCode || value.phone}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Clear"
            className="shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <input
            className={inputCls}
            placeholder="Type name, phone or member code…"
            value={q}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
          />
          {open && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto border-2 border-black bg-white nb-shadow">
              {rows.length === 0 ? (
                <p className="p-3 text-xs font-bold text-black/40 uppercase">
                  {dq ? "No match" : "Start typing…"}
                </p>
              ) : (
                rows.map((m: any) => (
                  <button
                    type="button"
                    key={m._id}
                    onClick={() => {
                      onChange(m);
                      setOpen(false);
                      setQ("");
                    }}
                    className="flex w-full items-center justify-between gap-2 border-b border-black/10 px-3 py-2 text-left text-sm hover:bg-[#FA731C]/15 last:border-0"
                  >
                    <span className="font-bold truncate">{m.name}</span>
                    <span className="text-xs text-black/50 shrink-0">
                      {m.memberCode} · {m.phone}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </>
      )}
    </Field>
  );
}

export function useTrainers() {
  const { data } = useQuery({
    queryKey: ["trainers-list"],
    queryFn: () => gym.users.list({ role: "trainer", status: "active" }),
    staleTime: 60_000,
  });
  return (data?.data || []).map((u: any) => ({
    value: u._id || u.id,
    label: u.name,
  }));
}

export function usePlans(activeOnly = true) {
  const { data } = useQuery({
    queryKey: ["plans", activeOnly],
    queryFn: () =>
      gym.plans.list({
        ...(activeOnly ? { isActive: "true" } : {}),
        limit: 100,
      }),
    staleTime: 30_000,
  });
  return (data?.data || []) as any[];
}

export function useClasses() {
  const { data } = useQuery({
    queryKey: ["classes-list"],
    queryFn: () => gym.classes.list({ limit: 100 }),
    staleTime: 30_000,
  });
  return (data?.data || []).map((c: any) => ({ value: c._id, label: c.name }));
}

export const Check2 = ({ on }: { on: boolean }) =>
  on ? (
    <Check className="w-4 h-4 text-[#00A070]" />
  ) : (
    <span className="text-black/20">—</span>
  );
export { idOf };
