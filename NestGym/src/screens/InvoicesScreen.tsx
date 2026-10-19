import React, { useMemo, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';
import { gym } from '../api/gym';
import { useAuth, isManager } from '../contexts/AuthContext';
import { useDebounced, useFetch } from '../hooks/useFetch';
import { C, S } from '../theme';
import { fmtDate, inr, r2 } from '../utils/format';
import { waDigits } from '../utils/countries';
import { MemberPicker } from '../components/pickers';
import { METHODS, PaymentSheet } from '../components/gymSheets';
import { Btn, Empty, Input, Loader, Pager, Pill, Row, Screen, SearchBox, Select, Sheet, StatCard, StatGrid, Tabs, Totals, notify, RCard } from '../components/ui';

const STATUSES = ['paid', 'partial', 'pending', 'refunded', 'cancelled'];
const newLine = () => ({ description: '', quantity: '1', unitPrice: '', gstPercent: '18' });

export default function InvoicesScreen() {
  const { user } = useAuth();
  const owner = user?.role === 'gym_owner';
  const canCreate = owner || isManager(user);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const dsearch = useDebounced(search);
  const [status, setStatus] = useState('');
  const [pay, setPay] = useState<{ inv: any; mode: 'pay' | 'refund' } | null>(null);
  const [creating, setCreating] = useState(false);
  const [member, setMember] = useState<any>(null);
  const [lines, setLines] = useState([newLine()]);
  const [discount, setDiscount] = useState('');
  const [coupon, setCoupon] = useState('');
  const [payNow, setPayNow] = useState('');
  const [method, setMethod] = useState('cash');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const params = useMemo(() => ({ page, limit: 25, search: dsearch, status }), [page, dsearch, status]);
  const { data, loading, reload } = useFetch(() => gym.invoices.list(params), [params]);
  const summary = useFetch(() => gym.dashboard.summary(), []);
  const invoices: any[] = data?.data || [];
  const s = summary.data?.data || {};

  const totals = useMemo(() => {
    const sub = lines.reduce((a, l) => a + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
    const disc = Math.min(sub, Number(discount) || 0);
    const gst = lines.reduce((a, l) => a + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * (1 - (sub ? disc / sub : 0)) * ((Number(l.gstPercent) || 0) / 100), 0);
    return { sub, disc, gst: r2(gst), total: r2(sub - disc + gst) };
  }, [lines, discount]);

  const reset = () => {
    setCreating(false); setMember(null); setLines([newLine()]); setDiscount(''); setCoupon(''); setPayNow(''); setMethod('cash'); setDueDate('');
  };
  const setLine = (i: number, k: string, v: string) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const create = async () => {
    const items = lines.filter(l => l.description.trim()).map(l => ({ kind: 'other', description: l.description.trim(), quantity: Number(l.quantity) || 1, unitPrice: Number(l.unitPrice) || 0, gstPercent: Number(l.gstPercent) || 0 }));
    if (!items.length) return notify.error('Add at least one line item');
    try {
      setSaving(true);
      const pn = payNow === '' ? totals.total : Number(payNow);
      const res = await gym.invoices.create({ memberId: member?._id, items, discount: Number(discount) || 0, couponCode: coupon || undefined, payNow: coupon ? Math.min(pn, totals.total) : pn, method, dueDate: dueDate || undefined });
      notify.success('Invoice created', res.data.invoiceNumber);
      reset();
      reload();
    } catch (e: any) {
      notify.error('Could not create invoice', e.message);
    } finally {
      setSaving(false);
    }
  };

  // Make the member's pay link and open WhatsApp with the message ready (works without the WhatsApp API).
  const sendLink = async (inv: any) => {
    try {
      const r = await gym.paymentLinks.forInvoice(inv._id);
      await Linking.openURL(`https://wa.me/${waDigits(r.data.phone)}?text=${encodeURIComponent(r.data.message)}`);
    } catch (e: any) {
      notify.error('Could not create link', e.message);
    }
  };
  const sendReminders = async () => {
    try {
      const s = (await gym.paymentLinks.sendNow()).data;
      notify.success('Reminders processed', `${s.sent} sent · ${s.skipped} already sent · ${s.failed} failed · ${s.noPhone} no phone`);
    } catch (e: any) {
      notify.error('Could not send reminders', e.message);
    }
  };

  const voidInv = (inv: any) =>
    Alert.alert(`Void ${inv.invoiceNumber}?`, 'Only unpaid invoices can be voided.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Void', style: 'destructive', onPress: async () => { try { await gym.invoices.cancel(inv._id); notify.success('Invoice voided'); reload(); } catch (e: any) { notify.error('Failed', e.message); } } },
    ]);

  return (
    <Screen
      title="Invoices"
      refreshing={loading && !!data}
      onRefresh={() => { reload(); summary.reload(); }}
      right={canCreate ? <View style={{ flexDirection: 'row', gap: 8 }}><Btn small light label="Remind" onPress={sendReminders} /><Btn small label="New" icon={<Plus size={14} color="#fff" />} onPress={() => setCreating(true)} /></View> : undefined}
    >
      <StatGrid>
        <StatCard label="Collected today" value={inr(s.todayRevenue)} color="#00C48C" />
        <StatCard label="Collected this month" value={inr(s.monthlyRevenue)} color="#024BAB" />
        <StatCard label="Outstanding dues" value={inr(s.pendingPayments)} sub={`${s.membersWithDues ?? 0} members`} color={s.pendingPayments > 0 ? '#EF4444' : '#14B8A6'} onPress={() => setStatus('partial')} />
        <StatCard label="Invoices" value={data?.total ?? 0} color="#A855F7" />
      </StatGrid>
      <SearchBox value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Invoice number…" />
      <Tabs value={status} onChange={v => { setStatus(v); setPage(1); }} tabs={[{ id: '', label: 'All' }, ...STATUSES.map(x => ({ id: x, label: x }))]} />

      {loading && !data ? <Loader /> : invoices.length === 0 ? <Empty text="No invoices found" /> : invoices.map(v => (
        <RCard key={v._id} style={S.card}>
          <View style={S.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={S.h3}>{v.invoiceNumber}</Text>
              <Text style={S.small}>{v.memberId ? `${v.memberId.name} · ${v.memberId.memberCode}` : 'Walk-in'} · {fmtDate(v.issuedAt)}</Text>
              {!!v.items?.[0]?.description && <Text style={S.small} numberOfLines={1}>{v.items[0].description}</Text>}
            </View>
            <Pill value={v.status} />
          </View>
          <Row k="Total" v={inr(v.totalAmount, 2)} bold />
          <Row k="Paid" v={inr(v.paidAmount, 2)} />
          {v.balance > 0 && <Row k={`Balance${v.dueDate ? ` (due ${fmtDate(v.dueDate)})` : ''}`} v={inr(v.balance, 2)} color={C.danger} bold />}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {['pending', 'partial'].includes(v.status) && canCreate && <Btn small label="Collect payment" onPress={() => setPay({ inv: v, mode: 'pay' })} />}
            {['pending', 'partial'].includes(v.status) && v.memberId && canCreate && <Btn small color="#25D366" label="Pay link" onPress={() => sendLink(v)} />}
            {v.paidAmount > 0 && ['paid', 'partial'].includes(v.status) && owner && <Btn small light label="Refund" onPress={() => setPay({ inv: v, mode: 'refund' })} />}
            {v.status === 'pending' && owner && <Btn small danger label="Void" onPress={() => voidInv(v)} />}
          </View>
        </RCard>
      ))}
      <Pager page={page} pages={data?.pages || 1} onPage={setPage} />

      <PaymentSheet invoice={pay?.inv || null} mode={pay?.mode} onClose={() => { setPay(null); reload(); summary.reload(); }} />

      <Sheet
        visible={creating}
        title="New invoice"
        subtitle="Day passes, PT top-ups, merchandise, anything billable"
        onClose={reset}
        footer={<><Btn light label="Cancel" onPress={reset} /><Btn label="Create invoice" busy={saving} onPress={create} /></>}
      >
        <MemberPicker label="Member (leave empty for walk-in)" value={member} onChange={setMember} />
        <Text style={[S.label, { marginBottom: 6 }]}>Items</Text>
        {lines.map((l, i) => (
          <RCard key={i} style={[S.card, { padding: 10 }]}>
            <Input label="Description" value={l.description} onChangeText={v => setLine(i, 'description', v)} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Qty" keyboardType="decimal-pad" value={l.quantity} onChangeText={v => setLine(i, 'quantity', v)} /></View>
              <View style={{ flex: 1.3 }}><Input label="Rate ₹" keyboardType="decimal-pad" value={l.unitPrice} onChangeText={v => setLine(i, 'unitPrice', v)} /></View>
              <View style={{ flex: 1 }}><Input label="GST %" keyboardType="decimal-pad" value={l.gstPercent} onChangeText={v => setLine(i, 'gstPercent', v)} /></View>
            </View>
            {lines.length > 1 && <Btn small light label="Remove" icon={<Trash2 size={13} color={C.black} />} onPress={() => setLines(ls => ls.filter((_, j) => j !== i))} />}
          </RCard>
        ))}
        <View style={{ marginBottom: 14 }}><Btn light small label="Add line" icon={<Plus size={13} color={C.black} />} onPress={() => setLines(ls => [...ls, newLine()])} /></View>
        <Input label="Discount (₹)" keyboardType="decimal-pad" value={discount} onChangeText={setDiscount} />
        <Input label="Coupon" autoCapitalize="characters" value={coupon} onChangeText={v => setCoupon(v.toUpperCase())} />
        <Input label="Collect now (₹)" keyboardType="decimal-pad" value={payNow} placeholder={String(totals.total)} onChangeText={setPayNow} />
        <Select label="Method" options={METHODS} value={method} onChange={setMethod} />
        <Input label="Balance due by" placeholder="YYYY-MM-DD" value={dueDate} onChangeText={setDueDate} />
        <Totals rows={[['Subtotal', inr(totals.sub, 2)], ...(totals.disc > 0 ? [['Discount', `− ${inr(totals.disc, 2)}`, 'green'] as [string, string, 'green']] : []), ['GST', inr(totals.gst, 2)], ['Total', inr(totals.total, 2), 'bold']]} />
      </Sheet>
    </Screen>
  );
}
