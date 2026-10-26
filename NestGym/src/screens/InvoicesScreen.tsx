import React, { useMemo, useState } from 'react';
import { Alert, Linking, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ban, BellRing, FileText, IndianRupee, Plus, Send, Trash2, Undo2, Wallet } from 'lucide-react-native';
import { gym } from '../api/gym';
import { useAuth, isManager } from '../contexts/AuthContext';
import { useDebounced, useFetch } from '../hooks/useFetch';
import { C, S } from '../theme';
import { fmtDate, inr, r2 } from '../utils/format';
import { waDigits } from '../utils/countries';
import { MemberPicker } from '../components/pickers';
import { Thumb } from '../components/PhotoPicker';
import { METHODS, PaymentSheet } from '../components/gymSheets';
import { Btn, Empty, IconBtn, Input, Loader, MiniStat, MiniStatRow, Pager, Pair, Pill, Screen, SearchBox, Select, Sheet, Tabs, Totals, notify, RCard } from '../components/ui';
import ExportSheet, { ExportSpec } from '../components/ExportSheet';
import { Download as ExportIcon } from 'lucide-react-native';

const STATUSES = ['paid', 'partial', 'pending', 'refunded', 'cancelled'];
const TYPES: Record<string, [string, string]> = {
  membership: ['Membership', '#1D4ED8'],
  product: ['Product sale', '#C2410C'],
  pt: ['PT package', '#7E22CE'],
  other: ['Other', '#4B5563'],
};
const newLine = () => ({ description: '', quantity: '1', unitPrice: '', gstPercent: '18' });

