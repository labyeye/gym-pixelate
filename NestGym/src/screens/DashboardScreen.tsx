import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  BadgeCheck, BadgeX, Boxes, Clock3, Receipt, Users, Wrench,
} from 'lucide-react-native';
import { gym } from '../api/gym';
import { request } from '../api/api';
import { isManager, useAuth } from '../contexts/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { C, FONT, S } from '../theme';
import { fmtDate, inr } from '../utils/format';
import { Empty, Loader, Panel, brut } from '../components/ui';
import RangeChart from '../components/common/RangeChart';
import { canOpen } from '../navigation/navConfig';
import AppHeader from '../components/common/AppHeader';
import AnimatedBarChart from '../components/common/AnimatedBarChart';
import FadeInUp from '../components/motion/FadeInUp';
import AnimatedNumber from '../components/motion/AnimatedNumber';


export default function DashboardScreen() {
  const nav = useNavigation<any>();
  const { user, tenant, modules } = useAuth();
  const manager = isManager(user);
  const money = !!user && ['gym_owner', 'branch_manager', 'accountant'].includes(user.role);
  const showPos = !!user && canOpen(user.role, 'Pos', modules);
  const desk = !!user && ['gym_owner', 'branch_manager', 'receptionist'].includes(user.role);

  const sum = useFetch(() => gym.dashboard.summary(), []);
  const charts = useFetch(() => gym.dashboard.charts(), []);
  const renew = useFetch(() => gym.reports.renewals({ days: 7, includeLapsed: 'false' }), [], desk);
  const dues = useFetch(() => gym.reports.dues(), [], money);
  const ann = useFetch(() => gym.announcements.active(), []);
  const bday = useFetch(() => gym.reports.birthdays(), [], desk);
  const log = useFetch(() => request<any>('/activity?limit=8').catch(() => ({ data: [] })), [], manager);

  const refreshAll = () => [sum, charts, renew, dues, ann, bday, log].forEach(f => f.reload());
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

  if (sum.loading && !sum.data) return <SafeAreaView style={styles.safe} edges={['top']}><Loader /></SafeAreaView>;

  const stats: { label: string; value: number; icon: any; color: string; route?: string }[] = [
    { label: 'New Today', value: st.newMembersToday ?? 0, icon: Users, color: C.primary, route: 'Members' },
    { label: 'Active', value: st.activeMemberships ?? 0, icon: BadgeCheck, color: C.success, route: 'Members' },
    { label: 'Expired', value: st.expiredMemberships ?? 0, icon: BadgeX, color: C.danger, route: 'Members' },
    { label: 'Renewals 7d', value: st.pendingRenewals ?? 0, icon: Clock3, color: C.warning, route: 'Reports' },
  ];
  const go = (route?: string) => route && nav.navigate(route);
  const payCards = [
    { label: 'Collected today', value: st.todayRevenue ?? 0, color: C.primary },
    { label: 'This month', value: st.monthlyRevenue ?? 0, color: C.secondary },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        name={user?.name}
        avatar={user?.avatar}
        title="Dashboard"
        unread={(ann.data?.data || []).length}
        onMenu={() => nav.navigate('More')}
        onSearch={() => nav.navigate('Members')}
        onBell={() => nav.navigate('Announcements')}
        onAvatar={() => nav.navigate('Settings')}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={sum.loading} onRefresh={refreshAll} tintColor={C.primary} />}
        showsVerticalScrollIndicator={false}
      >
      {tenant?.plan === 'trial' && user?.role === 'gym_owner' && (
        <TouchableOpacity onPress={() => nav.navigate('Subscription')} style={brut({ backgroundColor: '#FFF1E6', padding: 12, marginBottom: 14 })}>
          <Text style={S.body}>
            Free trial{daysLeft != null ? `: ${Math.max(0, daysLeft)} days left` : ''} — pick a plan to keep your data flowing →
          </Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionLabel}>Overview</Text>
      <View style={styles.grid}>
        {stats.map((x, i) => {
          const Icon = x.icon;
          return (
            <FadeInUp key={x.label} delay={i * 70} style={styles.statCardWrap}>
              <TouchableOpacity style={styles.statCard} activeOpacity={0.8} onPress={() => go(x.route)}>
                <View style={[styles.statIconWrap, { backgroundColor: x.color + '1A', borderColor: x.color }]}>
                  <Icon size={14} color={x.color} />
                </View>
                <View style={styles.statBody}>
                  <Text style={styles.statLabel} numberOfLines={1}>{x.label}</Text>
                  <AnimatedNumber style={styles.statValue} value={x.value} />
                </View>
              </TouchableOpacity>
            </FadeInUp>
          );
        })}
      </View>
      {money && !!(ch.revenueByDay || []).length && (
        <RangeChart
          title="Collections"
          color={C.primary}
          format={inr}
          delay={stats.length * 70 + 140}
          daily={(ch.revenueByDay || []).map((d: any) => ({ key: d.date, value: d.revenue }))}
          monthly={(ch.revenueByMonth || []).map((d: any) => ({ key: d.month, value: d.revenue }))}
        />
      )}
      {showPos && !!(ch.posByDay || []).length && (
        <RangeChart
          title="Shop / POS revenue"
          color={C.secondary}
          format={inr}
          delay={stats.length * 70 + 180}
          daily={(ch.posByDay || []).map((d: any) => ({ key: d.date, value: d.revenue }))}
          monthly={(ch.posByMonth || []).map((d: any) => ({ key: d.month, value: d.revenue }))}
        />
      )}

      {money && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
          {payCards.map((p, i) => (
            <FadeInUp key={p.label} delay={stats.length * 70 + i * 70} style={styles.payCard}>
              <Text style={styles.payLabel}>{p.label}</Text>
              <Text style={[styles.payValue, { color: p.color }]} numberOfLines={1} adjustsFontSizeToFit>{inr(p.value)}</Text>
            </FadeInUp>
          ))}
        </View>
      )}

      
      {!!(ch.membersByDay || []).length && (
        <RangeChart
          title="New memberships"
          color={C.success}
          delay={stats.length * 70 + 220}
          daily={(ch.membersByDay || []).map((d: any) => ({ key: d.date, value: d.count }))}
          monthly={(ch.membershipGrowth || []).map((d: any) => ({ key: d.month, value: d.newMemberships }))}
        />
      )}

      {desk && (
        <Panel title="Renew this week" right={<Text style={[S.label, { color: C.primary }]} onPress={() => nav.navigate('Reports')}>All</Text>}>
          <List empty="Nobody expiring" items={(renew.data?.data || []).slice(0, 6).map((r: any) => <LRow key={r.membershipId} left={r.member.name} right={r.daysLeft <= 0 ? 'today' : `${r.daysLeft}d`} color={r.daysLeft <= 2 ? C.danger : '#C2410C'} onPress={() => nav.navigate('MemberProfile', { id: r.member._id })} />)} />
        </Panel>
      )}
      {desk && (
        <Panel title="Birthdays today">
          <List empty="None today" items={birthdays.map((m: any) => <LRow key={m._id} left={`🎂 ${m.name}`} right={m.phone} />)} />
        </Panel>
      )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 16, paddingBottom: 40 },
  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: C.textMuted, marginBottom: 10, marginTop: 10, letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  statCardWrap: { width: '22%', flexGrow: 1 },
  statCard: { flex: 1, borderWidth: 2, borderRadius: 8, borderRightWidth: 5, borderBottomWidth: 5, borderRightColor: '#0A0A0A', borderBottomColor: '#0A0A0A', borderColor: C.black, backgroundColor: C.white, padding: 12, flexDirection: 'column', alignItems: 'center', gap: 10 },
  statBody: { flex: 1, minWidth: 0, alignItems: 'center' },
  statIconWrap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderRadius: 50 },
  statValue: { fontSize: 19, fontWeight: '700', color: C.black },
  statLabel: { fontSize: 8, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'center' },
  card: { backgroundColor: C.white, borderWidth: 2, borderRadius: 8, borderRightWidth: 5, borderBottomWidth: 5, borderRightColor: '#0A0A0A', borderBottomColor: '#0A0A0A', borderColor: C.black, padding: 12, marginBottom: 4 },
  chartHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 10 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 2, borderColor: C.black, backgroundColor: C.white },
  pillText: { fontFamily: FONT.bold, fontSize: 12, color: C.black },
  payCard: { flex: 1, backgroundColor: C.white, borderWidth: 2, borderRadius: 8, borderRightWidth: 5, borderBottomWidth: 5, borderColor: C.black, borderRightColor: '#0A0A0A', borderBottomColor: '#0A0A0A', padding: 16, marginBottom: 12, marginHorizontal: 4 },
  payLabel: { fontFamily: FONT.bold, fontSize: 12, color: C.black, textTransform: 'uppercase' },
  payValue: { fontFamily: FONT.bold, fontSize: 26, fontWeight: '800', marginVertical: 4 },
});
