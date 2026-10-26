import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { gym } from '../api/gym';
import { request } from '../api/api';
import { WEB_APP_URL } from '../config/env';
import { useAuth } from '../contexts/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { C, S } from '../theme';
import { fmtDate, titleCase } from '../utils/format';
import { Btn, Empty, Loader, Panel, Pill, Row, Screen, StatCard, StatGrid, Tabs, brut, RCard } from '../components/ui';
import { CalendarClock as StatCalendarClock, CreditCard as StatCreditCard, Layers as StatLayers, ShieldCheck as StatShieldCheck } from 'lucide-react-native';

const CYCLES = [
  { id: 'monthly', label: 'Monthly', months: 1, off: 0 },
  { id: 'quarterly', label: 'Quarterly', months: 3, off: 10 },
  { id: 'half_yearly', label: '6 months', months: 6, off: 20 },
  { id: 'yearly', label: 'Yearly', months: 12, off: 30 },
];
const ORDER = ['starter', 'growth', 'pro', 'elite', 'enterprise'];
const rupees = (paise: number) => '₹' + Math.round(paise / 100).toLocaleString('en-IN');

export default function SubscriptionScreen() {
  const { refreshTenant } = useAuth();
  const [cycle, setCycle] = useState('yearly');
  const plansRes = useFetch(() => gym.billing.plans(), []);
  const subRes = useFetch(() => gym.billing.subscription(), []);
  const invRes = useFetch(() => request<any>('/billing/invoices'), []);
  const usage = useFetch(async () => {
    const [m, b, u] = await Promise.all([gym.members.list({ status: 'active', limit: 1 }), request<any>('/branches'), gym.users.list({ status: 'active' })]);
    return { members: m.total ?? 0, branches: b.count ?? (b.data || []).length, staff: (u.data || []).filter((x: any) => x.role !== 'gym_owner').length };
  }, []);

  const plans = plansRes.data?.data || {};
  const tenant = subRes.data?.data?.tenant;
  const sub = subRes.data?.data?.subscription;
  const current = tenant?.plan || 'trial';
  const expires = tenant?.planExpiresAt ? new Date(tenant.planExpiresAt) : null;
  const daysLeft = expires ? Math.ceil((expires.getTime() - Date.now()) / 86400000) : null;
  const cap = (plan: any, k: string) => (plan?.limits?.[k] == null ? null : plan.limits[k]);
  const curPlan = plans[current];
  const reload = () => { plansRes.reload(); subRes.reload(); invRes.reload(); usage.reload(); refreshTenant(); };

  const meter = (label: string, used: number, max: number | null) => (
    <View key={label} style={{ marginBottom: 12 }}>
      <View style={S.rowBetween}><Text style={S.label}>{label}</Text><Text style={S.label}>{used}{max == null ? ' / ∞' : ` / ${max}`}</Text></View>
      <View style={{ height: 12, borderWidth: 2, borderColor: C.black, marginTop: 4 }}>
        <View style={{ height: '100%', width: `${max == null ? 8 : Math.min(100, (used / Math.max(1, max)) * 100)}%`, backgroundColor: max != null && max > 1 && used / max > 0.9 ? C.danger : C.success }} />
      </View>
    </View>
  );

  if (subRes.loading && !subRes.data) return <Screen title="Subscription" back><Loader /></Screen>;

  return (
    <Screen title="Subscription & Plan" back refreshing={subRes.loading} onRefresh={reload}>
      <StatGrid>
        <StatCard label="Current plan" value={titleCase(current)} sub={sub?.billingCycle ? titleCase(sub.billingCycle) : undefined} icon={<StatLayers />} color="#024BAB" />
        <StatCard label={current === 'trial' ? 'Trial ends in' : 'Renews in'} value={daysLeft == null ? '—' : `${Math.max(0, daysLeft)} days`} sub={expires ? fmtDate(expires) : undefined} icon={<StatCalendarClock />} color={daysLeft != null && daysLeft <= 5 ? '#EF4444' : '#00C48C'} />
        <StatCard label="Status" value={titleCase(sub?.status || tenant?.status || 'active')} icon={<StatShieldCheck />} color="#A855F7" />
        <StatCard label="Payments" value={(invRes.data?.data || []).length} icon={<StatCreditCard />} color="#FA731C" />
      </StatGrid>

      {usage.data && (
        <Panel title="Plan usage">
          {meter('Active members', usage.data.members, cap(curPlan, 'members') ?? (current === 'trial' ? 100 : null))}
          {meter('Branches', usage.data.branches, cap(curPlan, 'branches') ?? (current === 'trial' ? 1 : null))}
          {meter('Staff accounts', usage.data.staff, cap(curPlan, 'staff') ?? (current === 'trial' ? 5 : null))}
        </Panel>
      )}

      <Text style={[S.label, { marginBottom: 8 }]}>Plans</Text>
      <Tabs value={cycle} onChange={setCycle} tabs={CYCLES.map(c => ({ id: c.id, label: c.off ? `${c.label} −${c.off}%` : c.label }))} />
      {ORDER.filter(k => plans[k]).map(k => {
        const p = plans[k];
        const months = CYCLES.find(c => c.id === cycle)!.months;
        const total = p.prices?.[cycle];
        return (
          <RCard key={k} style={brut({ backgroundColor: C.white, padding: 14, marginBottom: 14, borderRightColor: p.popular ? C.secondary : '#0A0A0A', borderBottomColor: p.popular ? C.secondary : '#0A0A0A' })}>
            <View style={S.rowBetween}>
              <Text style={S.h2}>{p.name}</Text>
              {current === k ? <Pill value="current" tone="green" /> : p.popular ? <Pill value="popular" tone="orange" /> : null}
            </View>
            <Text style={S.small}>{p.members == null && !p.custom ? 'Unlimited members' : p.members ? `Up to ${p.members} members` : 'Multi-branch chains'}</Text>
            {total != null ? (
              <View style={{ marginVertical: 8 }}>
                <Text style={{ fontFamily: 'Inter-Bold', fontSize: 26, color: C.black }}>{rupees(total / months)}<Text style={S.small}> /mo</Text></Text>
                <Text style={S.small}>{months > 1 ? `${rupees(total)} billed every ${months} months · excl. GST` : 'excl. GST'}</Text>
              </View>
            ) : <Text style={[S.h1, { marginVertical: 8 }]}>Custom</Text>}
            {p.features.map((f: string) => <Text key={f} style={[S.body, { fontSize: 13, marginBottom: 2 }]}>✓ {f}</Text>)}
            <Text style={[S.label, { marginTop: 8 }]}>{p.limits?.branches == null ? '∞' : p.limits.branches} branch{p.limits?.branches === 1 ? '' : 'es'} · {p.limits?.staff == null ? '∞' : p.limits.staff} staff</Text>
          </RCard>
        );
      })}

      <Panel title="Change or renew plan">
        <Text style={[S.body, { marginBottom: 10 }]}>Plan payments are made on the NestGym web dashboard. Sign in there with the same account to upgrade or renew.</Text>
        <Btn label="Open web dashboard" onPress={() => Linking.openURL(`${WEB_APP_URL}/subscription`)} />
        <View style={{ height: 8 }} />
        <Btn light label="Talk to sales" onPress={() => Linking.openURL('mailto:sales@pixelatenest.com?subject=NestGym%20Enterprise')} />
      </Panel>

      <Panel title="Payment history">
        {(invRes.data?.data || []).length === 0 ? <Empty text="No payments yet" /> : (invRes.data?.data || []).map((v: any) => (
          <View key={v._id} style={{ marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
            <View style={S.rowBetween}><Text style={S.h3}>{v.invoiceNumber}</Text><Pill value={v.status} /></View>
            <Row k={`${titleCase(v.plan)} · ${titleCase(v.billingCycle)}`} v={v.paidAt ? fmtDate(v.paidAt) : ''} />
          </View>
        ))}
      </Panel>
    </Screen>
  );
}
