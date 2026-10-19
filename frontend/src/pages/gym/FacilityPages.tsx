import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BadgeIndianRupee,
  Boxes,
  CalendarCheck,
  KeyRound,
  LockKeyhole,
  Megaphone,
  Receipt,
  Ruler,
  Tag,
  Unlock,
  Wallet,
  Wrench,
} from "lucide-react";
import { ResourcePage } from "@/components/gym/ResourcePage";
import {
  ActionButton,
  Btn,
  Modal,
  Pill,
  StatCard,
  StatGrid,
  TextArea,
  TextInput,
  SelectInput,
  Thumb,
  tagFor,
  fmtDate,
  inr,
  titleCase,
} from "@/components/gym/kit";
import { todayStr } from "@/components/gym/kit";
import { MemberPicker } from "@/components/gym/pickers";
import { gym } from "@/services/gymApi";
import { useNotify } from "@/components/ui/Notification";

/* ------------------------------------------------------------------ lockers */
export function LockersPage() {
  const notify = useNotify();
  const qc = useQueryClient();
  const [assign, setAssign] = useState<any | null>(null);
  const [member, setMember] = useState<any | null>(null);
  const [months, setMonths] = useState("1");
  const run = async (fn: () => Promise<any>, ok: string) => {
    try {
      await fn();
      notify.success(ok);
      setAssign(null);
      setMember(null);
      qc.invalidateQueries({ queryKey: ["lockers"] });
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };
  return (
    <ResourcePage<any>
      title="Lockers"
      noun="locker"
      permission="Lockers"
      api={gym.lockers}
      queryKey="lockers"
      filters={[
        {
          key: "status",
          label: "statuses",
          options: ["available", "assigned", "maintenance"],
        },
        { key: "zone", label: "zones", options: ["men", "women", "unisex"] },
      ]}
      stats={(rows, total) => (
        <StatGrid>
          <StatCard
            label="Total lockers"
            value={total}
            icon={LockKeyhole}
            color="#024BAB"
          />
          <StatCard
            label="Available"
            value={rows.filter((r) => r.status === "available").length}
            icon={Unlock}
            color="#00C48C"
          />
          <StatCard
            label="Assigned"
            value={rows.filter((r) => r.status === "assigned").length}
            icon={KeyRound}
            color="#A855F7"
          />
          <StatCard
            label="Expiring ≤ 7 days"
            value={
              rows.filter(
                (r) =>
                  r.status === "assigned" &&
                  r.validTill &&
                  new Date(r.validTill).getTime() - Date.now() < 7 * 86400000,
              ).length
            }
            icon={AlertTriangle}
            color="#FA731C"
          />
        </StatGrid>
      )}
      columns={[
        {
          label: "Locker",
          render: (r) => (
            <span className="font-black text-lg">#{r.number}</span>
          ),
        },
        {
          label: "Zone",
          render: (r) => <span className="capitalize font-bold">{r.zone}</span>,
        },
        {
          label: "Rent / mo",
          render: (r) => (
            <span className="font-bold">{inr(r.monthlyRent)}</span>
          ),
        },
        { label: "Status", render: (r) => <Pill value={r.status} /> },
        {
          label: "Member",
          render: (r) =>
            r.memberId ? (
              <div>
                <p className="font-bold">{r.memberId.name}</p>
                <p className="text-xs text-black/50">
                  till {fmtDate(r.validTill)}
                </p>
              </div>
            ) : (
              "—"
            ),
        },
      ]}
      fields={[
        { key: "number", label: "Locker number", required: true },
        {
          key: "zone",
          label: "Zone",
          type: "select",
          options: ["men", "women", "unisex"],
          default: "unisex",
        },
        {
          key: "monthlyRent",
          label: "Monthly rent (₹)",
          type: "number",
          default: 0,
        },
        { key: "deposit", label: "Deposit (₹)", type: "number", default: 0 },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: ["available", "maintenance"],
          default: "available",
          hint: "Use Assign to give a locker to a member",
        },
      ]}
      rowActions={(r) =>
        r.status === "available" ? (
          <ActionButton
            label="Assign to member"
            icon={KeyRound}
            tone="primary"
            onClick={() => setAssign(r)}
          />
        ) : r.status === "assigned" ? (
          <ActionButton
            label="Release"
            icon={Unlock}
            onClick={() =>
              run(() => gym.lockers.release(r._id), "Locker released")
            }
          />
        ) : null
      }
      after={
        <Modal
          open={!!assign}
          title={`Assign locker #${assign?.number || ""}`}
          onClose={() => setAssign(null)}
          footer={
            <>
              <Btn light onClick={() => setAssign(null)}>
                Cancel
              </Btn>
              <Btn
                disabled={!member}
                onClick={() =>
                  run(
                    () =>
                      gym.lockers.assign(assign._id, {
                        memberId: member._id,
                        months: Number(months),
                      }),
                    "Locker assigned",
                  )
                }
              >
                Assign
              </Btn>
            </>
          }
        >
          <MemberPicker value={member} onChange={setMember} required />
          <SelectInput
            label="For"
            options={["1", "3", "6", "12"].map((m) => ({
              value: m,
              label: `${m} month${m === "1" ? "" : "s"}`,
            }))}
            value={months}
            onChange={setMonths}
          />
        </Modal>
      }
    />
  );
}

