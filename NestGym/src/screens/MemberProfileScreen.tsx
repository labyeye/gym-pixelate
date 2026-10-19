import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { CalendarCheck, Sun, TrendingUp, Wallet } from 'lucide-react-native';
import { gym } from '../api/gym';
import { useFetch } from '../hooks/useFetch';
import { C, S } from '../theme';
import { daysFromNow, fmtDate, fmtDateTime, inr, titleCase, waLink } from '../utils/format';
import { Avatar } from '../components/PhotoPicker';
import { MembershipActionSheet, MsAction, PaymentSheet, SellMembershipSheet } from '../components/gymSheets';
import { Spark } from '../components/charts';
import { Btn, Empty, Loader, Panel, Pill, Row, Screen, Sheet, StatCard, StatGrid, Tabs, brut, notify, RCard } from '../components/ui';

const I = (Comp: any) => <Comp size={14} color="#fff" />;
const LIVE = ['active', 'frozen', 'upcoming'];

export default function MemberProfileScreen() {
  const { id } = useRoute<any>().params;
  const [tab, setTab] = useState('plans');
  const [sell, setSell] = useState<{ mode: 'sell' | 'renew' | 'upgrade'; membership?: any } | null>(null);
  const [act, setAct] = useState<{ m: any; a: MsAction } | null>(null);
  const [pay, setPay] = useState<{ inv: any; mode: 'pay' | 'refund' } | null>(null);
  const [portal, setPortal] = useState<any>(null);
  const { data, loading, reload } = useFetch(() => gym.members.overview(id), [id]);
  const o = data?.data;

  if (loading && !o) return <Screen title="Member" back><Loader /></Screen>;
  if (!o) return <Screen title="Member" back><Empty text="Could not load member" /></Screen>;

  const { member, memberships, invoices, measurements, pt, workout, diet, trainers, locker } = o;
  const current = memberships.find((m: any) => ['active', 'frozen'].includes(m.status) && new Date(m.endDate) >= new Date());
  const left = current ? daysFromNow(current.endDate) : null;
  const run = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); notify.success(ok); reload(); } catch (e: any) { notify.error('Failed', e.message); }
  };
  const weights = [...measurements].reverse().map((m: any) => m.weightKg).filter(Boolean);
  const wa = waLink(member.phone);

  return (
    <Screen title="Member Profile" back refreshing={loading} onRefresh={reload}>
      <RCard style={brut({ backgroundColor: C.white, padding: 14, marginBottom: 14 })}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Avatar uri={member.photo} name={member.name} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={S.h2} numberOfLines={1}>{member.name}</Text>
            <Text style={S.small}>{member.memberCode} · {member.phone}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              <Pill value={member.status} />
              {(member.health?.conditions || []).map((c: string) => <Pill key={c} value={c} tone="red" />)}
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          <Btn small label={current ? 'New plan' : 'Sell plan'} onPress={() => setSell({ mode: 'sell' })} />
          <Btn small color="#0D9488" label={member.userId ? 'Reset portal login' : 'Portal login'} onPress={async () => { try { const r = await gym.members.portalAccess(member._id); setPortal(r.data); reload(); } catch (e: any) { notify.error('Could not create login', e.message); } }} />
          {wa && <Btn small light label="WhatsApp" onPress={() => Linking.openURL(wa)} />}
        </View>
      </RCard>


      <StatGrid>
        <StatCard label="Plan" value={current?.planName || 'None'} sub={current ? `${fmtDate(current.startDate)} → ${fmtDate(current.endDate)}` : 'No active plan'} icon={I(CalendarCheck)} color="#024BAB" />
        <StatCard label="Days left" value={left === null ? '—' : Math.max(0, left)} sub={left !== null && left < 0 ? `expired ${-left}d ago` : undefined} icon={I(Sun)} color={left !== null && left <= 7 ? '#FA731C' : '#00C48C'} />
        <StatCard label="Outstanding" value={inr(o.due)} icon={I(Wallet)} color={o.due > 0 ? '#EF4444' : '#14B8A6'} />
        <StatCard label="Locker" value={locker ? `#${locker.number}` : 'None'} icon={I(TrendingUp)} color="#A855F7" />
      </StatGrid>

      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'plans', label: 'Memberships', count: memberships.length },
        { id: 'bills', label: 'Invoices', count: invoices.length },
        { id: 'progress', label: 'Progress', count: measurements.length },
        { id: 'train', label: 'Training' },
        { id: 'about', label: 'About' },
      ]} />

      {tab === 'plans' && (memberships.length === 0 ? <Empty text="No memberships yet" /> : memberships.map((m: any) => (
        <RCard key={m._id} style={S.card}>
          <View style={S.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={S.h3}>{m.planName}{m.isRenewal ? ' · Renewal' : ''}</Text>
              <Text style={S.small}>{fmtDate(m.startDate)} → {fmtDate(m.endDate)}{m.freezeDaysUsed ? ` · ${m.freezeDaysUsed}d frozen` : ''}</Text>
            </View>
            <Pill value={m.status} />
          </View>
          <Row k="Billed" v={inr(m.totalAmount)} />
          <Row k="Paid" v={inr(m.paidAmount)} />
          {m.dueAmount > 0 && <Row k="Due" v={inr(m.dueAmount)} color={C.danger} bold />}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {(LIVE.includes(m.status) || m.status === 'expired') && <Btn small label="Renew" onPress={() => setSell({ mode: 'renew', membership: m })} />}
            {m.status === 'active' && <Btn small light label="Upgrade" onPress={() => setSell({ mode: 'upgrade', membership: m })} />}
            {m.status === 'active' && <Btn small light label="Freeze" onPress={() => setAct({ m, a: 'freeze' })} />}
            {m.status === 'frozen' && <Btn small light label="Unfreeze" onPress={() => run(() => gym.memberships.unfreeze(m._id), 'Unfrozen')} />}
            {m.status === 'active' && <Btn small light label="Transfer" onPress={() => setAct({ m, a: 'transfer' })} />}
            {LIVE.includes(m.status) && <Btn small danger label="Cancel" onPress={() => setAct({ m, a: 'cancel' })} />}
          </View>
        </RCard>
      )))}

      {tab === 'bills' && (invoices.length === 0 ? <Empty text="No invoices yet" /> : invoices.map((v: any) => (
        <RCard key={v._id} style={S.card}>
          <View style={S.rowBetween}>
            <View>
              <Text style={S.h3}>{v.invoiceNumber}</Text>
              <Text style={S.small}>{fmtDate(v.issuedAt)}</Text>
            </View>
            <Pill value={v.status} />
          </View>
          <Row k="Total" v={inr(v.totalAmount, 2)} bold />
          <Row k="Paid" v={inr(v.paidAmount, 2)} />
          {v.balance > 0 && <Row k="Balance" v={inr(v.balance, 2)} color={C.danger} bold />}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {['pending', 'partial'].includes(v.status) && <Btn small label="Collect payment" onPress={() => setPay({ inv: v, mode: 'pay' })} />}
            {v.paidAmount > 0 && ['paid', 'partial'].includes(v.status) && <Btn small light label="Refund" onPress={() => setPay({ inv: v, mode: 'refund' })} />}
          </View>
        </RCard>
      )))}

      {tab === 'progress' && (
        <>
          <Panel title="Weight trend (kg)">
            <Spark points={weights} />
            <Text style={[S.small, { marginTop: 8 }]}>
              {member.fitness?.startWeightKg ? `Start ${member.fitness.startWeightKg} kg` : ''} {member.fitness?.targetWeightKg ? `· Target ${member.fitness.targetWeightKg} kg` : ''}
            </Text>
          </Panel>
          <Panel title="Log">
            {measurements.length === 0 ? <Empty text="No measurements yet" /> : measurements.map((m: any) => (
              <Row key={m._id} k={fmtDate(m.measuredAt)} v={[m.weightKg && `${m.weightKg} kg`, m.bmi && `BMI ${m.bmi}`, m.bodyFatPct && `${m.bodyFatPct}% fat`].filter(Boolean).join(' · ')} />
            ))}
          </Panel>
        </>
      )}

      {tab === 'train' && (
        <>
          <Panel title="Trainers">
            {trainers.length === 0 ? <Text style={S.small}>None assigned</Text> : trainers.map((t: any) => <Text key={t._id} style={S.body}>{t.trainerId?.name} <Text style={S.small}>{t.trainerId?.phone}</Text></Text>)}
          </Panel>
          <Panel title="Personal training">
            {pt.length === 0 ? <Text style={S.small}>No PT packages</Text> : pt.map((p: any) => (
              <View key={p._id} style={[S.rowBetween, { marginBottom: 6 }]}>
                <Text style={[S.body, { flex: 1 }]}>{p.name} · {p.trainerId?.name}</Text>
                <Text style={S.small}>{p.remainingSessions}/{p.totalSessions} left</Text>
              </View>
            ))}
          </Panel>
          <Panel title="Workout plan">
            {workout ? (
              <View>
                <Text style={S.h3}>{workout.name}</Text>
                <Text style={[S.small, { marginBottom: 6 }]}>{titleCase(workout.goal)} · {workout.days.length} day split · {workout.weeks} weeks</Text>
                {workout.days.map((d: any) => <Text key={d.label} style={S.body}><Text style={{ fontFamily: 'DMSans-Bold' }}>{d.label}</Text> — {d.exercises.map((e: any) => e.name).join(', ')}</Text>)}
              </View>
            ) : <Text style={S.small}>No active workout plan</Text>}
          </Panel>
          <Panel title="Diet plan">
            {diet ? (
              <View>
                <Text style={S.h3}>{diet.name}</Text>
                <Text style={[S.small, { marginBottom: 6 }]}>{diet.targetCalories} kcal · {diet.targetProteinG} g protein · {titleCase(diet.type)}</Text>
                {diet.meals.map((m: any, i: number) => <Text key={i} style={S.body}><Text style={{ fontFamily: 'DMSans-Bold' }}>{titleCase(m.slot)}</Text> — {m.items}</Text>)}
              </View>
            ) : <Text style={S.small}>No active diet plan</Text>}
          </Panel>
        </>
      )}

      {tab === 'about' && (
        <>
          <Panel title="Details">
            {([['Gender', member.gender], ['Date of birth', fmtDate(member.dob)], ['Occupation', member.occupation], ['Address', [member.address, member.city, member.state, member.pincode].filter(Boolean).join(', ')], ['Source', titleCase(member.source)], ['Joined', fmtDate(member.joinedOn || member.createdAt)]] as [string, any][]).map(([k, v]) => <Row key={k} k={k} v={v || '—'} />)}
          </Panel>
          <Panel title="Health & emergency">
            {([['Blood group', member.health?.bloodGroup], ['Allergies', member.health?.allergies], ['Medications', member.health?.medications], ['Injuries', member.health?.injuries], ['Doctor clearance', member.health?.doctorClearance ? 'Yes' : 'No'], ['Waiver signed', fmtDate(member.health?.declarationSignedAt)], ['Emergency contact', [member.emergencyContact?.name, member.emergencyContact?.phone, member.emergencyContact?.relation].filter(Boolean).join(' · ')]] as [string, any][]).map(([k, v]) => <Row key={k} k={k} v={v || '—'} />)}
          </Panel>
        </>
      )}

      <SellMembershipSheet open={!!sell} mode={sell?.mode} member={member} membership={sell?.membership} onClose={() => { setSell(null); reload(); }} />
      <MembershipActionSheet membership={act?.m || null} action={act?.a || null} onClose={() => { setAct(null); reload(); }} />
      <PaymentSheet invoice={pay?.inv || null} mode={pay?.mode} onClose={() => { setPay(null); reload(); }} />

      <Sheet
        visible={!!portal}
        title="Member portal login"
        subtitle={portal?.memberName}
        onClose={() => setPortal(null)}
        footer={
          <>
            <Btn light label="Done" onPress={() => setPortal(null)} />
            {wa && <Btn color="#25D366" label="Send on WhatsApp" onPress={() => Linking.openURL(waLink(member.phone, `Hi ${member.name}, your gym app login — ID: ${portal.login} Password: ${portal.password} . Sign in on the NestGym app and change your password.`)!)} />}
          </>
        }
      >
        <Text style={[S.body, { marginBottom: 10 }]}>Share these once — the password is not shown again.</Text>
        <RCard style={brut({ padding: 12, backgroundColor: C.white })}>
          <Text style={S.label}>Login ID</Text>
          <Text style={[S.h3, { marginBottom: 8 }]} selectable>{portal?.login}</Text>
          <Text style={S.label}>Password</Text>
          <Text style={S.h2} selectable>{portal?.password}</Text>
        </RCard>
        {member.userId && <View style={{ marginTop: 12 }}><Btn light label="Disable portal access" onPress={async () => { await gym.members.revokePortal(member._id); notify.success('Portal access disabled'); setPortal(null); reload(); }} /></View>}
      </Sheet>
    </Screen>
  );
}
