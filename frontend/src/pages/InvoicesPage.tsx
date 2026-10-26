import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CreditCard,
  FileText,
  IndianRupee,
  MessageCircle,
  Plus,
  Printer,
  Send,
  Trash2,
  Undo2,
  Wallet,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { gym } from "@/services/gymApi";
import { useNotify } from "@/components/ui/Notification";
import { usePermission } from "@/hooks/usePermission";
import {
  ActionButton,
  Btn,
  DataTable,
  Modal,
  Pager,
  Pill,
  RowActions,
  SearchBox,
  SelectInput,
  StatCard,
  StatGrid,
  Td,
  Thumb,
  TextInput,
  Toolbar,
  Tr,
  fmtDate,
  inputCls,
  inr,
} from "@/components/gym/kit";
import { ExportImport } from "@/components/gym/ExportImport";
import { MemberPicker } from "@/components/gym/pickers";
import { PaymentModal } from "@/components/gym/ActionModals";
import { printInvoice } from "@/components/gym/printInvoice";
import { waDigits } from "@/lib/countries";

const STATUSES = ["paid", "partial", "pending", "refunded", "cancelled"];
const TYPES: Record<string, [string, string]> = {
  membership: ["Membership", "bg-blue-100 text-blue-800"],
  product: ["Product sale", "bg-orange-100 text-orange-800"],
  pt: ["PT package", "bg-purple-100 text-purple-800"],
  other: ["Other", "bg-gray-100 text-gray-800"],
};
const METHODS = ["cash", "upi", "card", "online", "bank_transfer", "cheque"];
const newLine = () => ({
  description: "",
  quantity: "1",
  unitPrice: "",
  gstPercent: "18",
});

