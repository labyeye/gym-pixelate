import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { gym } from '../api/gym';
import { useFetch } from '../hooks/useFetch';
import { C, S } from '../theme';
import { fmtDate, inr, titleCase, todayStr, waLink } from '../utils/format';
import { HBars } from '../components/charts';
import { Btn, Empty, Input, Loader, Panel, Pill, Row, Screen, Select, StatCard, StatGrid, Tabs, RCard } from '../components/ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const monthStart = () => {
  const d = new Date();
  return todayStr(new Date(d.getFullYear(), d.getMonth(), 1));
};
const wa = (phone: string, text: string) => {
  const u = waLink(phone, text);
  if (u) Linking.openURL(u);
};

export default function ReportsScreen() {
  const nav = useNavigation<any>();
  const [tab, setTab] = useState('overview');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [days, setDays] = useState('7');
  const range = { from, to };

  const overview = useFetch(() => gym.reports.overview(range), [from, to], tab === 'overview');
  const dues = useFetch(() => gym.reports.dues(), [], tab === 'dues');
  const renewals = useFetch(() => gym.reports.renewals({ days }), [days], tab === 'renewals');
  const bdays = useFetch(() => gym.reports.birthdays(), [], tab === 'birthdays');
  const gst = useFetch(() => gym.reports.gst(range), [from, to], tab === 'gst');
  const o = overview.data?.data;

  const cur = { overview, dues, renewals, birthdays: bdays, gst }[tab as 'overview']!;
  const dateFilter = (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}><Input label="From" value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" /></View>
      <View style={{ flex: 1 }}><Input label="To" value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" /></View>
    </View>
  );

  return (
    <Screen title="Reports" refreshing={cur.loading && !!cur.data} onRefresh={cur.reload}>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'overview', label: 'P&L' }, { id: 'dues', label: 'Dues' }, { id: 'renewals', label: 'Renewals' },
        { id: 'birthdays', label: 'Birthdays' }, { id: 'gst', label: 'GST' },
      ]} />

      {tab === 'overview' && (
        <>
          {dateFilter}
          {overview.loading && !o ? <Loader /> : (
            <>
              <StatGrid>
                <StatCard label="Income (collected)" value={inr(o?.income)} color="#00C48C" />
                <StatCard label="Expenses" value={inr(o?.expenses)} color="#EF4444" />
                <StatCard label="Profit" value={inr(o?.profit)} color={(o?.profit ?? 0) >= 0 ? '#024BAB' : '#EF4444'} />
                <StatCard label="Renewal retention" value={o?.retentionPercent == null ? '—' : `${o.retentionPercent}%`} sub={o ? `${o.membersUpForRenewal} up for renewal` : undefined} color="#A855F7" />
              </StatGrid>
              <Panel title="Collections by method"><HBars rows={(o?.byMethod || []).map((r: any) => ({ label: titleCase(r.method), value: r.total }))} color="#00C48C" fmt={inr} /></Panel>
              <Panel title="Revenue by type (billed)"><HBars rows={(o?.byKind || []).map((r: any) => ({ label: titleCase(r.kind), value: r.amount }))} fmt={inr} /></Panel>
              <Panel title="Expenses by category"><HBars rows={(o?.expenseByCategory || []).map((r: any) => ({ label: titleCase(r.category), value: r.total }))} color="#EF4444" fmt={inr} /></Panel>
              <Panel title="Where members come from"><HBars rows={(o?.sources || []).map((r: any) => ({ label: titleCase(r.source), value: r.count }))} color="#FA731C" /></Panel>
              <Panel title="Plan sales">
                {(o?.planSales || []).length === 0 ? <Empty text="No sales" /> : (o?.planSales || []).map((p: any) => (
                  <Row key={p.plan} k={p.plan} v={`${p.sold} sold · ${p.renewals} renewals · ${inr(p.billed)}`} />
                ))}
              </Panel>
            </>
          )}
        </>
      )}

      {tab === 'dues' && (
        <>
          <StatGrid>
            <StatCard label="Total outstanding" value={inr(dues.data?.total)} color="#EF4444" />
            <StatCard label="Members with dues" value={dues.data?.count ?? 0} color="#FA731C" />
          </StatGrid>
          {dues.loading && !dues.data ? <Loader /> : (dues.data?.data || []).length === 0 ? <Empty text="No dues — all clear" /> : (dues.data?.data || []).map((r: any, i: number) => (
            <RCard key={r.member?._id || i} style={S.card}>
              <View style={S.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={S.h3}>{r.member?.name}</Text>
                  <Text style={S.small}>{r.member?.memberCode} · {r.member?.phone}</Text>
                </View>
                <Text style={[S.h3, { color: C.danger }]}>{inr(r.due)}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Btn small label="Collect" onPress={() => nav.navigate('MemberProfile', { id: r.member?._id })} />
                {!!r.member?.phone && <Btn small color="#25D366" label="WhatsApp" onPress={() => wa(r.member.phone, `Hi ${r.member.name}, a gentle reminder: you have ${inr(r.due)} pending. Please clear it at the front desk.`)} />}
              </View>
            </RCard>
          ))}
        </>
      )}

      {tab === 'renewals' && (
        <>
          <Select label="Window" options={['3', '7', '15', '30'].map(d => ({ value: d, label: `Next ${d} days` }))} value={days} onChange={setDays} />
          {renewals.loading && !renewals.data ? <Loader /> : (renewals.data?.data || []).length === 0 ? <Empty text="Nobody up for renewal" /> : (renewals.data?.data || []).map((r: any) => (
            <RCard key={r.membershipId} style={S.card}>
              <View style={S.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={S.h3}>{r.member.name}</Text>
                  <Text style={S.small}>{r.plan} · ends {fmtDate(r.endDate)}</Text>
                </View>
                <Text style={[S.h3, { color: r.daysLeft < 0 ? C.danger : r.daysLeft <= 3 ? C.secondary : C.black }]}>
                  {r.daysLeft < 0 ? `lapsed ${-r.daysLeft}d` : r.daysLeft === 0 ? 'today' : `${r.daysLeft}d`}
                </Text>
              </View>
              {r.due > 0 && <Row k="Due" v={inr(r.due)} color={C.danger} />}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Btn small label="Renew" onPress={() => nav.navigate('MemberProfile', { id: r.member._id })} />
                {!!r.whatsapp && <Btn small color="#25D366" label="WhatsApp" onPress={() => Linking.openURL(r.whatsapp)} />}
              </View>
            </RCard>
          ))}
        </>
      )}

      {tab === 'birthdays' && (bdays.loading && !bdays.data ? <Loader /> : (bdays.data?.data || []).length === 0 ? <Empty text="No birthdays this month" /> : (bdays.data?.data || []).map((m: any) => (
        <RCard key={m._id} style={S.card}>
          <View style={S.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={S.h3}>🎂 {m.name}</Text>
              <Text style={S.small}>{m.phone} · {m.day} {new Date().toLocaleString('en-IN', { month: 'long' })}</Text>
            </View>
            <Btn small color="#25D366" label="Wish" onPress={() => wa(m.phone, `Happy Birthday ${m.name}! 🎉 Wishing you strength and health from all of us at the gym.`)} />
          </View>
        </RCard>
      )))}

      {tab === 'gst' && (
        <>
          {dateFilter}
          <StatGrid>
            <StatCard label="Taxable value" value={inr(gst.data?.totals?.taxable)} color="#024BAB" />
            <StatCard label="CGST" value={inr(gst.data?.totals?.cgst)} color="#A855F7" />
            <StatCard label="SGST" value={inr(gst.data?.totals?.sgst)} color="#FA731C" />
            <StatCard label="Invoice total" value={inr(gst.data?.totals?.total)} color="#00C48C" />
          </StatGrid>
          {gst.loading && !gst.data ? <Loader /> : (gst.data?.data || []).length === 0 ? <Empty text="No invoices in range" /> : (gst.data?.data || []).map((v: any) => (
            <RCard key={v._id} style={S.card}>
              <View style={S.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={S.h3}>{v.invoiceNumber}</Text>
                  <Text style={S.small}>{fmtDate(v.issuedAt)} · {v.memberId?.name || 'Walk-in'}</Text>
                </View>
                <Pill value={v.status} />
              </View>
              <Row k="Taxable" v={inr(v.amount, 2)} />
              <Row k="GST" v={inr(v.gstAmount, 2)} />
              <Row k="Total" v={inr(v.totalAmount, 2)} bold />
            </RCard>
          ))}
        </>
      )}
    </Screen>
  );
}