/* ------------------------------------------------------------------ expenses */
const EXP_CATS = [
  "rent",
  "salary",
  "electricity",
  "water",
  "equipment",
  "maintenance",
  "marketing",
  "supplies",
  "software",
  "other",
];
export function ExpensesPage() {
  // categories already used (any custom ones too) + defaults — typing a new name creates it
  const { data: all } = useQuery({
    queryKey: ["expenses", "categories"],
    queryFn: () => gym.expenses.list({ limit: 1000 }),
    staleTime: 30_000,
  });
  const cats = Array.from(
    new Set([...EXP_CATS, ...(all?.data || []).map((e: any) => e.category)]),
  );
  return (
    <ResourcePage<any>
      title="Expenses"
      noun="expense"
      permission="Expenses"
      api={gym.expenses}
      queryKey="expenses"
      filters={[{ key: "category", label: "categories", options: cats }]}
      stats={(rows, total) => {
        const sum = rows.reduce((s, r) => s + r.amount, 0);
        const top = Object.entries(
          rows.reduce(
            (m: any, r) => ({
              ...m,
              [r.category]: (m[r.category] || 0) + r.amount,
            }),
            {},
          ),
        ).sort((a: any, b: any) => b[1] - a[1])[0] as any;
        return (
          <StatGrid cols={3}>
            <StatCard
              label="Entries"
              value={total}
              icon={Receipt}
              color="#024BAB"
            />
            <StatCard
              label="Spend (this page)"
              value={inr(sum)}
              icon={Wallet}
              color="#EF4444"
            />
            <StatCard
              label="Biggest category"
              value={top ? titleCase(top[0]) : "—"}
              sub={top ? inr(top[1]) : undefined}
              icon={BadgeIndianRupee}
              color="#FA731C"
            />
          </StatGrid>
        );
      }}
      columns={[
        {
          label: "Date",
          render: (r) => <span className="font-bold">{fmtDate(r.paidOn)}</span>,
        },
        {
          label: "Category",
          render: (r) => (
            <span className={"nb-badge capitalize whitespace-nowrap " + tagFor(r.category)}>
              {r.category}
            </span>
          ),
        },
        { label: "Vendor", render: (r) => r.vendor || "—" },
        {
          label: "Note",
          render: (r) => (
            <span className="text-xs">{r.description || "—"}</span>
          ),
        },
        {
          label: "Method",
          render: (r) => (
            <span className="capitalize text-xs font-bold">
              {titleCase(r.method)}
            </span>
          ),
        },
        {
          label: "Amount",
          render: (r) => <span className="font-black">{inr(r.amount)}</span>,
        },
      ]}
      fields={[
        {
          key: "category",
          label: "Category",
          type: "combo",
          options: cats,
          required: true,
          default: "rent",
          hint: "Type a new name to add a category",
        },
        {
          key: "amount",
          label: "Amount (₹)",
          type: "number",
          required: true,
          min: 0,
        },
        { key: "paidOn", label: "Paid on", type: "date", default: todayStr() },
        {
          key: "method",
          label: "Method",
          type: "select",
          options: ["cash", "card", "upi", "bank_transfer", "cheque"],
          default: "cash",
        },
        { key: "vendor", label: "Vendor / payee" },
        { key: "description", label: "Description", type: "textarea", span: 2 },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ coupons */
export function CouponsPage() {
  return (
    <ResourcePage<any>
      title="Coupons & Offers"
      noun="coupon"
      permission="Coupons"
      api={gym.coupons}
      queryKey="coupons"
      stats={(rows, total) => (
        <StatGrid cols={3}>
          <StatCard label="Coupons" value={total} icon={Tag} color="#024BAB" />
          <StatCard
            label="Active"
            value={
              rows.filter(
                (r) =>
                  r.isActive &&
                  (!r.validTill || new Date(r.validTill) > new Date()),
              ).length
            }
            icon={CalendarCheck}
            color="#00C48C"
          />
          <StatCard
            label="Redeemed"
            value={rows.reduce((s, r) => s + r.usedCount, 0)}
            icon={BadgeIndianRupee}
            color="#FA731C"
          />
        </StatGrid>
      )}
      columns={[
        {
          label: "Code",
          render: (r) => (
            <span className="font-black tracking-widest border-2 border-dashed border-black px-2 py-0.5">
              {r.code}
            </span>
          ),
        },
        {
          label: "Offer",
          render: (r) => (
            <span className="font-bold">
              {r.type === "percent"
                ? `${r.value}% off${r.maxDiscount ? ` (max ${inr(r.maxDiscount)})` : ""}`
                : `${inr(r.value)} off`}
            </span>
          ),
        },
        {
          label: "Min bill",
          render: (r) => (r.minAmount ? inr(r.minAmount) : "—"),
        },
        {
          label: "Used",
          render: (r) =>
            `${r.usedCount}${r.usageLimit ? ` / ${r.usageLimit}` : ""}`,
        },
        { label: "Valid till", render: (r) => fmtDate(r.validTill) },
        {
          label: "Status",
          render: (r) => (
            <Pill
              value={
                !r.isActive
                  ? "inactive"
                  : r.validTill && new Date(r.validTill) < new Date()
                    ? "expired"
                    : "active"
              }
            />
          ),
        },
      ]}
      fields={[
        {
          key: "code",
          label: "Code",
          required: true,
          placeholder: "NEWYEAR20",
        },
        {
          key: "type",
          label: "Type",
          type: "select",
          options: ["percent", "flat"],
          default: "percent",
          required: true,
        },
        {
          key: "value",
          label: "Value (% or ₹)",
          type: "number",
          required: true,
          min: 0,
        },
        {
          key: "maxDiscount",
          label: "Max discount (₹)",
          type: "number",
          hint: "For % coupons. 0 = no cap",
        },
        { key: "minAmount", label: "Minimum bill (₹)", type: "number" },
        {
          key: "usageLimit",
          label: "Usage limit",
          type: "number",
          hint: "0 = unlimited",
        },
        { key: "validFrom", label: "Valid from", type: "date" },
        { key: "validTill", label: "Valid till", type: "date" },
        { key: "description", label: "Description", span: 2 },
        {
          key: "isActive",
          label: "Active",
          type: "checkbox",
          default: true,
          hint: "Coupon can be used",
        },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ announcements */
export function AnnouncementsPage() {
  return (
    <ResourcePage<any>
      title="Announcements"
      noun="announcement"
      permission="Announcements"
      api={gym.announcements}
      queryKey="announcements"
      stats={(rows, total) => (
        <StatGrid cols={3}>
          <StatCard
            label="Announcements"
            value={total}
            icon={Megaphone}
            color="#024BAB"
          />
          <StatCard
            label="Pinned"
            value={rows.filter((r) => r.pinned).length}
            icon={Tag}
            color="#FA731C"
          />
          <StatCard
            label="Live now"
            value={
              rows.filter(
                (r) =>
                  new Date(r.publishAt) <= new Date() &&
                  (!r.expiresAt || new Date(r.expiresAt) > new Date()),
              ).length
            }
            icon={CalendarCheck}
            color="#00C48C"
          />
        </StatGrid>
      )}
      columns={[
        {
          label: "Title",
          render: (r) => (
            <div>
              <p className="font-black">
                {r.pinned && "📌 "}
                {r.title}
              </p>
              <p className="text-xs text-black/60 line-clamp-1">{r.body}</p>
            </div>
          ),
        },
        {
          label: "Type",
          render: (r) => <Pill value={r.kind} className="nb-tag-white" />,
        },
        {
          label: "Audience",
          render: (r) => (
            <span className="capitalize text-xs font-bold">
              {titleCase(r.audience)}
            </span>
          ),
        },
        { label: "Publish", render: (r) => fmtDate(r.publishAt) },
        { label: "Expires", render: (r) => fmtDate(r.expiresAt) },
      ]}
      fields={[
        { key: "title", label: "Title", required: true, span: 2 },
        {
          key: "kind",
          label: "Type",
          type: "select",
          options: ["notice", "holiday", "offer", "event", "maintenance"],
          default: "notice",
        },
        {
          key: "audience",
          label: "Audience",
          type: "select",
          options: ["all", "active_members", "expiring", "staff"],
          default: "all",
        },
        {
          key: "publishAt",
          label: "Publish on",
          type: "date",
          default: todayStr(),
        },
        { key: "expiresAt", label: "Expires on", type: "date" },
        { key: "body", label: "Message", type: "textarea", span: 2 },
        {
          key: "pinned",
          label: "Pin to top",
          type: "checkbox",
          hint: "Show first",
        },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ equipment */
export function EquipmentPage() {
  const notify = useNotify();
  const qc = useQueryClient();
  const [svc, setSvc] = useState<any | null>(null);
  const [note, setNote] = useState("");
  const [cost, setCost] = useState("");
  const due = (r: any) =>
    r.nextServiceOn &&
    new Date(r.nextServiceOn).getTime() - Date.now() < 7 * 86400000 &&
    r.status !== "retired";
  return (
    <ResourcePage<any>
      title="Equipment & Maintenance"
      noun="equipment"
      permission="Equipment"
      api={gym.equipment}
      queryKey="equipment"
      filters={[
        {
          key: "status",
          label: "statuses",
          options: ["working", "under_maintenance", "out_of_order", "retired"],
        },
        {
          key: "category",
          label: "categories",
          options: [
            "cardio",
            "strength",
            "free_weights",
            "functional",
            "accessory",
            "other",
          ],
        },
      ]}
      stats={(rows, total) => (
        <StatGrid>
          <StatCard
            label="Equipment"
            value={total}
            icon={Boxes}
            color="#024BAB"
          />
          <StatCard
            label="Working"
            value={rows.filter((r) => r.status === "working").length}
            icon={CalendarCheck}
            color="#00C48C"
          />
          <StatCard
            label="Out of order"
            value={
              rows.filter((r) =>
                ["out_of_order", "under_maintenance"].includes(r.status),
              ).length
            }
            icon={Wrench}
            color="#EF4444"
          />
          <StatCard
            label="Service due ≤ 7d"
            value={rows.filter(due).length}
            icon={AlertTriangle}
            color="#FA731C"
          />
        </StatGrid>
      )}
      columns={[
        {
          label: "Code",
          render: (r) => <span className="text-xs font-bold">{r.code || "—"}</span>,
        },
        {
          label: "Equipment",
          render: (r) => (
            <Thumb
              photo={r.photo}
              name={r.name}
              sub={[r.brand, r.serialNo].filter(Boolean).join(" · ")}
            />
          ),
        },
        {
          label: "Category",
          render: (r) => (
            <span className="capitalize text-xs font-bold">
              {titleCase(r.category)}
            </span>
          ),
        },
        { label: "Status", render: (r) => <Pill value={r.status} /> },
        { label: "Vendor", render: (r) => r.vendor || "—" },
        {
          label: "Price",
          render: (r) =>
            r.purchaseCost ? <span className="font-bold">{inr(r.purchaseCost)}</span> : "—",
        },
        { label: "Last service", render: (r) => fmtDate(r.lastServiceOn) },
        {
          label: "Next service",
          render: (r) => (
            <span className={due(r) ? "font-bold text-red-600" : ""}>
              {fmtDate(r.nextServiceOn)}
            </span>
          ),
        },
        { label: "Warranty", render: (r) => fmtDate(r.warrantyTill) },
      ]}
      fields={[
        { key: "photo", label: "Photo", type: "photo" },
        { key: "name", label: "Name", required: true },
        { key: "vendor", label: "Vendor (bought from)" },
        {
          key: "category",
          label: "Category",
          type: "select",
          options: [
            "cardio",
            "strength",
            "free_weights",
            "functional",
            "accessory",
            "other",
          ],
          default: "strength",
        },
        { key: "brand", label: "Brand" },
        { key: "serialNo", label: "Serial no." },
        { key: "purchasedOn", label: "Purchased on", type: "date" },
        { key: "purchaseCost", label: "Purchase cost (₹)", type: "number" },
        { key: "warrantyTill", label: "Warranty till", type: "date" },
        {
          key: "serviceEveryDays",
          label: "Service every (days)",
          type: "number",
          default: 90,
        },
        { key: "nextServiceOn", label: "Next service on", type: "date" },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: ["working", "under_maintenance", "out_of_order", "retired"],
          default: "working",
        },
      ]}
      rowActions={(r) => (
        <ActionButton
          label="Log service"
          icon={Wrench}
          onClick={() => {
            setSvc(r);
            setNote("");
            setCost("");
          }}
        />
      )}
      after={
        <Modal
          open={!!svc}
          title={`Service — ${svc?.name || ""}`}
          onClose={() => setSvc(null)}
          footer={
            <>
              <Btn light onClick={() => setSvc(null)}>
                Cancel
              </Btn>
              <Btn
                onClick={async () => {
                  try {
                    await gym.equipment.service(svc._id, {
                      note,
                      cost: Number(cost) || 0,
                    });
                    notify.success("Service logged");
                    setSvc(null);
                    qc.invalidateQueries({ queryKey: ["equipment"] });
                  } catch (e: any) {
                    notify.error("Failed", e.message);
                  }
                }}
              >
                Save
              </Btn>
            </>
          }
        >
          <TextArea
            label="What was done"
            value={note}
            onChange={(e: any) => setNote(e.target.value)}
            rows={3}
          />
          <TextInput
            label="Cost (₹)"
            type="number"
            value={cost}
            onChange={(e: any) => setCost(e.target.value)}
          />
          <div className="text-xs space-y-1">
            {(svc?.serviceLog || [])
              .slice(-4)
              .reverse()
              .map((l: any, i: number) => (
                <p key={i} className="border-l-4 border-[#024BAB] pl-2">
                  <b>{fmtDate(l.on)}</b> — {l.note || "service"}{" "}
                  {l.cost ? `(${inr(l.cost)})` : ""}
                </p>
              ))}
          </div>
        </Modal>
      }
    />
  );
}
