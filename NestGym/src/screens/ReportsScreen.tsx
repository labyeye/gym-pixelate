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
  const risk = useFetch(() => gym.reports.atRisk({ days: 14 }), [], tab === 'risk');
  const bdays = useFetch(() => gym.reports.birthdays(), [], tab === 'birthdays');
  const heat = useFetch(() => gym.reports.heatmap(range), [from, to], tab === 'peak');
  const gst = useFetch(() => gym.reports.gst(range), [from, to], tab === 'gst');
  const o = overview.data?.data;

  const cur = { overview, dues, renewals, risk, birthdays: bdays, peak: heat, gst }[tab as 'overview']!;
  const dateFilter = (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}><Input label="From" value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" /></View>
      <View style={{ flex: 1 }}><Input label="To" value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" /></View>
    </View>
  );

  const grid = (() => {
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    (heat.data?.data || []).forEach((c: any) => (g[c.day][c.hour] = c.count));
    return g;
  })();
  const maxHeat = Math.max(1, ...grid.flat());
  // 6-hour blocks keep the heatmap readable at phone width
  const BLOCKS = [['Night', 0, 6], ['Morning', 6, 12], ['Afternoon', 12, 18], ['Evening', 18, 24]] as const;

  return (
    <Screen title="Reports" refreshing={cur.loading && !!cur.data} onRefresh={cur.reload}>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'overview', label: 'P&L' }, { id: 'dues', label: 'Dues' }, { id: 'renewals', label: 'Renewals' }, { id: 'risk', label: 'At risk' },
        { id: 'birthdays', label: 'Birthdays' }, { id: 'peak', label: 'Peak hours' }, { id: 'gst', label: 'GST' },
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
              <Panel title="Enquiry funnel">
                <Text style={[S.body, { marginBottom: 8 }]}>{o?.enquiries?.total ?? 0} enquiries · {o?.enquiries?.converted ?? 0} joined · {o?.enquiries?.conversionPercent ?? 0}% conversion</Text>
                <HBars rows={Object.entries(o?.enquiries?.byStatus || {}).map(([k, v]) => ({ label: titleCase(k), value: v as number }))} color="#A855F7" />
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

      {tab === 'risk' && (
        <>
          <Text style={[S.small, { marginBottom: 12 }]}>Paying members with no visit in the last 14 days — a call now is cheaper than losing the renewal.</Text>
          {risk.loading && !risk.data ? <Loader /> : (risk.data?.data || []).length === 0 ? <Empty text="Nobody at risk" /> : (risk.data?.data || []).map((r: any) => (
            <RCard key={r.member._id} style={S.card}>
              <View style={S.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={S.h3}>{r.member.name}</Text>
                  <Text style={S.small}>{r.plan} · ends {fmtDate(r.endDate)}</Text>
                </View>
                <Text style={[S.h3, { color: C.danger }]}>{r.daysAbsent != null ? `${r.daysAbsent}d` : '—'}</Text>
              </View>
              <Row k="Last visit" v={r.lastVisit ? fmtDate(r.lastVisit) : 'Never came'} />
              <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
                <Btn small color="#25D366" label="WhatsApp" onPress={() => wa(r.member.phone, `Hi ${r.member.name}, we've missed you at the gym! Everything okay? Come in this week — your trainer is ready to help you get back on track.`)} />
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

      {tab === 'peak' && (
        <>
          {dateFilter}
          {heat.loading && !heat.data ? <Loader /> : (
            <Panel title="Check-ins by weekday and time of day">
              <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                <View style={{ width: 38 }} />
                {BLOCKS.map(([n]) => <Text key={n} style={[S.label, { flex: 1, textAlign: 'center', fontSize: 9 }]}>{n}</Text>)}
              </View>
              {grid.map((row, d) => (
                <View key={d} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={[S.label, { width: 38 }]}>{DAYS[d]}</Text>
                  {BLOCKS.map(([n, a, b]) => {
                    const sum = row.slice(a, b).reduce((x, y) => x + y, 0);
                    const k = sum / (maxHeat * 6);
                    return (
                      <View key={n} style={{ flex: 1, height: 30, marginHorizontal: 2, borderWidth: 2, borderColor: C.black, alignItems: 'center', justifyContent: 'center', backgroundColor: sum ? `rgba(2,75,171,${Math.min(1, 0.15 + k * 2)})` : '#F3F4F6' }}>
                        <Text style={{ fontFamily: 'DMSans-Bold', fontSize: 11, color: k > 0.25 ? '#fff' : C.black }}>{sum || ''}</Text>
                      </View>
                    );
                  })}
                </View>
              ))}
              <Text style={[S.small, { marginTop: 8 }]}>Schedule classes and staff around the dark cells.</Text>
            </Panel>
          )}
        </>
      )}

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
