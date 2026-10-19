// Member-facing app (role "member"): same data as the web MemberPortal.
import React, { useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RazorpayCheckout from 'react-native-razorpay';
import { CalendarDays, CreditCard, Dumbbell, Home, LineChart, LogOut, Plus } from 'lucide-react-native';
import { gym } from '../api/gym';
import { useAuth } from '../contexts/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { C, FONT, S } from '../theme';
import { daysFromNow, fmtDate, fmtDateTime, inr, titleCase } from '../utils/format';
import { Btn, Empty, Input, Loader, Panel, Pill, Row, Screen, Sheet, StatCard, StatGrid, brut, notify, RCard } from '../components/ui';

const TABS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'pay', label: 'Bills', icon: CreditCard },
  { id: 'classes', label: 'Classes', icon: CalendarDays },
  { id: 'plans', label: 'My plan', icon: Dumbbell },
  { id: 'progress', label: 'Progress', icon: LineChart },
];
const get = gym.portal.get;
const post = gym.portal.post;

export default function MemberPortalScreen() {
  const { logout } = useAuth();
  const [tab, setTab] = useState('home');
  const [log, setLog] = useState<any>(null);

  const ov = useFetch(() => get('/overview'), []);
  const inv = useFetch(() => get('/invoices'), [], tab === 'pay');
  const ses = useFetch(() => get('/classes/sessions?days=7'), [], tab === 'classes');
  const mine = useFetch(() => get('/classes/mine'), [], tab === 'classes');
  const plans = useFetch(() => get('/plans'), [], tab === 'plans' || tab === 'progress');
  const ann = useFetch(() => get('/announcements'), [], tab === 'home');
  const refresh = () => [ov, inv, ses, mine, plans, ann].forEach(f => f.reload());

  const o = ov.data?.data;
  const confirmLogout = () => Alert.alert('Sign out?', undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: logout }]);

  const book = async (s: any) => {
    try { const r = await post('/classes/book', { classId: s.classId, sessionDate: s.sessionDate }); notify.success(r.waitlisted ? 'Added to waitlist' : 'Booked!', s.name); refresh(); } catch (e: any) { notify.error('Could not book', e.message); }
  };
  const [paying, setPaying] = useState('');
  // Same server flow as the web portal: order on the gym's own Razorpay, then signature + amount checked server-side.
  const payOnline = async (invoice: any) => {
    try {
      setPaying(invoice._id);
      const d = (await post(`/invoices/${invoice._id}/pay`)).data;
      const r = await RazorpayCheckout.open({
        key: d.key,
        order_id: d.orderId,
        amount: d.amount,
        currency: d.currency || 'INR',
        name: o?.gym?.name || 'Gym',
        description: `Invoice ${d.invoiceNumber}`,
        prefill: { name: d.name, contact: d.phone, email: d.email },
        theme: { color: C.primary },
      });
      await post(`/invoices/${invoice._id}/verify`, { razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature });
      notify.success('Payment received', 'Thank you!');
      refresh();
    } catch (e: any) {
      // code 0 = the member closed the Razorpay sheet; nothing to report
      if (e?.code !== 0) notify.error('Payment failed', e?.description || e?.message || 'Please try again.');
    } finally {
      setPaying('');
    }
  };
  const cancel = async (id: string) => {
    try { await post(`/classes/bookings/${id}/cancel`); notify.success('Booking cancelled'); refresh(); } catch (e: any) { notify.error('Failed', e.message); }
  };

  if (ov.loading && !o) return <Screen title="NestGym"><Loader /></Screen>;
  if (ov.error || !o) return (
    <Screen title="NestGym">
      <Text style={[S.h3, { textAlign: 'center', marginBottom: 12 }]}>{ov.error || 'Could not load your profile'}</Text>
      <Btn label="Sign out" onPress={logout} />
    </Screen>
  );

  const m = o.access.membership;
  const left = m ? daysFromNow(m.endDate) : null;
  const meas = plans.data?.data?.measurements || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={{ backgroundColor: C.primary, borderBottomWidth: 2, borderBottomColor: C.black, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: '#fff' }} numberOfLines={1}>{o.gym.name || 'Your gym'}</Text>
          <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: '#DBEAFE' }}>{o.member.name} · {o.member.memberCode}</Text>
        </View>
        <TouchableOpacity onPress={confirmLogout} style={brut({ width: 36, height: 36, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderRightWidth: 2, borderBottomWidth: 2 })}>
          <LogOut size={16} color={C.black} />
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        <PortalBody tab={tab} {...{ paying, payOnline, o, m, left, inv, ses, mine, plans, ann, meas, book, cancel, setLog, setTab, refresh, ov }} />
      </View>

      <View style={{ flexDirection: 'row', borderTopWidth: 2, borderTopColor: C.black, backgroundColor: C.white }}>
        {TABS.map(t => {
          const on = tab === t.id;
          return (
            <TouchableOpacity key={t.id} onPress={() => setTab(t.id)} style={{ flex: 1, alignItems: 'center', paddingVertical: 8, backgroundColor: on ? C.secondary : C.white }}>
              <t.icon size={20} color={on ? '#fff' : C.black} />
              <Text style={{ fontFamily: FONT.bold, fontSize: 9, textTransform: 'uppercase', color: on ? '#fff' : C.black, marginTop: 2 }}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Sheet visible={!!log} title="Log a check-in" onClose={() => setLog(null)} footer={<><Btn light label="Cancel" onPress={() => setLog(null)} /><Btn label="Save" onPress={async () => { try { await post('/measurements', { weightKg: log.weightKg && Number(log.weightKg), bodyFatPct: log.bodyFatPct && Number(log.bodyFatPct), waistCm: log.waistCm && Number(log.waistCm), notes: log.notes }); notify.success('Saved'); setLog(null); refresh(); } catch (e: any) { notify.error('Could not save', e.message); } }} /></>}>
        <Input label="Weight (kg)" keyboardType="decimal-pad" value={log?.weightKg ?? ''} onChangeText={v => setLog({ ...log, weightKg: v })} />
        <Input label="Body fat (%)" keyboardType="decimal-pad" value={log?.bodyFatPct ?? ''} onChangeText={v => setLog({ ...log, bodyFatPct: v })} />
        <Input label="Waist (cm)" keyboardType="decimal-pad" value={log?.waistCm ?? ''} onChangeText={v => setLog({ ...log, waistCm: v })} />
        <Input label="Note" value={log?.notes ?? ''} onChangeText={v => setLog({ ...log, notes: v })} />
      </Sheet>
    </SafeAreaView>
  );
}

// Body is a plain ScrollView so the header/tab bar stay fixed.
function PortalBody({ tab, paying, payOnline, o, m, left, inv, ses, mine, plans, ann, meas, book, cancel, setLog, setTab, refresh, ov }: any) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={ov.loading} onRefresh={refresh} tintColor={C.primary} />}>
      {tab === 'home' && (
        <>
          <RCard style={brut({ backgroundColor: o.access.allowed ? '#DCFCE7' : '#FEE2E2', padding: 14, marginBottom: 14 })}>
            <Text style={S.label}>Membership</Text>
            <Text style={S.h1}>{m?.planName || 'No active plan'}</Text>
            {m && <Text style={S.body}>{fmtDate(m.startDate)} → {fmtDate(m.endDate)} · {left < 0 ? `expired ${-left} days ago` : `${left} days left`}</Text>}
            {!o.access.allowed && <Text style={[S.body, { color: '#B91C1C', marginTop: 4 }]}>{o.access.reason}</Text>}
            {(o.access.warnings || []).map((w: string) => <Text key={w} style={[S.small, { color: '#C2410C' }]}>⚠ {w}</Text>)}
          </RCard>
          <StatGrid>
            <StatCard label="To pay" value={inr(o.due)} color={o.due > 0 ? '#EF4444' : '#14B8A6'} onPress={() => setTab('pay')} />
          </StatGrid>
          {o.trainers.length > 0 && <Panel title="Your trainer">{o.trainers.map((t: any) => <Text key={t._id} style={S.body}>{t.trainerId?.name} <Text style={S.small}>{t.trainerId?.phone}</Text></Text>)}</Panel>}
          {o.pt.length > 0 && (
            <Panel title="Personal training">
              {o.pt.map((p: any) => {
                const used = p.sessions.filter((s: any) => ['completed', 'missed'].includes(s.status)).length;
                const next = p.sessions.filter((s: any) => s.status === 'scheduled').sort((a: any, b: any) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))[0];
                return <Text key={p._id} style={S.body}>{p.name}: {used}/{p.totalSessions} used{next ? ` · next ${fmtDateTime(next.scheduledAt)}` : ''}</Text>;
              })}
            </Panel>
          )}
          {o.locker && <Panel title="Locker"><Text style={S.body}>#{o.locker.number} · till {fmtDate(o.locker.validTill)}</Text></Panel>}
          <Panel title="Announcements">
            {(ann.data?.data || []).length === 0 ? <Text style={S.small}>Nothing new</Text> : ann.data.data.slice(0, 4).map((a: any) => (
              <View key={a._id} style={{ borderLeftWidth: 4, borderLeftColor: C.secondary, paddingLeft: 8, marginBottom: 8 }}>
                <Text style={S.h3}>{a.pinned ? '📌 ' : ''}{a.title}</Text>
                <Text style={S.small}>{a.body}</Text>
              </View>
            ))}
          </Panel>
          {!!o.gym.phone && <Text style={[S.small, { textAlign: 'center' }]}>Need help? Call {o.gym.phone}</Text>}
        </>
      )}

      {tab === 'pay' && (
        <>
          {inv.loading && !inv.data ? <Loader /> : (inv.data?.data || []).length === 0 ? <Empty text="No bills yet" /> : inv.data.data.map((i: any) => (
            <RCard key={i._id} style={S.card}>
              <View style={S.rowBetween}><Text style={S.h3}>{i.invoiceNumber}</Text><Pill value={i.status} /></View>
              <Text style={S.small}>{fmtDate(i.issuedAt)} · {i.items?.[0]?.description}</Text>
              <Row k="Total" v={inr(i.totalAmount, 2)} />
              <Row k="Paid" v={inr(i.paidAmount, 2)} />
              {i.balance > 0 && <Row k="Due" v={inr(i.balance, 2)} bold color={C.danger} />}
              {['pending', 'partial'].includes(i.status) && (o.gym.onlinePayments ? <View style={{ marginTop: 10 }}><Btn color="#00A070" label={`Pay ${inr(i.balance, 2)} online`} busy={paying === i._id} onPress={() => payOnline(i)} /></View> : <Text style={[S.label, { marginTop: 6 }]}>Pay at the front desk</Text>)}
            </RCard>
          ))}
        </>
      )}

      {tab === 'classes' && (
        <>
          <Panel title="My bookings">
            {(mine.data?.data || []).length === 0 ? <Text style={S.small}>No upcoming bookings</Text> : mine.data.data.map((b: any) => (
              <View key={b._id} style={[S.rowBetween, { marginBottom: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={S.h3}>{b.classId?.name}</Text>
                  <Text style={S.small}>{fmtDateTime(b.sessionDate)} · {b.status}</Text>
                </View>
                <Btn small danger label="Cancel" onPress={() => cancel(b._id)} />
              </View>
            ))}
          </Panel>
          <Text style={[S.label, { marginBottom: 8 }]}>This week</Text>
          {ses.loading && !ses.data ? <Loader /> : (ses.data?.data || []).length === 0 ? <Empty text="No classes scheduled" /> : ses.data.data.map((s: any) => (
            <RCard key={s.classId + s.sessionDate} style={[S.card, S.rowBetween]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={S.h3}>{s.name}</Text>
                <Text style={S.small}>{fmtDateTime(s.sessionDate)} · {s.durationMin} min{s.trainer ? ` · ${s.trainer}` : ''}</Text>
                <Text style={S.label}>{s.seatsLeft} seats left</Text>
              </View>
              <Btn small color={s.seatsLeft ? C.primary : C.secondary} label={s.seatsLeft ? 'Book' : 'Waitlist'} onPress={() => book(s)} />
            </RCard>
          ))}
        </>
      )}

      {tab === 'plans' && (
        <>
          {plans.data?.data?.workout ? (
            <Panel title={`Workout — ${plans.data.data.workout.name}`}>
              <Text style={[S.small, { marginBottom: 8 }]}>{titleCase(plans.data.data.workout.goal)} · {plans.data.data.workout.weeks} weeks{plans.data.data.workout.trainerId ? ` · by ${plans.data.data.workout.trainerId.name}` : ''}</Text>
              {plans.data.data.workout.days.map((d: any) => (
                <View key={d.label} style={{ marginBottom: 10 }}>
                  <Text style={S.h3}>{d.label} <Text style={S.small}>{d.focus}</Text></Text>
                  {d.exercises.map((e: any, i: number) => <Row key={i} k={e.name} v={`${e.sets}×${e.reps}${e.weightKg ? ` · ${e.weightKg} kg` : ''}`} />)}
                </View>
              ))}
            </Panel>
          ) : <Panel title="Workout"><Text style={S.small}>Your trainer hasn't assigned a plan yet</Text></Panel>}
          {plans.data?.data?.diet ? (
            <Panel title={`Diet — ${plans.data.data.diet.name}`}>
              <Text style={[S.small, { marginBottom: 8 }]}>{plans.data.data.diet.targetCalories ?? '—'} kcal · {plans.data.data.diet.targetProteinG ?? '—'} g protein · {plans.data.data.diet.waterLitres} L water</Text>
              {plans.data.data.diet.meals.map((x: any, i: number) => <Text key={i} style={S.body}><Text style={{ fontFamily: FONT.bold }}>{titleCase(x.slot)}</Text> — {x.items}</Text>)}
              {!!plans.data.data.diet.avoid && <Text style={[S.small, { color: '#B91C1C', marginTop: 8 }]}>Avoid: {plans.data.data.diet.avoid}</Text>}
            </Panel>
          ) : <Panel title="Diet"><Text style={S.small}>No diet plan yet</Text></Panel>}
        </>
      )}

      {tab === 'progress' && (
        <>
          <View style={{ alignItems: 'flex-end', marginBottom: 12 }}>
            <Btn small label="Log today" icon={<Plus size={14} color="#fff" />} onPress={() => setLog({ weightKg: '', bodyFatPct: '', waistCm: '', notes: '' })} />
          </View>
          {meas.length === 0 ? <Empty text="No check-ins yet — log your weight to start tracking" /> : meas.map((x: any) => (
            <RCard key={x._id} style={S.card}>
              <Row k={fmtDate(x.measuredAt)} v={[x.weightKg && `${x.weightKg} kg`, x.bmi && `BMI ${x.bmi}`, x.bodyFatPct && `${x.bodyFatPct}% fat`].filter(Boolean).join(' · ')} bold />
            </RCard>
          ))}
        </>
      )}
    </ScrollView>
  );
}
