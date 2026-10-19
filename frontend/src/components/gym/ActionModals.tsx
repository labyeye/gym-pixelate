import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { gym } from "@/services/gymApi";
import { useNotify } from "@/components/ui/Notification";
import {
  Btn,
  Modal,
  SelectInput,
  TextArea,
  TextInput,
  inr,
  fmtDate,
} from "./kit";
import { MemberPicker } from "./pickers";

const METHODS = ["cash", "upi", "card", "online", "bank_transfer", "cheque"];

/** Collect (part) payment on an invoice, or refund against it. */
export function PaymentModal({
  invoice,
  mode = "pay",
  onClose,
}: {
  invoice: any | null;
  mode?: "pay" | "refund";
  onClose: () => void;
}) {
  const notify = useNotify();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(() =>
    crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
  );
  const balance = invoice
    ? Math.max(0, invoice.totalAmount - invoice.paidAmount)
    : 0;

  useEffect(() => {
    if (invoice) {
      setAmount(mode === "pay" ? String(Math.round(balance * 100) / 100) : "");
      setReference("");
      setNote("");
      setMethod("cash");
    }
  }, [invoice, mode]);

  const submit = async () => {
    try {
      setBusy(true);
      if (mode === "pay")
        await gym.invoices.pay(invoice._id, {
          amount: Number(amount),
          method,
          reference: reference || undefined,
          note: note || undefined,
          idempotencyKey: key,
        });
      else
        await gym.invoices.refund(invoice._id, {
          amount: Number(amount),
          method,
          reference: reference || undefined,
          note: note || undefined,
        });
      notify.success(
        mode === "pay" ? "Payment recorded" : "Refund recorded",
        `${inr(Number(amount))} · ${invoice.invoiceNumber}`,
      );
      qc.invalidateQueries();
      onClose();
    } catch (e: any) {
      notify.error("Failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!invoice}
      title={mode === "pay" ? "Collect payment" : "Refund"}
      subtitle={invoice?.invoiceNumber}
      onClose={onClose}
      footer={
        <>
          <Btn light onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            color={mode === "pay" ? "#00A070" : "#EF4444"}
            busy={busy}
            onClick={submit}
            disabled={!(Number(amount) > 0)}
          >
            {mode === "pay" ? "Record payment" : "Refund"}
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Total", invoice?.totalAmount],
          ["Paid", invoice?.paidAmount],
          ["Balance", balance],
        ].map(([l, v]: any) => (
          <div key={l} className="border-2 border-black p-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-black/50">
              {l}
            </p>
            <p className="font-black">{inr(v, 2)}</p>
          </div>
        ))}
      </div>
      <TextInput
        label={mode === "pay" ? "Amount (₹)" : "Refund amount (₹)"}
        type="number"
        min={0}
        step="0.01"
        value={amount}
        onChange={(e: any) => setAmount(e.target.value)}
        hint={
          mode === "pay"
            ? `Up to ${inr(balance, 2)}`
            : `Up to ${inr(invoice?.paidAmount, 2)} collected`
        }
      />
      <SelectInput
        label="Method"
        options={METHODS}
        value={method}
        onChange={setMethod}
      />
      <TextInput
        label="Reference / txn id"
        value={reference}
        onChange={(e: any) => setReference(e.target.value)}
      />
      <TextInput
        label="Note"
        value={note}
        onChange={(e: any) => setNote(e.target.value)}
      />
    </Modal>
  );
}

export type MsAction = "freeze" | "cancel" | "transfer";

/** Freeze / cancel(+refund) / transfer a membership. */
export function MembershipActionModal({
  membership,
  action,
  onClose,
}: {
  membership: any | null;
  action: MsAction | null;
  onClose: () => void;
}) {
  const notify = useNotify();
  const qc = useQueryClient();
  const [days, setDays] = useState("7");
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState("");
  const [to, setTo] = useState<any>(null);
  const [fee, setFee] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setDays("7");
    setReason("");
    setRefund("");
    setTo(null);
    setFee("");
  }, [membership, action]);

  const submit = async () => {
    try {
      setBusy(true);
      if (action === "freeze")
        await gym.memberships.freeze(membership._id, {
          days: Number(days),
          reason,
        });
      if (action === "cancel")
        await gym.memberships.cancel(membership._id, {
          reason,
          refundAmount: Number(refund) || 0,
        });
      if (action === "transfer")
        await gym.memberships.transfer(membership._id, {
          toMemberId: to._id,
          fee: Number(fee) || 0,
          payNow: Math.round((Number(fee) || 0) * 1.18 * 100) / 100,
        });
      notify.success(
        action === "freeze"
          ? "Membership frozen"
          : action === "cancel"
            ? "Membership cancelled"
            : "Membership transferred",
      );
      qc.invalidateQueries();
      onClose();
    } catch (e: any) {
      notify.error("Failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  const title =
    action === "freeze"
      ? "Freeze membership"
      : action === "cancel"
        ? "Cancel membership"
        : "Transfer membership";
  return (
    <Modal
      open={!!membership && !!action}
      title={title}
      subtitle={
        membership
          ? `${membership.planName} · till ${fmtDate(membership.endDate)}`
          : undefined
      }
      onClose={onClose}
      footer={
        <>
          <Btn light onClick={onClose}>
            Back
          </Btn>
          <Btn
            color={action === "cancel" ? "#EF4444" : "#024BAB"}
            busy={busy}
            onClick={submit}
            disabled={action === "transfer" && !to}
          >
            {title}
          </Btn>
        </>
      }
    >
      {action === "freeze" && (
        <>
          <TextInput
            label="Days to freeze"
            type="number"
            min={1}
            value={days}
            onChange={(e: any) => setDays(e.target.value)}
            hint="End date moves forward by the same number of days. Unfreezing early gives unused days back."
          />
          <TextArea
            label="Reason"
            value={reason}
            onChange={(e: any) => setReason(e.target.value)}
            placeholder="Travel, injury, exams…"
          />
        </>
      )}
      {action === "cancel" && (
        <>
          <p className="text-sm font-bold border-2 border-black bg-red-50 p-3">
            Cancelling stops access immediately. Paid so far:{" "}
            {inr(membership?.paidAmount, 2)}.
          </p>
          <TextInput
            label="Refund now (₹)"
            type="number"
            min={0}
            value={refund}
            onChange={(e: any) => setRefund(e.target.value)}
            hint="Leave blank for no refund. Recorded in the invoice ledger."
          />
          <TextArea
            label="Reason"
            value={reason}
            onChange={(e: any) => setReason(e.target.value)}
          />
        </>
      )}
      {action === "transfer" && (
        <>
          <p className="text-sm font-bold">
            The remaining days move to another member; this membership is
            closed.
          </p>
          <MemberPicker
            label="Transfer to"
            value={to}
            onChange={setTo}
            required
          />
          <TextInput
            label="Transfer fee (₹, 18% GST added; collected now)"
            type="number"
            min={0}
            value={fee}
            onChange={(e: any) => setFee(e.target.value)}
          />
        </>
      )}
    </Modal>
  );
}