export default function InvoicesPage() {
  const notify = useNotify();
  const qc = useQueryClient();
  const { can } = usePermission();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pay, setPay] = useState<{ inv: any; mode: "pay" | "refund" } | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [member, setMember] = useState<any>(null);
  const [lines, setLines] = useState([newLine()]);
  const [discount, setDiscount] = useState("");
  const [coupon, setCoupon] = useState("");
  const [payNow, setPayNow] = useState("");
  const [method, setMethod] = useState("cash");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState("");

  const params = useMemo(
    () => ({ page, limit: 25, search, status, type, from, to }),
    [page, search, status, type, from, to],
  );
  const { data, isLoading } = useQuery({
    queryKey: ["invoices", params],
    queryFn: () => gym.invoices.list(params),
  });
  const invoices: any[] = data?.data || [];

  const totals = useMemo(() => {
    const sub = lines.reduce(
      (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
      0,
    );
    const disc = Math.min(sub, Number(discount) || 0);
    const gst = lines.reduce(
      (s, l) =>
        s +
        (Number(l.quantity) || 0) *
          (Number(l.unitPrice) || 0) *
          (1 - (sub ? disc / sub : 0)) *
          ((Number(l.gstPercent) || 0) / 100),
      0,
    );
    return {
      sub,
      disc,
      gst: Math.round(gst * 100) / 100,
      total: Math.round((sub - disc + gst) * 100) / 100,
    };
  }, [lines, discount]);

  const reset = () => {
    setCreating(false);
    setMember(null);
    setLines([newLine()]);
    setDiscount("");
    setCoupon("");
    setPayNow("");
    setMethod("cash");
    setDueDate("");
  };
  const setLine = (i: number, k: string, v: string) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const create = async () => {
    const items = lines
      .filter((l) => l.description.trim())
      .map((l) => ({
        kind: "other",
        description: l.description.trim(),
        quantity: Number(l.quantity) || 1,
        unitPrice: Number(l.unitPrice) || 0,
        gstPercent: Number(l.gstPercent) || 0,
      }));
    if (!items.length) return notify.error("Add at least one line item");
    try {
      setSaving(true);
      const pn = payNow === "" ? totals.total : Number(payNow);
      const res = await gym.invoices.create({
        memberId: member?._id,
        items,
        discount: Number(discount) || 0,
        couponCode: coupon || undefined,
        payNow: coupon ? Math.min(pn, totals.total) : pn,
        method,
        dueDate: dueDate || undefined,
      });
      notify.success("Invoice created", res.data.invoiceNumber);
      reset();
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e: any) {
      notify.error("Could not create invoice", e.message);
    } finally {
      setSaving(false);
    }
  };

  // one sheet row = one single-line invoice; member found by Member ID (blank = walk-in)
  const importRow = async (r: Record<string, any>) => {
    let memberId: string | undefined;
    if (r["Member ID"]) {
      const code = String(r["Member ID"]).trim();
      const m = (await gym.members.list({ search: code, limit: 5 })).data.find(
        (x: any) => x.memberCode === code,
      );
      if (!m) throw new Error(`Member ${code} not found`);
      memberId = m._id;
    }
    if (!r.Description) throw new Error("Description is required");
    const qty = Number(r.Qty) || 1, rate = Number(r.Rate) || 0, gst = Number(r["GST %"] ?? 18);
    return gym.invoices.create({
      memberId,
      items: [{ kind: "other", description: r.Description, quantity: qty, unitPrice: rate, gstPercent: gst }],
      payNow: r.Paid === "" || r.Paid === undefined ? qty * rate * (1 + gst / 100) : Number(r.Paid),
      method: String(r.Method || "cash").toLowerCase(),
    });
  };

  // Staff-side: make the member's pay link and open WhatsApp with the message ready (works without the WhatsApp API).
  const sendLink = async (inv: any) => {
    try {
      const r = await gym.paymentLinks.forInvoice(inv._id);
      const phone = waDigits(r.data.phone);
      window.open(
        `https://wa.me/${phone}?text=${encodeURIComponent(r.data.message)}`,
        "_blank",
      );
    } catch (e: any) {
      notify.error("Could not create link", e.message);
    }
  };
  const sendReminders = async () => {
    try {
      const r = await gym.paymentLinks.sendNow();
      const s = r.data;
      notify.success(
        "Reminders processed",
        `${s.sent} sent · ${s.skipped} already sent this month · ${s.failed} failed · ${s.noPhone} without a valid phone`,
      );
    } catch (e: any) {
      notify.error("Could not send reminders", e.message);
    }
  };

  const voidInv = async (inv: any) => {
    if (
      !window.confirm(
        `Void ${inv.invoiceNumber}? Only unpaid invoices can be voided.`,
      )
    )
      return;
    try {
      await gym.invoices.cancel(inv._id);
      notify.success("Invoice voided");
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };

  const s = {
    todayRevenue: (data as any)?.summary?.today,
    monthlyRevenue: (data as any)?.summary?.month,
    pendingPayments: (data as any)?.summary?.dues,
    membersWithDues: (data as any)?.summary?.duesCount,
  };
  return (
    <AppLayout title="Invoices & Payments">
      <StatGrid>
        <StatCard
          label="Collected today"
          value={inr(s.todayRevenue)}
          icon={IndianRupee}
          color="#00C48C"
        />
        <StatCard
          label="Collected this month"
          value={inr(s.monthlyRevenue)}
          icon={Wallet}
          color="#024BAB"
        />
        <StatCard
          label="Outstanding dues"
          value={inr(s.pendingPayments)}
          icon={CreditCard}
          color={s.pendingPayments > 0 ? "#EF4444" : "#14B8A6"}
          sub={`${s.membersWithDues ?? 0} invoices`}
          onClick={() => setStatus("partial")}
        />
        <StatCard
          label="Invoices"
          value={data?.total ?? 0}
          icon={FileText}
          color="#A855F7"
          sub={
            data?.totalDue
              ? `${inr(data.totalDue)} due in this view`
              : undefined
          }
        />
      </StatGrid>

      <Toolbar
        right={
          <>
            <ExportImport
              name="invoices"
              fetchRows={async () =>
                (await gym.invoices.list({ ...params, page: 1, limit: 5000 })).data
              }
              cols={[
                { header: "Invoice no", value: (v: any) => v.invoiceNumber },
                { header: "Type", value: (v: any) => (TYPES[v.type] || TYPES.other)[0] },
                { header: "Member ID", value: (v: any) => v.memberId?.memberCode || "Walk-in" },
                { header: "Member", value: (v: any) => v.memberId?.name },
                { header: "Date", value: (v: any) => (v.issuedAt || "").slice(0, 10) },
                { header: "Total", value: (v: any) => v.totalAmount },
                { header: "Paid", value: (v: any) => v.paidAmount },
                { header: "Balance", value: (v: any) => v.balance },
                { header: "Status", value: (v: any) => v.status },
              ]}
              importTemplate={{
                headers: ["Member ID", "Description", "Qty", "Rate", "GST %", "Paid", "Method"],
                example: ["GYM-00001", "Day pass", 1, 200, 18, 236, "cash"],
              }}
              onImportRow={can("Invoices", "create") ? importRow : undefined}
              onImported={() => qc.invalidateQueries({ queryKey: ["invoices"] })}
            />
            {can("Invoices", "create") && (
            <>
              <Btn light onClick={sendReminders}>
                <Send className="w-4 h-4" /> Send pay-link reminders
              </Btn>
              <Btn onClick={() => setCreating(true)}>
                <Plus className="w-4 h-4" /> New invoice
              </Btn>
            </>
            )}
          </>
        }
      >
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Invoice number…"
        />
        <select
          className={inputCls + " sm:w-40 font-bold"}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          className={inputCls + " sm:w-44 font-bold"}
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All payment types</option>
          {Object.entries(TYPES).map(([k, [label]]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="date"
          className={inputCls + " sm:w-40"}
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
          aria-label="From"
        />
        <input
          type="date"
          className={inputCls + " sm:w-40"}
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
          aria-label="To"
        />
      </Toolbar>

      <DataTable
        head={[
          "Invoice no",
          "Type",
          "Gym ID",
          "Member",
          "Date",
          "Total",
          "Paid",
          "Balance",
          "Status",
          "Actions",
        ]}
        loading={isLoading}
        empty={invoices.length === 0}
      >
        {invoices.map((v, i) => (
          <Tr key={v._id} i={i}>
            <Td>
              <p className="text-xs font-bold whitespace-nowrap">{v.invoiceNumber}</p>
            </Td>
            <Td>
              <span className={"text-[10px] font-bold uppercase px-1.5 py-0.5 border border-black/10 whitespace-nowrap " + (TYPES[v.type] || TYPES.other)[1]}>
                {(TYPES[v.type] || TYPES.other)[0]}
              </span>
              {v.type === "product" && (
                <p className="text-[10px] text-black/50 mt-1 max-w-[160px] truncate">
                  {(v.items || []).filter((x: any) => x.kind === "product").map((x: any) => `${x.description} ×${x.quantity}`).join(", ")}
                </p>
              )}
            </Td>
            <Td className="text-xs font-bold whitespace-nowrap">
              {v.memberId?.memberCode || "—"}
            </Td>
            <Td>
              {v.memberId ? (
                <Thumb photo={v.memberId.photo} name={v.memberId.name} />
              ) : (
                <span className="text-xs text-black/40">Walk-in</span>
              )}
            </Td>
            <Td className="text-xs font-bold">{fmtDate(v.issuedAt)}</Td>
            <Td className="font-black">{inr(v.totalAmount, 2)}</Td>
            <Td className="font-bold">{inr(v.paidAmount, 2)}</Td>
            <Td
              className={
                v.balance > 0 ? "font-black text-red-600" : "text-black/30"
              }
            >
              {v.balance > 0 ? inr(v.balance, 2) : "—"}
              {v.dueDate && v.balance > 0 && (
                <p className="text-[10px] font-bold">
                  due {fmtDate(v.dueDate)}
                </p>
              )}
            </Td>
            <Td>
              <Pill value={v.status} />
            </Td>
            <Td>
              <RowActions>
                {["pending", "partial"].includes(v.status) &&
                  can("Invoices", "create") && (
                    <ActionButton
                      label="Collect payment"
                      icon={CreditCard}
                      tone="primary"
                      onClick={() => setPay({ inv: v, mode: "pay" })}
                    />
                  )}
                {v.paidAmount > 0 &&
                  ["paid", "partial"].includes(v.status) &&
                  can("Invoices", "delete") && (
                    <ActionButton
                      label="Refund"
                      icon={Undo2}
                      onClick={() => setPay({ inv: v, mode: "refund" })}
                    />
                  )}
                {["pending", "partial"].includes(v.status) &&
                  v.memberId &&
                  can("Invoices", "create") && (
                    <ActionButton
                      label="Send payment link on WhatsApp"
                      icon={MessageCircle}
                      onClick={() => sendLink(v)}
                    />
                  )}
                <ActionButton
                  label="Print / PDF"
                  icon={Printer}
                  onClick={() => printInvoice(v)}
                />
                {v.status === "pending" && can("Invoices", "delete") && (
                  <ActionButton
                    label="Void"
                    icon={Ban}
                    tone="danger"
                    onClick={() => voidInv(v)}
                  />
                )}
              </RowActions>
            </Td>
          </Tr>
        ))}
      </DataTable>
      <Pager page={page} pages={data?.pages || 1} onPage={setPage} />

      <PaymentModal
        invoice={pay?.inv || null}
        mode={pay?.mode}
        onClose={() => setPay(null)}
      />

      <Modal
        open={creating}
        wide
        title="New invoice"
        subtitle="Day passes, PT top-ups, merchandise, anything billable"
        onClose={reset}
        footer={
          <>
            <Btn light onClick={reset}>
              Cancel
            </Btn>
            <Btn busy={saving} onClick={create}>
              Create invoice
            </Btn>
          </>
        }
      >
        <MemberPicker
          label="Member (leave empty for walk-in)"
          value={member}
          onChange={setMember}
        />
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest">
            Items
          </p>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <input
                className={inputCls + " col-span-12 sm:col-span-5"}
                placeholder="Description"
                value={l.description}
                onChange={(e) => setLine(i, "description", e.target.value)}
              />
              <input
                className={inputCls + " col-span-3 sm:col-span-2"}
                type="number"
                min={0}
                placeholder="Qty"
                value={l.quantity}
                onChange={(e) => setLine(i, "quantity", e.target.value)}
              />
              <input
                className={inputCls + " col-span-4 sm:col-span-2"}
                type="number"
                min={0}
                placeholder="Rate ₹"
                value={l.unitPrice}
                onChange={(e) => setLine(i, "unitPrice", e.target.value)}
              />
              <input
                className={inputCls + " col-span-3 sm:col-span-2"}
                type="number"
                min={0}
                placeholder="GST %"
                value={l.gstPercent}
                onChange={(e) => setLine(i, "gstPercent", e.target.value)}
              />
              <button
                type="button"
                aria-label="Remove line"
                onClick={() =>
                  setLines((ls) =>
                    ls.length > 1 ? ls.filter((_, j) => j !== i) : ls,
                  )
                }
                className="col-span-2 sm:col-span-1 h-9 border-2 border-black bg-white hover:bg-[#EF4444] hover:text-white flex items-center justify-center"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <Btn light onClick={() => setLines((ls) => [...ls, newLine()])}>
            <Plus className="w-4 h-4" /> Add line
          </Btn>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <TextInput
            label="Discount (₹)"
            type="number"
            min={0}
            value={discount}
            onChange={(e: any) => setDiscount(e.target.value)}
          />
          <TextInput
            label="Coupon"
            value={coupon}
            onChange={(e: any) => setCoupon(e.target.value.toUpperCase())}
          />
          <TextInput
            label="Collect now (₹)"
            type="number"
            min={0}
            value={payNow}
            placeholder={String(totals.total)}
            onChange={(e: any) => setPayNow(e.target.value)}
          />
          <SelectInput
            label="Method"
            options={METHODS}
            value={method}
            onChange={setMethod}
          />
          <TextInput
            label="Balance due by"
            type="date"
            value={dueDate}
            onChange={(e: any) => setDueDate(e.target.value)}
          />
        </div>
        <div className="border-2 border-black bg-[#024BAB]/5 p-3 text-sm space-y-1">
          <p className="flex justify-between font-bold">
            <span>Subtotal</span>
            <span>{inr(totals.sub, 2)}</span>
          </p>
          {totals.disc > 0 && (
            <p className="flex justify-between font-bold text-[#00A070]">
              <span>Discount</span>
              <span>− {inr(totals.disc, 2)}</span>
            </p>
          )}
          <p className="flex justify-between font-bold">
            <span>GST</span>
            <span>{inr(totals.gst, 2)}</span>
          </p>
          <p className="flex justify-between font-black text-base border-t-2 border-black pt-1">
            <span>Total</span>
            <span>{inr(totals.total, 2)}</span>
          </p>
        </div>
      </Modal>
    </AppLayout>
  );
}
