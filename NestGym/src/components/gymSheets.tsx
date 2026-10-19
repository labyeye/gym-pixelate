// Billing sheets shared by Members, Member profile and Invoices
// (web: SellMembershipModal + ActionModals).
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { gym } from '../api/gym';
import { C, S } from '../theme';
import { fmtDate, idOf, inr, r2, titleCase } from '../utils/format';
import { MemberPicker, usePlans } from './pickers';
import { Btn, Input, Row, Select, Sheet, Totals, notify, RCard } from './ui';

export const METHODS = ['cash', 'upi', 'card', 'online', 'bank_transfer', 'cheque'];
const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/* ------------------------------------------------------------------ sell / renew / upgrade */
export function SellMembershipSheet({
  open,
  onClose,
  member: m0,
  membership,
  mode = 'sell',
}: {
  open: boolean;
  onClose: () => void;
  member?: any;
  membership?: any;
  mode?: 'sell' | 'renew' | 'upgrade';
}) {
  const plans = usePlans(true);
  const [member, setMember] = useState<any>(null);
  const [planId, setPlanId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [coupon, setCoupon] = useState('');
  const [discount, setDiscount] = useState('');
  const [admission, setAdmission] = useState('auto');
  const [pay, setPay] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [key, setKey] = useState(newKey);

  useEffect(() => {
    if (!open) return;
    setMember(m0 || (membership?.memberId && typeof membership.memberId === 'object' ? membership.memberId : null));
    setPlanId(mode === 'renew' ? idOf(membership?.planId) : '');
    setStartDate(''); setCoupon(''); setDiscount(''); setAdmission('auto'); setPay(''); setMethod('cash'); setReference(''); setDueDate(''); setDone(null);
    setKey(newKey());
  }, [open, m0, membership, mode]);

  const plan = plans.find((p: any) => p._id === planId);
  const calc = useMemo(() => {
    if (!plan) return null;
    const g = plan.gstPercent || 0;
    const unit = plan.priceIncludesGst ? plan.price / (1 + g / 100) : plan.price;
    const adm = admission === 'yes' || (admission === 'auto' && mode === 'sell' && !m0?.currentMembership && !member?.currentMembership);
    const admFee = adm && plan.admissionFee ? (plan.priceIncludesGst ? plan.admissionFee / (1 + g / 100) : plan.admissionFee) : 0;
    const sub = r2(unit + admFee);
    const disc = Math.min(sub, Math.max(0, Number(discount) || 0));
    const gst = r2((sub - disc) * (g / 100));
    return { unit, sub, disc, gst, total: r2(sub - disc + gst), adm: admFee > 0, admFee: r2(admFee) };
  }, [plan, discount, admission, member, m0, mode]);

  const payNow = pay === '' ? calc?.total ?? 0 : Number(pay);
  const balance = calc ? Math.max(0, r2(calc.total - payNow)) : 0;
  const title = mode === 'renew' ? 'Renew membership' : mode === 'upgrade' ? 'Upgrade membership' : 'Sell membership';

  const submit = async () => {
    if (!member && mode === 'sell') return notify.error('Pick a member');
    if (!plan) return notify.error('Pick a plan');
    const body: any = {
      planId, startDate: startDate || undefined, couponCode: coupon || undefined, discount: Number(discount) || 0,
      payNow: coupon ? Math.min(payNow, calc!.total) : payNow, method, reference: reference || undefined,
      dueDate: balance > 0 && dueDate ? dueDate : undefined, idempotencyKey: key,
    };
    if (admission !== 'auto') body.includeAdmission = admission === 'yes';
    try {
      setBusy(true);
      const res =
        mode === 'renew' ? await gym.memberships.renew(membership._id, body)
        : mode === 'upgrade' ? await gym.memberships.upgrade(membership._id, body)
        : await gym.memberships.create({ ...body, memberId: member._id });
      setDone(res);
      notify.success('Done', `${res.invoice?.invoiceNumber} · ${inr(res.invoice?.totalAmount)}`);
    } catch (e: any) {
      notify.error('Could not complete', e.message);
    } finally {
      setBusy(false);
    }
  };

  const left = done ? done.invoice?.totalAmount - done.invoice?.paidAmount : 0;
  return (
    <Sheet
      visible={open}
      title={title}
      subtitle={member ? `${member.name} · ${member.memberCode || member.phone}` : undefined}
      onClose={onClose}
      footer={
        done ? (
          <Btn label="Close" onPress={onClose} />
        ) : (
          <>
            <Btn light label="Cancel" onPress={onClose} />
            <Btn label={mode === 'upgrade' ? 'Upgrade & bill' : 'Confirm & bill'} busy={busy} disabled={!plan} onPress={submit} />
          </>
        )
      }
    >
      {done ? (
        <View>
          <RCard style={[S.card, { backgroundColor: '#DCFCE7' }]}>
            <Text style={S.label}>Invoice</Text>
            <Text style={S.h1}>{done.invoice?.invoiceNumber}</Text>
            <Text style={S.body}>{done.data?.planName} · {fmtDate(done.data?.startDate)} → {fmtDate(done.data?.endDate)}</Text>
          </RCard>
          <Row k="Total" v={inr(done.invoice?.totalAmount, 2)} bold />
          <Row k="Paid" v={inr(done.invoice?.paidAmount, 2)} bold />
          {left > 0.005 && <Row k="Balance due" v={inr(left, 2)} bold color={C.danger} />}
          {done.credit > 0 && <Text style={[S.small, { marginTop: 8 }]}>Includes {inr(done.credit)} credit for unused days of the old plan.</Text>}
          {done.data?.status === 'upcoming' && <Text style={[S.small, { marginTop: 8, color: C.primary }]}>Starts after the current membership ends.</Text>}
        </View>
      ) : (
        <>
          {mode === 'sell' && !m0 && <MemberPicker value={member} onChange={setMember} required />}
          <Select label="Plan" required value={planId} onChange={setPlanId} placeholder="Choose a plan" options={plans.map((p: any) => ({ value: p._id, label: `${p.name} — ${inr(p.price)} / ${p.durationDays}d` }))} />
          {plan && (
            <>
              <Input label="Start date" hint="Blank = today (or right after the running plan)" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" />
              <Select label="Admission fee" value={admission} onChange={setAdmission} options={[{ value: 'auto', label: plan.admissionFee ? `Auto (${inr(plan.admissionFee)} for new members)` : 'None on this plan' }, { value: 'yes', label: 'Charge' }, { value: 'no', label: 'Waive' }]} />
              <Input label="Coupon code" hint="Discount is applied when billed" autoCapitalize="characters" value={coupon} onChangeText={v => setCoupon(v.toUpperCase())} />
              <Input label="Extra discount (₹)" keyboardType="decimal-pad" value={discount} onChangeText={setDiscount} />
            </>
          )}
          {calc && (
            <Totals
              rows={[
                [plan.name, inr(calc.unit, 2)],
                ...(calc.adm ? [['Admission fee', inr(calc.admFee, 2)] as [string, string]] : []),
                ...(calc.disc > 0 ? [['Discount', `− ${inr(calc.disc, 2)}`, 'green'] as [string, string, 'green']] : []),
                [`GST (${plan.gstPercent}%)`, inr(calc.gst, 2)],
                [`Total${coupon ? ' (before coupon)' : ''}`, inr(calc.total, 2), 'bold'],
              ]}
            />
          )}
          {calc && (
            <>
              <Input label="Collect now (₹)" keyboardType="decimal-pad" value={pay} placeholder={String(calc.total)} onChangeText={setPay} hint={balance > 0 ? `Balance ${inr(balance, 2)} stays as dues` : 'Paid in full'} />
              <Select label="Payment method" value={method} onChange={setMethod} options={METHODS} />
              <Input label="Reference / txn id" value={reference} onChangeText={setReference} placeholder="UPI ref, cheque no…" />
              {balance > 0 && <Input label="Balance due by" hint="Entry is blocked after this date until paid" value={dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD" />}
            </>
          )}
          <Text style={[S.small, { textTransform: 'uppercase' }]}>{titleCase(mode)} · invoice numbers and payments are recorded automatically</Text>
        </>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ collect / refund */
export function PaymentSheet({
  invoice,
  mode = 'pay',
  onClose,
}: {
  invoice: any | null;
  mode?: 'pay' | 'refund';
  onClose: (changed?: boolean) => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(newKey);
  const balance = invoice ? Math.max(0, invoice.totalAmount - invoice.paidAmount) : 0;

  useEffect(() => {
    if (invoice) {
      setAmount(mode === 'pay' ? String(r2(balance)) : '');
      setReference(''); setNote(''); setMethod('cash'); setKey(newKey());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, mode]);

  const submit = async () => {
    try {
      setBusy(true);
      const b = { amount: Number(amount), method, reference: reference || undefined, note: note || undefined };
      if (mode === 'pay') await gym.invoices.pay(invoice._id, { ...b, idempotencyKey: key });
      else await gym.invoices.refund(invoice._id, b);
      notify.success(mode === 'pay' ? 'Payment recorded' : 'Refund recorded', `${inr(Number(amount))} · ${invoice.invoiceNumber}`);
      onClose(true);
    } catch (e: any) {
      notify.error('Failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={!!invoice}
      title={mode === 'pay' ? 'Collect payment' : 'Refund'}
      subtitle={invoice?.invoiceNumber}
      onClose={() => onClose()}
      footer={
        <>
          <Btn light label="Cancel" onPress={() => onClose()} />
          <Btn color={mode === 'pay' ? '#00A070' : C.danger} label={mode === 'pay' ? 'Record payment' : 'Refund'} busy={busy} disabled={!(Number(amount) > 0)} onPress={submit} />
        </>
      }
    >
      <Totals rows={[['Total', inr(invoice?.totalAmount, 2)], ['Paid', inr(invoice?.paidAmount, 2)], ['Balance', inr(balance, 2), 'bold']]} />
      <Input label={mode === 'pay' ? 'Amount (₹)' : 'Refund amount (₹)'} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} hint={mode === 'pay' ? `Up to ${inr(balance, 2)}` : `Up to ${inr(invoice?.paidAmount, 2)} collected`} />
      <Select label="Method" options={METHODS} value={method} onChange={setMethod} />
      <Input label="Reference / txn id" value={reference} onChangeText={setReference} />
      <Input label="Note" value={note} onChangeText={setNote} />
    </Sheet>
  );
}

/* ------------------------------------------------------------------ freeze / cancel / transfer */
export type MsAction = 'freeze' | 'cancel' | 'transfer';
export function MembershipActionSheet({
  membership,
  action,
  onClose,
}: {
  membership: any | null;
  action: MsAction | null;
  onClose: (changed?: boolean) => void;
}) {
  const [days, setDays] = useState('7');
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState('');
  const [to, setTo] = useState<any>(null);
  const [fee, setFee] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setDays('7'); setReason(''); setRefund(''); setTo(null); setFee('');
  }, [membership, action]);

  const submit = async () => {
    try {
      setBusy(true);
      if (action === 'freeze') await gym.memberships.freeze(membership._id, { days: Number(days), reason });
      if (action === 'cancel') await gym.memberships.cancel(membership._id, { reason, refundAmount: Number(refund) || 0 });
      if (action === 'transfer') await gym.memberships.transfer(membership._id, { toMemberId: to._id, fee: Number(fee) || 0, payNow: r2((Number(fee) || 0) * 1.18) });
      notify.success(action === 'freeze' ? 'Membership frozen' : action === 'cancel' ? 'Membership cancelled' : 'Membership transferred');
      onClose(true);
    } catch (e: any) {
      notify.error('Failed', e.message);
    } finally {
      setBusy(false);
    }
  };
  const title = action === 'freeze' ? 'Freeze membership' : action === 'cancel' ? 'Cancel membership' : 'Transfer membership';
  return (
    <Sheet
      visible={!!membership && !!action}
      title={title}
      subtitle={membership ? `${membership.planName} · till ${fmtDate(membership.endDate)}` : undefined}
      onClose={() => onClose()}
      footer={
        <>
          <Btn light label="Back" onPress={() => onClose()} />
          <Btn danger={action === 'cancel'} label={title} busy={busy} disabled={action === 'transfer' && !to} onPress={submit} />
        </>
      }
    >
      {action === 'freeze' && (
        <>
          <Input label="Days to freeze" keyboardType="number-pad" value={days} onChangeText={setDays} hint="End date moves forward by the same number of days. Unfreezing early gives unused days back." />
          <Input label="Reason" value={reason} onChangeText={setReason} placeholder="Travel, injury, exams…" multiline />
        </>
      )}
      {action === 'cancel' && (
        <>
          <Text style={[S.body, { marginBottom: 12 }]}>Cancelling stops access immediately. Paid so far: {inr(membership?.paidAmount, 2)}.</Text>
          <Input label="Refund now (₹)" keyboardType="decimal-pad" value={refund} onChangeText={setRefund} hint="Leave blank for no refund. Recorded in the invoice ledger." />
          <Input label="Reason" value={reason} onChangeText={setReason} multiline />
        </>
      )}
      {action === 'transfer' && (
        <>
          <MemberPicker label="Transfer to" value={to} onChange={setTo} required />
          <Input label="Transfer fee (₹, before GST)" keyboardType="decimal-pad" value={fee} onChangeText={setFee} hint="Blank = free transfer" />
        </>
      )}
    </Sheet>
  );
}
