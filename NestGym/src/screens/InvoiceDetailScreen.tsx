import React, { useState } from 'react';
import { Alert, Linking, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ban, Send, Undo2, Wallet } from 'lucide-react-native';
import { gym } from '../api/gym';
import { isManager, useAuth } from '../contexts/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { C, FONT, S } from '../theme';
import { fmtDate, inr } from '../utils/format';
import { waDigits } from '../utils/countries';
import { PaymentSheet } from '../components/gymSheets';
import { Avatar, Thumb } from '../components/PhotoPicker';
import { Btn, Loader, Pill, Row, Screen, Totals, notify, RCard } from '../components/ui';

const Section = ({ title }: { title: string }) => (
  <Text style={[S.label, { marginTop: 6, marginBottom: 8, color: C.textMuted }]}>{title}</Text>
);

/** Order details: who bought, every line (with product photo), totals and the payment trail. */
export default function InvoiceDetailScreen() {
  const nav = useNavigation<any>();
  const { id } = useRoute<any>().params;
  const { user } = useAuth();
  const owner = user?.role === 'gym_owner';
  const canCreate = owner || isManager(user);
  const { data, loading, reload } = useFetch(() => gym.invoices.get(id), [id]);
  const [pay, setPay] = useState<'pay' | 'refund' | null>(null);
  const v = data?.data;

  if (loading && !v) return <Screen title="Order"><Loader /></Screen>;
  if (!v) return <Screen title="Order"><Text style={S.body}>Invoice not found.</Text></Screen>;

  const open = ['pending', 'partial'].includes(v.status);
  const subtotal = (v.amount || 0) + (v.discount || 0);
  const products = (v.items || []).filter((x: any) => x.kind === 'product');

  const sendLink = async () => {
    try {
      const r = await gym.paymentLinks.forInvoice(v._id);
      await Linking.openURL(`https://wa.me/${waDigits(r.data.phone)}?text=${encodeURIComponent(r.data.message)}`);
    } catch (e: any) {
      notify.error('Could not create link', e.message);
    }
  };
  const voidInv = () =>
    Alert.alert(`Void ${v.invoiceNumber}?`, 'Only unpaid invoices can be voided.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Void', style: 'destructive', onPress: async () => { try { await gym.invoices.cancel(v._id); notify.success('Invoice voided'); reload(); } catch (e: any) { notify.error('Failed', e.message); } } },
    ]);

  return (
    <Screen title={v.invoiceNumber} refreshing={loading} onRefresh={reload}>
      <RCard style={[S.card, { padding: 14 }]}>
        <View style={S.rowBetween}>
          <View>
            <Text style={S.small}>{fmtDate(v.issuedAt)}</Text>
            <Text style={[S.h1, { color: C.primary, marginTop: 2 }]}>{inr(v.totalAmount, 2)}</Text>
          </View>
          <Pill value={v.status} />
        </View>
        <View style={[S.rowBetween, { marginTop: 8 }]}>
          <Text style={S.small}>Paid <Text style={{ color: C.black, fontFamily: FONT.bold }}>{inr(v.paidAmount, 2)}</Text></Text>
          {v.balance > 0 && <Text style={[S.small, { color: C.danger }]}>Balance <Text style={{ fontFamily: FONT.bold }}>{inr(v.balance, 2)}</Text>{v.dueDate ? ` · due ${fmtDate(v.dueDate)}` : ''}</Text>}
        </View>
        {v.memberId ? (
          <TouchableOpacity onPress={() => nav.navigate('MemberProfile', { id: v.memberId._id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
            <Avatar uri={v.memberId.photo} name={v.memberId.name} size={38} round />
            <View style={{ flex: 1 }}>
              <Text style={S.h3} numberOfLines={1}>{v.memberId.name}</Text>
              <Text style={S.small}>{v.memberId.memberCode} · {v.memberId.phone}</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <Text style={[S.small, { marginTop: 10 }]}>Walk-in customer</Text>
        )}
        {(open || v.paidAmount > 0) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {open && canCreate && <Btn small label="Collect" icon={<Wallet />} onPress={() => setPay('pay')} />}
            {open && v.memberId && canCreate && <Btn small color="#25D366" label="Pay link" icon={<Send />} onPress={sendLink} />}
            {v.paidAmount > 0 && ['paid', 'partial'].includes(v.status) && owner && <Btn small light label="Refund" icon={<Undo2 />} onPress={() => setPay('refund')} />}
            {v.status === 'pending' && owner && <Btn small danger label="Void" icon={<Ban />} onPress={voidInv} />}
          </View>
        )}
      </RCard>

      <Section title={products.length ? `Items sold · ${v.items.length}` : `Items · ${v.items?.length || 0}`} />
      {(v.items || []).map((x: any, i: number) => (
        <RCard key={i} style={[S.card, { padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <Thumb uri={x.photo} name={x.description} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={S.h3} numberOfLines={2}>{x.description}</Text>
            <Text style={S.small}>{x.quantity} × {inr(x.unitPrice, 2)}{x.gstPercent ? ` · ${x.gstPercent}% GST` : ''}</Text>
            <Text style={[S.small, { textTransform: 'capitalize' }]}>{String(x.kind).replace(/_/g, ' ')}</Text>
          </View>
          <Text style={S.h3}>{inr(x.amount ?? x.quantity * x.unitPrice, 2)}</Text>
        </RCard>
      ))}

      <Section title="Bill" />
      <Totals
        rows={[
          ['Subtotal', inr(subtotal, 2)],
          ...(v.discount > 0 ? [[`Discount${v.couponCode ? ` (${v.couponCode})` : ''}`, `− ${inr(v.discount, 2)}`, 'green'] as [string, string, 'green']] : []),
          ['GST', inr(v.gstAmount, 2)],
          ['Total', inr(v.totalAmount, 2), 'bold'],
        ]}
      />

      {!!v.payments?.length && (
        <>
          <Section title="Payments" />
          <View style={S.card}>
            {v.payments.map((p: any, i: number) => (
              <View key={p._id || i} style={[S.rowBetween, { paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: '#E5E7EB' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={S.body}>{p.type === 'refund' ? 'Refund' : 'Payment'} · {String(p.method).replace(/_/g, ' ')}</Text>
                  <Text style={S.small}>{fmtDate(p.paidAt)}{p.reference ? ` · ${p.reference}` : ''}</Text>
                </View>
                <Text style={[S.h3, { color: p.type === 'refund' ? C.danger : '#15803D' }]}>{p.type === 'refund' ? '−' : '+'}{inr(Math.abs(p.amount), 2)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
      {!!v.notes && <Row k="Notes" v={v.notes} />}

      <PaymentSheet invoice={pay ? v : null} mode={pay || 'pay'} onClose={() => { setPay(null); reload(); }} />
    </Screen>
  );
}
