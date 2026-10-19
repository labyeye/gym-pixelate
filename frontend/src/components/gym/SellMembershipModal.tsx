import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { gym } from "@/services/gymApi";
import { useNotify } from "@/components/ui/Notification";
import {
  Btn,
  Modal,
  SelectInput,
  TextInput,
  fmtDate,
  idOf,
  inr,
  titleCase,
} from "./kit";
import { MemberPicker, usePlans } from "./pickers";
import { printInvoice } from "./printInvoice";

const METHODS = ["cash", "upi", "card", "online", "bank_transfer", "cheque"];
const r2 = (n: number) => Math.round(n * 100) / 100;

interface Props {
  open: boolean;
  onClose: () => void;
  /** pre-selected member (sell from a member row) */
  member?: any;
  /** renew / upgrade an existing membership */
  membership?: any;
  mode?: "sell" | "renew" | "upgrade";
}

export function SellMembershipModal({
  open,
  onClose,
  member: m0,
  membership,
  mode = "sell",
}: Props) {
  const notify = useNotify();
  const qc = useQueryClient();
  const plans = usePlans(true);
  const [member, setMember] = useState<any>(null);
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [coupon, setCoupon] = useState("");
  const [discount, setDiscount] = useState("");
  const [admission, setAdmission] = useState<"auto" | "yes" | "no">("auto");
  const [pay, setPay] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [key] = useState(() =>
    crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
  );

  useEffect(() => {
    if (!open) return;
    setMember(
      m0 ||
        (membership?.memberId && typeof membership.memberId === "object"
          ? membership.memberId
          : null),
    );
    setPlanId(mode === "renew" ? idOf(membership?.planId) : "");
    setStartDate("");
    setCoupon("");
    setDiscount("");
    setAdmission("auto");
    setPay("");
    setMethod("cash");
    setReference("");
    setDueDate("");
    setDone(null);
  }, [open, m0, membership, mode]);

  const plan = plans.find((p) => p._id === planId);
  const calc = useMemo(() => {
    if (!plan) return null;
    const g = plan.gstPercent || 0;
    const unit = plan.priceIncludesGst
      ? plan.price / (1 + g / 100)
      : plan.price;
    const adm =
      admission === "yes" ||
      (admission === "auto" &&
        mode === "sell" &&
        !m0?.currentMembership &&
        !member?.currentMembership);
    const admFee =
      adm && plan.admissionFee
        ? plan.priceIncludesGst
          ? plan.admissionFee / (1 + g / 100)
          : plan.admissionFee
        : 0;
    const sub = r2(unit + admFee);
    const disc = Math.min(sub, Math.max(0, Number(discount) || 0));
    const gst = r2((sub - disc) * (g / 100));
    return {
      sub,
      disc,
      gst,
      total: r2(sub - disc + gst),
      adm: admFee > 0,
      admFee: r2(admFee),
    };
  }, [plan, discount, admission, member, m0, mode]);

  const payNow = pay === "" ? (calc?.total ?? 0) : Number(pay);
  const balance = calc ? Math.max(0, r2(calc.total - payNow)) : 0;
  const title =
    mode === "renew"
      ? "Renew membership"
      : mode === "upgrade"
        ? "Upgrade membership"
        : "Sell membership";

  const submit = async () => {
    if (!member && mode === "sell") return notify.error("Pick a member");
    if (!plan) return notify.error("Pick a plan");
    const body: any = {
      planId,
      startDate: startDate || undefined,
      couponCode: coupon || undefined,
      discount: Number(discount) || 0,
      payNow: coupon ? Math.min(payNow, calc!.total) : payNow,
      method,
      reference: reference || undefined,
      dueDate: balance > 0 && dueDate ? dueDate : undefined,
      idempotencyKey: key,
    };
    if (admission !== "auto") body.includeAdmission = admission === "yes";
    try {
      setBusy(true);
      const res =
        mode === "renew"
          ? await gym.memberships.renew(membership._id, body)
          : mode === "upgrade"
            ? await gym.memberships.upgrade(membership._id, body)
            : await gym.memberships.create({ ...body, memberId: member._id });
      setDone(res);
      notify.success(
        "Done",
        `${res.invoice?.invoiceNumber} · ${inr(res.invoice?.totalAmount)}`,
      );
      qc.invalidateQueries();
    } catch (e: any) {
      notify.error("Could not complete", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      subtitle={
        member
          ? `${member.name} · ${member.memberCode || member.phone}`
          : undefined
      }
      onClose={onClose}
      footer={
        done ? (
          <>
            <Btn light onClick={() => printInvoice(done.invoice, member)}>
              <Printer className="w-4 h-4" /> Print invoice
            </Btn>
            <Btn onClick={onClose}>Close</Btn>
          </>
        ) : (
          <>
            <Btn light onClick={onClose}>
              Cancel
            </Btn>
            <Btn busy={busy} onClick={submit} disabled={!plan}>
              {mode === "upgrade" ? "Upgrade & bill" : "Confirm & bill"}
            </Btn>
          </>
        )
      }
    >
      {done ? (
        <div className="space-y-3 text-sm">
          <div className="border-2 border-black bg-[#00C48C]/20 p-4">
            <p className="text-xs font-black uppercase tracking-widest">
              Invoice
            </p>
            <p className="text-2xl font-black">{done.invoice?.invoiceNumber}</p>
            <p className="font-bold">
              {done.data?.planName} · {fmtDate(done.data?.startDate)} →{" "}
              {fmtDate(done.data?.endDate)}
            </p>
          </div>
          <p className="flex justify-between font-bold">
            <span>Total</span>
            <span>{inr(done.invoice?.totalAmount, 2)}</span>
          </p>
          <p className="flex justify-between font-bold">
            <span>Paid</span>
            <span>{inr(done.invoice?.paidAmount, 2)}</span>
          </p>
          {done.invoice?.totalAmount - done.invoice?.paidAmount > 0.005 && (
            <p className="flex justify-between font-black text-red-600">
              <span>Balance due</span>
              <span>
                {inr(done.invoice.totalAmount - done.invoice.paidAmount, 2)}
              </span>
            </p>
          )}
          {done.credit > 0 && (
            <p className="text-xs font-bold text-black/60">
              Includes {inr(done.credit)} credit for unused days of the old
              plan.
            </p>
          )}
          {done.data?.status === "upcoming" && (
            <p className="text-xs font-bold text-[#024BAB]">
              Starts after the current membership ends.
            </p>
          )}
        </div>
      ) : (
        <>
          {mode === "sell" && !m0 && (
            <MemberPicker value={member} onChange={setMember} required />
          )}
          <SelectInput
            label="Plan"
            required
            value={planId}
            onChange={setPlanId}
            placeholder="Choose a plan"
            options={plans.map((p) => ({
              value: p._id,
              label: `${p.name} — ${inr(p.price)} / ${p.durationDays} days`,
            }))}
          />
          {plan && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextInput
                label="Start date"
                type="date"
                value={startDate}
                onChange={(e: any) => setStartDate(e.target.value)}
                hint="Blank = today (or right after the running plan)"
              />
              <SelectInput
                label="Admission fee"
                value={admission}
                onChange={setAdmission}
                options={[
                  {
                    value: "auto",
                    label: plan.admissionFee
                      ? `Auto (${inr(plan.admissionFee)} for new members)`
                      : "None on this plan",
                  },
                  { value: "yes", label: "Charge" },
                  { value: "no", label: "Waive" },
                ]}
              />
              <TextInput
                label="Coupon code"
                value={coupon}
                onChange={(e: any) => setCoupon(e.target.value.toUpperCase())}
                hint="Discount is applied when billed"
              />
              <TextInput
                label="Extra discount (₹)"
                type="number"
                min={0}
                value={discount}
                onChange={(e: any) => setDiscount(e.target.value)}
              />
            </div>
          )}
          {calc && (
            <div className="border-2 border-black bg-[#024BAB]/5 p-3 text-sm space-y-1">
              <p className="flex justify-between font-bold">
                <span>{plan.name}</span>
                <span>
                  {inr(
                    plan.priceIncludesGst
                      ? plan.price / (1 + plan.gstPercent / 100)
                      : plan.price,
                    2,
                  )}
                </span>
              </p>
              {calc.adm && (
                <p className="flex justify-between font-bold">
                  <span>Admission fee</span>
                  <span>{inr(calc.admFee, 2)}</span>
                </p>
              )}
              {calc.disc > 0 && (
                <p className="flex justify-between font-bold text-[#00A070]">
                  <span>Discount</span>
                  <span>− {inr(calc.disc, 2)}</span>
                </p>
              )}
              <p className="flex justify-between font-bold">
                <span>GST ({plan.gstPercent}%)</span>
                <span>{inr(calc.gst, 2)}</span>
              </p>
              <p className="flex justify-between font-black text-base border-t-2 border-black pt-1">
                <span>Total{coupon ? " (before coupon)" : ""}</span>
                <span>{inr(calc.total, 2)}</span>
              </p>
            </div>
          )}
          {calc && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextInput
                label="Collect now (₹)"
                type="number"
                min={0}
                value={pay}
                placeholder={String(calc.total)}
                onChange={(e: any) => setPay(e.target.value)}
                hint={
                  balance > 0
                    ? `Balance ${inr(balance, 2)} stays as dues`
                    : "Paid in full"
                }
              />
              <SelectInput
                label="Payment method"
                value={method}
                onChange={setMethod}
                options={METHODS}
              />
              <TextInput
                label="Reference / txn id"
                value={reference}
                onChange={(e: any) => setReference(e.target.value)}
                placeholder="UPI ref, cheque no…"
              />
              {balance > 0 && (
                <TextInput
                  label="Balance due by"
                  type="date"
                  value={dueDate}
                  onChange={(e: any) => setDueDate(e.target.value)}
                  hint="Entry is blocked after this date until paid"
                />
              )}
            </div>
          )}
          <p className="text-[11px] font-bold text-black/40 uppercase">
            {titleCase(mode)} · invoice numbers and payments are recorded
            automatically
          </p>
        </>
      )}
    </Modal>
  );
}
