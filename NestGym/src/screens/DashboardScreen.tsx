import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  BadgeCheck, BadgeX, Boxes, Clock3, IndianRupee, Receipt, Users, Wallet, Wrench,
} from 'lucide-react-native';
import { gym } from '../api/gym';
import { request } from '../api/api';
import { isManager, useAuth } from '../contexts/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { C, S } from '../theme';
import { fmtDate, inr } from '../utils/format';
import { Empty, Loader, Panel, Screen, StatCard, StatGrid, brut } from '../components/ui';
import { BarChart } from '../components/charts';

const I = (Comp: any) => <Comp size={14} color="#fff" />;
const hhmm = (d: string) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export default function DashboardScreen() {
  const nav = useNavigation<any>();
  const { user, tenant } = useAuth();
  const manager = isManager(user);
  const money = !!user && ['gym_owner', 'branch_manager', 'accountant'].includes(user.role);
  const desk = !!user && ['gym_owner', 'branch_manager', 'receptionist'].includes(user.role);

  const sum = useFetch(() => gym.dashboard.summary(), []);
  const charts = useFetch(() => gym.dashboard.charts(), []);
  const renew = useFetch(() => gym.reports.renewals({ days: 7, includeLapsed: 'false' }), [], desk);
  const dues = useFetch(() => gym.reports.dues(), [], money);
  const ann = useFetch(() => gym.announcements.active(), []);
  const sessions = useFetch(() => gym.classes.sessions({ days: 1 }), []);
  const bday = useFetch(() => gym.reports.birthdays(), [], desk);
  const log = useFetch(() => request<any>('/activity?limit=8').catch(() => ({ data: [] })), [], manager);

  const refreshAll = () => [sum, charts, renew, dues, ann, sessions, bday, log].forEach(f => f.reload());
  const st = sum.data?.data || {};
  const ch = charts.data?.data || {};
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().getDate();
  const birthdays = (bday.data?.data || []).filter((m: any) => m.day === today);
  const daysLeft = tenant?.planExpiresAt ? Math.ceil((new Date(tenant.planExpiresAt).getTime() - Date.now()) / 86400000) : null;

  const List = ({ items, empty }: { items: React.ReactNode[]; empty: string }) =>
    items.length === 0 ? <Empty text={empty} /> : <View style={{ gap: 8 }}>{items}</View>;
  const LRow = ({ left, right, color, onPress }: { left: string; right: string; color?: string; onPress?: () => void }) => (
    <TouchableOpacity disabled={!onPress} onPress={onPress} style={[S.rowBetween, { borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 6 }]}>
      <Text style={[S.body, { flex: 1, fontFamily: 'DMSans-Bold' }]} numberOfLines={1}>{left}</Text>
      <Text style={[S.small, { color: color || C.black }]}>{right}</Text>
    </TouchableOpacity>
  );

  if (sum.loading && !sum.data) return <Screen title="Dashboard"><Loader /></Screen>;

  return (
    <Screen title="Dashboard" refreshing={sum.loading} onRefresh={refreshAll}>
      <Text style={S.h1}>{greeting}, {user?.name?.split(' ')[0]}</Text>
      <Text style={[S.small, { marginBottom: 14 }]}>Here's what's happening at your gym today</Text>

      {tenant?.plan === 'trial' && user?.role === 'gym_owner' && (
        <TouchableOpacity onPress={() => nav.navigate('Subscription')} style={brut({ backgroundColor: '#FFF1E6', padding: 12, marginBottom: 14 })}>
          <Text style={S.body}>
            Free trial{daysLeft != null ? `: ${Math.max(0, daysLeft)} days left` : ''} — pick a plan to keep your data flowing →
          </Text>
        </TouchableOpacity>
      )}

      <StatGrid>
        {money && <StatCard label="Collected today" value={inr(st.todayRevenue)} icon={I(IndianRupee)} color="#00C48C" />}
        <StatCard label="New members today" value={st.newMembersToday ?? 0} icon={I(Users)} color="#14B8A6" />
        <StatCard label="Active memberships" value={st.activeMemberships ?? 0} icon={I(BadgeCheck)} color="#84CC16" />
        <StatCard label="Expired" value={st.expiredMemberships ?? 0} icon={I(BadgeX)} color="#EF4444" />
        <StatCard label="Renewals (7 days)" value={st.pendingRenewals ?? 0} icon={I(Clock3)} color="#FA731C" />
        {money && <StatCard label="This month" value={inr(st.monthlyRevenue)} icon={I(Wallet)} color="#00C48C" />}
        {money && <StatCard label="Dues outstanding" value={inr(st.pendingPayments)} sub={`${st.membersWithDues ?? 0} members`} icon={I(Receipt)} color={st.pendingPayments > 0 ? '#EF4444' : '#14B8A6'} />}
        <StatCard label="Low-stock products" value={st.lowStockProducts ?? 0} icon={I(Boxes)} color={st.lowStockProducts ? '#EF4444' : '#14B8A6'} />
        <StatCard label="Equipment service due" value={st.equipmentServiceDue ?? 0} icon={I(Wrench)} color={st.equipmentServiceDue ? '#FA731C' : '#14B8A6'} />
      </StatGrid>

      {money && (
        <Panel title="Collections — last 30 days">
          <BarChart data={(ch.revenueByDay || []).map((d: any) => ({ label: String(d.date).slice(8), value: d.revenue }))} color="#024BAB" fmt={inr} />
        </Panel>
      )}
      <Panel title="New memberships — 12 months">
        <BarChart data={(ch.membershipGrowth || []).map((d: any) => ({ label: String(d.month).slice(-2), value: d.newMemberships }))} color="#00C48C" />
      </Panel>

      <Panel title="Today's classes" right={<Text style={[S.label, { color: C.primary }]} onPress={() => nav.navigate('Classes')}>All</Text>}>
        <List empty="No classes left today" items={(sessions.data?.data || []).slice(0, 6).map((x: any) => <LRow key={x.classId + x.sessionDate} left={`${hhmm(x.sessionDate)} · ${x.name}`} right={`${x.booked}/${x.capacity}`} />)} />
      </Panel>
      {desk && (
        <Panel title="Renew this week" right={<Text style={[S.label, { color: C.primary }]} onPress={() => nav.navigate('Reports')}>All</Text>}>
          <List empty="Nobody expiring" items={(renew.data?.data || []).slice(0, 6).map((r: any) => <LRow key={r.membershipId} left={r.member.name} right={r.daysLeft <= 0 ? 'today' : `${r.daysLeft}d`} color={r.daysLeft <= 2 ? C.danger : '#C2410C'} onPress={() => nav.navigate('MemberProfile', { id: r.member._id })} />)} />
        </Panel>
      )}
      {money && (
        <Panel title="Biggest dues" right={<Text style={[S.label, { color: C.primary }]} onPress={() => nav.navigate('Reports')}>All</Text>}>
          <List empty="All clear" items={(dues.data?.data || []).slice(0, 6).map((r: any, i: number) => <LRow key={i} left={r.member?.name} right={inr(r.due)} color={C.danger} onPress={() => nav.navigate('MemberProfile', { id: r.member?._id })} />)} />
        </Panel>
      )}
      <Panel title="Announcements">
        <List empty="Nothing posted" items={(ann.data?.data || []).slice(0, 4).map((a: any) => (
          <View key={a._id} style={{ borderLeftWidth: 4, borderLeftColor: C.secondary, paddingLeft: 8 }}>
            <Text style={S.h3}>{a.pinned ? '📌 ' : ''}{a.title}</Text>
            <Text style={S.small} numberOfLines={2}>{a.body}</Text>
          </View>
        ))} />
      </Panel>
      {desk && (
        <Panel title="Birthdays today">
          <List empty="None today" items={birthdays.map((m: any) => <LRow key={m._id} left={`🎂 ${m.name}`} right={m.phone} />)} />
        </Panel>
      )}
      {manager && (
        <Panel title="Recent activity">
          <List empty="No activity yet" items={(log.data?.data || []).slice(0, 8).map((a: any) => (
            <Text key={a._id} style={S.small}><Text style={{ fontFamily: 'DMSans-Bold', color: C.black }}>{a.userName}</Text> {a.description} · {fmtDate(a.timestamp)}</Text>
          ))} />
        </Panel>
      )}
    </Screen>
  );
}
