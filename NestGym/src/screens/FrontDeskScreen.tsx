import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Clock, DoorOpen, Users } from 'lucide-react-native';
import { gym } from '../api/gym';
import { isManager, useAuth } from '../contexts/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { C, S } from '../theme';
import { fmtDate, fmtDateTime, fmtTime, titleCase, todayStr } from '../utils/format';
import { MemberPicker } from '../components/pickers';
import { Btn, Empty, Input, Loader, Panel, Pill, Screen, StatCard, StatGrid, brut, notify, RCard } from '../components/ui';

const I = (Comp: any) => <Comp size={14} color="#fff" />;
const since = (d: string) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

export default function FrontDeskScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const manager = isManager(user);
  const [member, setMember] = useState<any>(null);
  const [access, setAccess] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const day = todayStr();

  const live = useFetch(() => gym.attendance.live(), []);
  const log = useFetch(() => gym.attendance.list({ startDate: day, endDate: day, limit: 100 }), [day]);
  const L = live.data?.data || { insideCount: 0, todayCheckins: 0, inside: [] };

  useEffect(() => {
    setAccess(null);
    setReason('');
    if (member) gym.attendance.accessCheck({ memberId: member._id }).then(r => setAccess(r.data)).catch(e => notify.error('Check failed', e.message));
  }, [member]);

  // the web desk polls every 20s; do the same while this screen is mounted
  useEffect(() => {
    const t = setInterval(() => live.reload(), 20_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = () => { live.reload(); log.reload(); };
  const checkin = async (override = false) => {
    try {
      setBusy(true);
      const r = await gym.attendance.checkin({ memberId: member._id, method: 'manual', ...(override ? { override: true, overrideReason: reason } : {}) });
      notify.success('Checked in', [member.name, ...(r.warnings || [])].join(' · '));
      setMember(null);
      refresh();
    } catch (e: any) {
      notify.error('Entry refused', e.message);
    } finally {
      setBusy(false);
    }
  };
  const checkout = async (id: string) => {
    try { await gym.attendance.checkout({ attendanceId: id }); refresh(); } catch (e: any) { notify.error('Failed', e.message); }
  };

  return (
    <Screen title="Front Desk" refreshing={live.loading} onRefresh={refresh}>
      <StatGrid>
        <StatCard label="Inside now" value={L.insideCount} icon={I(DoorOpen)} color="#00C48C" />
        <StatCard label="Check-ins today" value={L.todayCheckins} icon={I(Users)} color="#024BAB" />
        <StatCard label="Longest inside" value={L.inside.length ? since(L.inside[L.inside.length - 1].checkinAt) : '—'} icon={I(Clock)} color="#FA731C" />
      </StatGrid>

      <Panel title="Check a member in">
        <MemberPicker label="Find member" value={member} onChange={setMember} />
        {access && (
          <RCard style={brut({ backgroundColor: access.allowed ? '#DCFCE7' : '#FEE2E2', padding: 14 })}>
            <Text style={S.h2}>{access.allowed ? 'Welcome in' : 'Entry blocked'}</Text>
            <Text style={[S.body, { marginTop: 2 }]}>
              {access.allowed ? `${access.membership?.planName} · valid till ${fmtDate(access.membership.endDate)}` : access.reason}
            </Text>
            {(access.warnings || []).map((w: string) => <Text key={w} style={[S.small, { color: '#C2410C', marginTop: 4 }]}>⚠ {w}</Text>)}
            <View style={{ marginTop: 12, gap: 10 }}>
              {access.allowed && <Btn color="#00A070" label="Check in" busy={busy} onPress={() => checkin()} />}
              {!access.allowed && access.overridable && manager && (
                <>
                  <Input label="Override reason" value={reason} onChangeText={setReason} placeholder="Why are you letting them in?" />
                  <Btn color={C.secondary} label="Let in anyway" busy={busy} disabled={!reason.trim()} onPress={() => checkin(true)} />
                </>
              )}
              {!access.allowed && access.overridable && !manager && <Text style={S.small}>Ask a manager to approve entry.</Text>}
              <Btn light small label="Open profile →" onPress={() => nav.navigate('MemberProfile', { id: member._id })} />
            </View>
          </RCard>
        )}
      </Panel>

      <Panel title={`Inside now (${L.insideCount})`}>
        {live.loading && !live.data ? <Loader /> : L.inside.length === 0 ? <Empty text="Nobody inside" /> : L.inside.map((a: any) => (
          <View key={a._id} style={[S.rowBetween, { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }]}>
            <View style={{ flex: 1 }}>
              <Text style={S.h3}>{a.memberId?.name || a.memberName}</Text>
              <Text style={S.small}>in {fmtTime(a.checkinAt)} · {since(a.checkinAt)}</Text>
            </View>
            <Btn small light label="Check out" onPress={() => checkout(a._id)} />
          </View>
        ))}
      </Panel>

      <Panel title="Today's log">
        {(log.data?.data || []).length === 0 ? <Empty text="No check-ins yet" /> : (log.data?.data || []).map((a: any) => (
          <View key={a._id} style={[S.rowBetween, { paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }]}>
            <View style={{ flex: 1 }}>
              <Text style={S.body}>{a.memberId?.name || a.memberName}</Text>
              <Text style={S.small}>{fmtDateTime(a.checkinAt)} → {a.checkoutAt ? fmtTime(a.checkoutAt) : 'inside'} · {titleCase(a.method)}</Text>
            </View>
            {!a.checkoutAt && <Pill value="inside" tone="green" />}
          </View>
        ))}
      </Panel>
    </Screen>
  );
}