export default function InvoicesScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const owner = user?.role === 'gym_owner';
  const canCreate = owner || isManager(user);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const dsearch = useDebounced(search);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
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
  const [exp, setExp] = useState<ExportSpec | null>(null);

  const params = useMemo(() => ({ page, limit: 25, search: dsearch, status, type }), [page, dsearch, status, type]);
  const { data, loading, reload } = useFetch(() => gym.invoices.list(params), [params]);
  const invoices: any[] = data?.data || [];
  const s = { todayRevenue: data?.summary?.today, monthlyRevenue: data?.summary?.month, pendingPayments: data?.summary?.dues };

  const totals = useMemo(() => {
    const sub = lines.reduce((a, l) => a + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
    const disc = Math.min(sub, Number(discount) || 0);
    const gst = lines.reduce((a, l) => a + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * (1 - (sub ? disc / sub : 0)) * ((Number(l.gstPercent) || 0) / 100), 0);
    return { sub, disc, gst: r2(gst), total: r2(sub - disc + gst) };
  }, [lines, discount]);

  const exportInvoices = () =>
    setExp({
      name: 'Invoices',
      cols: [
        { header: 'Invoice no', value: (v: any) => v.invoiceNumber },
        { header: 'Type', value: (v: any) => (TYPES[v.type] || TYPES.other)[0] },
        { header: 'Member', value: (v: any) => v.memberId?.name || 'Walk-in' },
        { header: 'Member ID', value: (v: any) => v.memberId?.memberCode },
        { header: 'Date', value: (v: any) => fmtDate(v.issuedAt) },
        { header: 'Items', value: (v: any) => (v.items || []).map((x: any) => `${x.description} x${x.quantity}`).join('; ') },
        { header: 'Total', value: (v: any) => v.totalAmount },
        { header: 'Paid', value: (v: any) => v.paidAmount },
        { header: 'Balance', value: (v: any) => v.balance },
        { header: 'Status', value: (v: any) => v.status },
      ],
      rows: async () => (await gym.invoices.list({ ...params, page: 1, limit: 1000 })).data || [],
    });

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
      onRefresh={reload}
      right={<><Btn small label="Export" icon={<ExportIcon />} onPress={exportInvoices} />{canCreate && <><Btn small label="Remind" icon={<BellRing />} onPress={sendReminders} /><Btn small label="New" icon={<Plus />} onPress={() => setCreating(true)} /></>}</>}
    >
      <MiniStatRow>
        <MiniStat label="Today" value={inr(s.todayRevenue)} icon={IndianRupee} color="#00C48C" />
        <MiniStat label="This month" value={inr(s.monthlyRevenue)} icon={Wallet} color="#024BAB" />
        <MiniStat label="Dues" value={inr(s.pendingPayments)} icon={Ban} color={s.pendingPayments > 0 ? '#EF4444' : '#14B8A6'} onPress={() => setStatus('partial')} />
        <MiniStat label="Invoices" value={data?.total ?? 0} icon={FileText} color="#A855F7" />
      </MiniStatRow>
      <SearchBox value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Invoice number…" />
      <Tabs value={type} onChange={v => { setType(v); setPage(1); }} tabs={[{ id: '', label: 'All types' }, ...Object.entries(TYPES).map(([id, [label]]) => ({ id, label }))]} />
      <Tabs value={status} onChange={v => { setStatus(v); setPage(1); }} tabs={[{ id: '', label: 'All' }, ...STATUSES.map(x => ({ id: x, label: x }))]} />

      {loading && !data ? <Loader /> : invoices.length === 0 ? <Empty text="No invoices found" /> : invoices.map(v => {
        const open = ['pending', 'partial'].includes(v.status);
        const pct = v.totalAmount > 0 ? Math.min(100, (v.paidAmount / v.totalAmount) * 100) : 0;
        return (
          <RCard key={v._id} style={[S.card, { padding: 12 }]}>
            <TouchableOpacity activeOpacity={0.85} onPress={() => nav.navigate('InvoiceDetail', { id: v._id })}>
            <View style={[S.rowBetween, { alignItems: 'flex-start' }]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={S.h3} numberOfLines={1}>{v.memberId ? v.memberId.name : 'Walk-in'}</Text>
                <Text style={S.small} numberOfLines={1}>{v.invoiceNumber} · {fmtDate(v.issuedAt)}</Text>
                <Text style={{ fontFamily: 'Inter-Bold', fontSize: 10, textTransform: 'uppercase', color: (TYPES[v.type] || TYPES.other)[1], marginTop: 2 }}>{(TYPES[v.type] || TYPES.other)[0]}</Text>
                {!!v.items?.[0]?.description && !v.items.some((x: any) => x.kind === 'product') && <Text style={S.small} numberOfLines={1}>{v.items[0].description}</Text>}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[S.h2, { color: C.primary }]}>{inr(v.totalAmount, 2)}</Text>
                <Pill value={v.status} />
              </View>
            </View>
            {v.items?.some((x: any) => x.kind === 'product') && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                {v.items.filter((x: any) => x.kind === 'product').slice(0, 4).map((x: any, i: number) => (
                  <Thumb key={i} uri={x.photo} name={x.description} size={34} />
                ))}
                <Text style={[S.small, { flex: 1 }]} numberOfLines={2}>
                  {v.items.filter((x: any) => x.kind === 'product').map((x: any) => `${x.description} ×${x.quantity}`).join(', ')}
                </Text>
              </View>
            )}
            <View style={{ height: 6, borderRadius: 3, backgroundColor: '#E5E7EB', marginTop: 10, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${pct}%`, backgroundColor: v.status === 'paid' ? C.success : C.warning }} />
            </View>
            <View style={[S.rowBetween, { marginTop: 6 }]}>
              <Text style={S.small}>Paid <Text style={{ color: C.black, fontFamily: 'Inter-Bold' }}>{inr(v.paidAmount, 2)}</Text></Text>
              {v.balance > 0 && <Text style={[S.small, { color: C.danger }]}>Balance <Text style={{ fontFamily: 'Inter-Bold' }}>{inr(v.balance, 2)}</Text>{v.dueDate ? ` · due ${fmtDate(v.dueDate)}` : ''}</Text>}
            </View>
            </TouchableOpacity>
            {(open || v.paidAmount > 0) && (
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 }}>
                {open && canCreate && <IconBtn icon={Wallet} label="Collect payment" color={C.primary} onPress={() => setPay({ inv: v, mode: 'pay' })} />}
                {open && v.memberId && canCreate && <IconBtn icon={Send} label="Pay link" color="#25D366" onPress={() => sendLink(v)} />}
                {v.paidAmount > 0 && ['paid', 'partial'].includes(v.status) && owner && <IconBtn icon={Undo2} label="Refund" onPress={() => setPay({ inv: v, mode: 'refund' })} />}
                {v.status === 'pending' && owner && <IconBtn icon={Ban} label="Void" color={C.danger} onPress={() => voidInv(v)} />}
              </View>
            )}
          </RCard>
        );
      })}
      <Pager page={page} pages={data?.pages || 1} onPage={setPage} />

      <PaymentSheet invoice={pay?.inv || null} mode={pay?.mode} onClose={() => { setPay(null); reload(); }} />

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
            <Pair>
              <Input label="Qty" keyboardType="decimal-pad" value={l.quantity} onChangeText={v => setLine(i, 'quantity', v)} />
              <Input label="Rate ₹" keyboardType="decimal-pad" value={l.unitPrice} onChangeText={v => setLine(i, 'unitPrice', v)} />
            </Pair>
            <Input label="GST %" keyboardType="decimal-pad" value={l.gstPercent} onChangeText={v => setLine(i, 'gstPercent', v)} />
            {lines.length > 1 && <Btn small light label="Remove" icon={<Trash2 size={13} color={C.black} />} onPress={() => setLines(ls => ls.filter((_, j) => j !== i))} />}
          </RCard>
        ))}
        <View style={{ marginBottom: 14 }}><Btn light small label="Add line" icon={<Plus size={13} color={C.black} />} onPress={() => setLines(ls => [...ls, newLine()])} /></View>
        <Pair>
          <Input label="Discount (₹)" keyboardType="decimal-pad" value={discount} onChangeText={setDiscount} />
          <Input label="Coupon" autoCapitalize="characters" value={coupon} onChangeText={v => setCoupon(v.toUpperCase())} />
        </Pair>
        <Pair>
          <Input label="Collect now (₹)" keyboardType="decimal-pad" value={payNow} placeholder={String(totals.total)} onChangeText={setPayNow} />
          <Select label="Method" options={METHODS} value={method} onChange={setMethod} />
        </Pair>
        <Input label="Balance due by" placeholder="YYYY-MM-DD" value={dueDate} onChangeText={setDueDate} />
        <Totals rows={[['Subtotal', inr(totals.sub, 2)], ...(totals.disc > 0 ? [['Discount', `− ${inr(totals.disc, 2)}`, 'green'] as [string, string, 'green']] : []), ['GST', inr(totals.gst, 2)], ['Total', inr(totals.total, 2), 'bold']]} />
      </Sheet>
      <ExportSheet spec={exp} onClose={() => setExp(null)} />
    </Screen>
  );
}
