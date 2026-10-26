import React, { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { gym } from '../../api/gym';
import { isManager, useAuth } from '../../contexts/AuthContext';
import { useFetch } from '../../hooks/useFetch';
import { C, S } from '../../theme';
import { fmtDate, fmtDateTime, inr, titleCase } from '../../utils/format';
import { MemberPicker, useTrainers } from '../../components/pickers';
import { Btn, CheckField, Empty, Input, Loader, Pill, Row, Screen, Select, Sheet, StatCard, StatGrid, Tabs, notify, RCard, Pair } from '../../components/ui';
import { CalendarDays as StatCalendarDays, Clock3 as StatClock3, Dumbbell as StatDumbbell, IndianRupee as StatIndianRupee, Layers as StatLayers } from 'lucide-react-native';
import ExportSheet, { ExportSpec } from '../../components/ExportSheet';
import { Download as ExportIcon } from 'lucide-react-native';

/* ------------------------------------------------------------------ group classes */
const CATS = ['yoga', 'zumba', 'hiit', 'crossfit', 'spin', 'pilates', 'aerobics', 'martial_arts', 'dance', 'other'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const timeOf = (d: string) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const dayKey = (d: string) => new Date(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
const blank = { name: '', category: 'other', description: '', trainerId: '', room: '', capacity: '20', durationMin: '60', dropInPrice: '0', creditsRequired: '1', days: [] as number[], times: '06:30', isActive: true };

export function ClassesScreen() {
  const { user } = useAuth();
  const canWrite = user?.role === 'gym_owner' || isManager(user);
  const owner = user?.role === 'gym_owner';
  const trainers = useTrainers();
  const [tab, setTab] = useState('schedule');
  const [book, setBook] = useState<any>(null);
  const [member, setMember] = useState<any>(null);
  const [roster, setRoster] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState<any>(blank);
  const [busy, setBusy] = useState(false);

  const sess = useFetch(() => gym.classes.sessions({ days: 7 }), []);
  const classes = useFetch(() => gym.classes.list({ limit: 100 }), []);
  const rosterRes = useFetch(() => gym.classes.roster({ classId: roster.classId, sessionDate: roster.sessionDate }), [roster?.classId, roster?.sessionDate], !!roster);

  const sessions: any[] = useMemo(() => sess.data?.data || [], [sess.data]);
  const byDay = useMemo(() => sessions.reduce((m: Record<string, any[]>, s) => { (m[dayKey(s.sessionDate)] ||= []).push(s); return m; }, {} as Record<string, any[]>), [sessions]);
  const reload = () => { sess.reload(); classes.reload(); rosterRes.reload(); };
  const booked = sessions.reduce((s, x) => s + x.booked, 0);
  const seats = sessions.reduce((s, x) => s + x.capacity, 0);

  const act = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); notify.success(ok); reload(); } catch (e: any) { notify.error('Failed', e.message); }
  };
  const doBook = async () => {
    try {
      setBusy(true);
      const r = await gym.classes.book({ classId: book.classId, memberId: member._id, sessionDate: book.sessionDate });
      notify.success(r.waitlisted ? 'Added to waitlist' : 'Booked', `${member.name} · ${book.name}`);
      setBook(null); setMember(null); reload();
    } catch (e: any) { notify.error('Could not book', e.message); } finally { setBusy(false); }
  };
  const openEdit = (c?: any) => {
    if (!c) { setForm(blank); setEdit('new'); return; }
    const days = [...new Set<number>(c.schedule.map((s: any) => s.day))];
    const times = [...new Set<string>(c.schedule.map((s: any) => s.start))].join(', ');
    setForm({ ...blank, ...c, trainerId: c.trainerId?._id || '', capacity: String(c.capacity), durationMin: String(c.durationMin), dropInPrice: String(c.dropInPrice), creditsRequired: String(c.creditsRequired), days, times });
    setEdit(c);
  };
  const saveClass = async () => {
    const times = String(form.times).split(/[,\s]+/).filter(t => /^\d{1,2}:\d{2}$/.test(t)).map(t => t.padStart(5, '0'));
    if (!form.name.trim()) return notify.error('Class name is required');
    if (!form.days.length || !times.length) return notify.error('Pick at least one day and a start time (e.g. 06:30)');
    const body = { name: form.name, category: form.category, description: form.description, trainerId: form.trainerId || undefined, room: form.room, capacity: Number(form.capacity), durationMin: Number(form.durationMin), dropInPrice: Number(form.dropInPrice) || 0, creditsRequired: Number(form.creditsRequired) || 1, isActive: form.isActive, schedule: form.days.flatMap((day: number) => times.map(start => ({ day, start }))) };
    try {
      setBusy(true);
      if (edit === 'new') await gym.classes.create(body); else await gym.classes.update(edit._id, body);
      notify.success('Class saved'); setEdit(null); reload();
    } catch (e: any) { notify.error('Save failed', e.message); } finally { setBusy(false); }
  };
  const del = (c: any) => Alert.alert(`Delete ${c.name}?`, 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => act(() => gym.classes.remove(c._id), 'Class deleted') }]);

  return (
    <Screen title="Group Classes" refreshing={sess.loading && !!sess.data} onRefresh={reload} right={tab === 'classes' && canWrite ? <Btn small label="New" icon={<Plus size={14} color="#fff" />} onPress={() => openEdit()} /> : undefined}>
      <StatGrid>
        <StatCard label="Sessions (7 days)" value={sessions.length} icon={<StatCalendarDays />} color="#024BAB" />
        <StatCard label="Seats booked" value={booked} sub={seats ? `${Math.round((booked / seats) * 100)}% full` : undefined} icon={<StatCalendarDays />} color="#00C48C" />
        <StatCard label="On waitlists" value={sessions.reduce((s, x) => s + x.waitlisted, 0)} icon={<StatClock3 />} color="#FA731C" />
        <StatCard label="Active classes" value={(classes.data?.data || []).filter((c: any) => c.isActive).length} icon={<StatLayers />} color="#A855F7" />
      </StatGrid>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'schedule', label: 'Upcoming sessions' }, { id: 'classes', label: 'Class setup' }]} />

      {tab === 'schedule' && (sess.loading && !sess.data ? <Loader /> : sessions.length === 0 ? <Empty text="No sessions scheduled. Add a class with a weekly schedule." /> : (Object.entries(byDay) as [string, any[]][]).map(([day, list]) => (
        <View key={day}>
          <Text style={[S.label, { marginBottom: 8 }]}>{day}</Text>
          {list.map(s => {
            const full = s.seatsLeft === 0;
            return (
              <RCard key={s.classId + s.sessionDate} style={S.card}>
                <View style={S.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={S.h3}>{s.name}</Text>
                    <Text style={S.small}>{timeOf(s.sessionDate)} · {s.durationMin} min{s.room ? ` · ${s.room}` : ''}</Text>
                  </View>
                  <Pill value={s.category} tone="purple" />
                </View>
                <Text style={[S.small, { marginTop: 4 }]}>{s.trainer ? `with ${s.trainer}` : 'No trainer set'}</Text>
                <View style={{ height: 12, borderWidth: 2, borderColor: C.black, marginTop: 8 }}>
                  <View style={{ height: '100%', width: `${Math.min(100, (s.booked / s.capacity) * 100)}%`, backgroundColor: full ? C.danger : C.success }} />
                </View>
                <View style={[S.rowBetween, { marginTop: 8 }]}>
                  <Text style={S.label}>{s.booked}/{s.capacity} booked{s.waitlisted ? ` · ${s.waitlisted} waiting` : ''}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Btn small light label="Roster" onPress={() => setRoster(s)} />
                    {canWrite && <Btn small color={full ? C.secondary : C.primary} label={full ? 'Waitlist' : 'Book'} onPress={() => { setBook(s); setMember(null); }} />}
                  </View>
                </View>
              </RCard>
            );
          })}
        </View>
      )))}

      {tab === 'classes' && ((classes.data?.data || []).length === 0 ? <Empty text="No classes yet" /> : (classes.data?.data || []).map((c: any) => (
        <RCard key={c._id} style={S.card}>
          <View style={S.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={S.h3}>{c.name}</Text>
              <Text style={S.small}>{titleCase(c.category)}{c.room ? ` · ${c.room}` : ''}</Text>
            </View>
            <Pill value={c.isActive ? 'active' : 'inactive'} />
          </View>
          <Row k="Trainer" v={c.trainerId?.name || '—'} />
          <Row k="Schedule" v={`${[...new Set<number>(c.schedule.map((s: any) => s.day))].sort().map(d => DAYS[d]).join(' ')} · ${[...new Set(c.schedule.map((s: any) => s.start))].join(', ')}`} />
          <Row k="Capacity" v={c.capacity} />
          <Row k="Drop-in" v={c.dropInPrice ? inr(c.dropInPrice) : '—'} />
          {canWrite && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Btn small light label="Edit" onPress={() => openEdit(c)} />
              {owner && <Btn small danger label="Delete" onPress={() => del(c)} />}
            </View>
          )}
        </RCard>
      )))}

      <Sheet visible={!!book} title={`${book?.seatsLeft === 0 ? 'Join waitlist' : 'Book'} — ${book?.name || ''}`} subtitle={book ? `${dayKey(book.sessionDate)} · ${timeOf(book.sessionDate)}` : undefined} onClose={() => setBook(null)} footer={<><Btn light label="Cancel" onPress={() => setBook(null)} /><Btn label={book?.seatsLeft === 0 ? 'Join waitlist' : 'Book seat'} busy={busy} disabled={!member} onPress={doBook} /></>}>
        <MemberPicker value={member} onChange={setMember} required />
        <Text style={S.small}>Needs an active membership that includes classes (or a drop-in price on the class).</Text>
      </Sheet>

      <Sheet visible={!!roster} title={`Roster — ${roster?.name || ''}`} subtitle={roster ? `${dayKey(roster.sessionDate)} · ${timeOf(roster.sessionDate)}` : undefined} onClose={() => setRoster(null)} footer={<Btn light label="Close" onPress={() => setRoster(null)} />}>
        {(rosterRes.data?.data || []).length === 0 ? <Empty text="No bookings yet" /> : (rosterRes.data?.data || []).map((b: any) => (
          <View key={b._id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
            <View style={S.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={S.h3}>{b.memberId?.name}</Text>
                <Text style={S.small}>{b.memberId?.phone}</Text>
              </View>
              <Pill value={b.status} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {b.status === 'booked' && <><Btn small label="Attended" onPress={() => act(() => gym.classes.mark(b._id, 'attended'), 'Marked attended')} /><Btn small light label="No-show" onPress={() => act(() => gym.classes.mark(b._id, 'no_show'), 'Marked no-show')} /></>}
              {['booked', 'waitlisted'].includes(b.status) && <Btn small danger label="Cancel booking" onPress={() => act(() => gym.classes.cancel(b._id), 'Booking cancelled')} />}
            </View>
          </View>
        ))}
      </Sheet>

      <Sheet visible={!!edit} title={edit === 'new' ? 'New class' : 'Edit class'} onClose={() => setEdit(null)} footer={<><Btn light label="Cancel" onPress={() => setEdit(null)} /><Btn label="Save class" busy={busy} onPress={saveClass} /></>}>
        <Pair>
          <Input label="Class name" required value={form.name} onChangeText={v => setForm({ ...form, name: v })} />
          <Select label="Category" options={CATS} value={form.category} onChange={v => setForm({ ...form, category: v })} />
        </Pair>
        <Pair>
          <Select label="Trainer" options={trainers} value={form.trainerId} onChange={v => setForm({ ...form, trainerId: v })} allowEmpty placeholder="— none —" />
          <Input label="Room / studio" value={form.room} onChangeText={v => setForm({ ...form, room: v })} />
        </Pair>
        <Pair>
          <Input label="Capacity" keyboardType="number-pad" value={form.capacity} onChangeText={v => setForm({ ...form, capacity: v })} />
          <Input label="Duration (min)" keyboardType="number-pad" value={form.durationMin} onChangeText={v => setForm({ ...form, durationMin: v })} />
        </Pair>
        <Pair>
          <Input label="Drop-in price (₹)" hint="For non-members / plans without classes" keyboardType="decimal-pad" value={form.dropInPrice} onChangeText={v => setForm({ ...form, dropInPrice: v })} />
          <Input label="Credits per booking" keyboardType="number-pad" value={form.creditsRequired} onChangeText={v => setForm({ ...form, creditsRequired: v })} />
        </Pair>
        <Text style={[S.label, { marginBottom: 6 }]}>Runs on</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {DAYS.map((d, i) => {
            const on = form.days.includes(i);
            return <Btn key={d} small label={d} light={!on} onPress={() => setForm({ ...form, days: on ? form.days.filter((x: number) => x !== i) : [...form.days, i] })} />;
          })}
        </View>
        <Input label="Start time(s), 24h" hint="e.g. 06:30, 18:00 — every selected day gets each time" value={form.times} onChangeText={v => setForm({ ...form, times: v })} />
        <Input label="Description" multiline value={form.description} onChangeText={v => setForm({ ...form, description: v })} />
        <CheckField hint="Active (shows in the schedule)" value={form.isActive} onChange={v => setForm({ ...form, isActive: v })} />
      </Sheet>
    </Screen>
  );
}

/* ------------------------------------------------------------------ personal training */
export function PersonalTrainingScreen() {
  const { user } = useAuth();
  const canWrite = user?.role === 'gym_owner' || isManager(user);
  const trainers = useTrainers();
  const [tab, setTab] = useState('packages');
  const [status, setStatus] = useState('active');
  const [sell, setSell] = useState(false);
  const [f, setF] = useState<any>({ member: null, trainerId: '', name: 'Personal Training', totalSessions: '12', pricePerSession: '', commissionPercent: '30', payNow: '', method: 'cash' });
  const [open, setOpen] = useState<any>(null);
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [exp, setExp] = useState<ExportSpec | null>(null);
  const { data, loading, reload } = useFetch(() => gym.pt.list({ status }), [status]);
  const comm = useFetch(() => gym.pt.commission(), [], tab === 'commission');
  const pkgs: any[] = data?.data || [];
  const cur = open ? pkgs.find(p => p._id === open._id) || open : null;
  const exportPackages = () =>
    setExp({
      name: `PT packages (${status})`,
      cols: [
        { header: 'Package', value: (p: any) => p.name },
        { header: 'Member', value: (p: any) => p.memberId?.name },
        { header: 'Trainer', value: (p: any) => p.trainerId?.name },
        { header: 'Total sessions', value: (p: any) => p.totalSessions },
        { header: 'Sessions left', value: (p: any) => p.remainingSessions },
        { header: 'Amount', value: (p: any) => p.totalAmount },
        { header: 'Status', value: (p: any) => p.status },
      ],
      rows: async () => (await gym.pt.list({ status, limit: 1000 })).data || pkgs,
    });
  const total = (Number(f.totalSessions) || 0) * (Number(f.pricePerSession) || 0);
  const withGst = Math.round(total * 1.18 * 100) / 100;

  const create = async () => {
    try {
      setBusy(true);
      const r = await gym.pt.create({ memberId: f.member._id, trainerId: f.trainerId, name: f.name, totalSessions: Number(f.totalSessions), pricePerSession: Number(f.pricePerSession), commissionPercent: Number(f.commissionPercent) || 0, payNow: f.payNow === '' ? withGst : Number(f.payNow), method: f.method });
      notify.success('PT package sold', r.invoice ? `${r.invoice.invoiceNumber} · ${inr(r.invoice.totalAmount)}` : undefined);
      setSell(false); reload();
    } catch (e: any) { notify.error('Could not sell package', e.message); } finally { setBusy(false); }
  };
  const schedule = async () => {
    try {
      const iso = new Date(when.replace(' ', 'T')).toISOString();
      await gym.pt.schedule(cur._id, { scheduledAt: iso });
      notify.success('Session scheduled'); setWhen(''); reload();
    } catch (e: any) { notify.error('Failed', e.message); }
  };
  const mark = async (sid: string, st: string) => {
    try { await gym.pt.session(cur._id, sid, { status: st }); reload(); } catch (e: any) { notify.error('Failed', e.message); }
  };
  const set = (k: string) => (v: any) => setF((s: any) => ({ ...s, [k]: v }));

  return (
    <Screen title="Personal Training" refreshing={loading && !!data} onRefresh={reload} right={tab === 'packages' ? <><Btn small label="Export" icon={<ExportIcon />} onPress={exportPackages} />{canWrite && <Btn small label="Sell" icon={<Plus size={14} color="#fff" />} onPress={() => setSell(true)} />}</> : undefined}>
      <StatGrid>
        <StatCard label="Packages" value={data?.count ?? 0} sub={status} icon={<StatLayers />} color="#024BAB" />
        <StatCard label="Sessions left" value={pkgs.reduce((s, p) => s + p.remainingSessions, 0)} icon={<StatCalendarDays />} color="#A855F7" />
        <StatCard label="Revenue (these)" value={inr(pkgs.reduce((s, p) => s + p.totalAmount, 0))} icon={<StatIndianRupee />} color="#00C48C" />
        <StatCard label="Trainers" value={trainers.length} icon={<StatDumbbell />} color="#FA731C" />
      </StatGrid>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'packages', label: 'Packages' }, { id: 'commission', label: 'Trainer commission' }]} />
      {tab === 'packages' && <Tabs value={status} onChange={setStatus} tabs={['active', 'completed', 'expired', 'cancelled'].map(s => ({ id: s, label: s }))} />}

      {tab === 'packages' && (loading && !data ? <Loader /> : pkgs.length === 0 ? <Empty text="No PT packages" /> : pkgs.map(p => (
        <RCard key={p._id} style={S.card}>
          <View style={S.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={S.h3}>{p.memberId?.name}</Text>
              <Text style={S.small}>{p.name} · {p.trainerId?.name}</Text>
            </View>
            <Pill value={p.status} />
          </View>
          <Row k="Sessions" v={`${p.remainingSessions} / ${p.totalSessions} left`} bold />
          <Row k="Valid till" v={fmtDate(p.validTill)} />
          <Row k="Paid" v={`${inr(p.paidAmount)} / ${inr(p.totalAmount)}`} />
          <View style={{ marginTop: 10, alignSelf: 'flex-start' }}><Btn small label="Sessions" onPress={() => setOpen(p)} /></View>
        </RCard>
      )))}

      {tab === 'commission' && (comm.loading && !comm.data ? <Loader /> : (comm.data?.data || []).length === 0 ? <Empty text="No sessions delivered this month" /> : (
        <>
          {(comm.data?.data || []).map((r: any) => (
            <RCard key={r.trainerId} style={S.card}>
              <Text style={S.h3}>{r.trainer}</Text>
              <Row k="Sessions delivered" v={r.sessions} />
              <Row k="Revenue" v={inr(r.revenue)} />
              <Row k="Commission payable" v={inr(r.commission)} bold color="#00A070" />
            </RCard>
          ))}
          <Text style={S.small}>This month, per completed session (not on the day of sale).</Text>
        </>
      ))}

      <Sheet visible={sell} title="Sell PT package" onClose={() => setSell(false)} footer={<><Btn light label="Cancel" onPress={() => setSell(false)} /><Btn label="Sell & bill" busy={busy} disabled={!f.member || !f.trainerId || !(total > 0)} onPress={create} /></>}>
        <MemberPicker value={f.member} onChange={set('member')} required />
        <Pair>
          <Select label="Trainer" required options={trainers} value={f.trainerId} onChange={set('trainerId')} placeholder="Select trainer" />
          <Input label="Package name" value={f.name} onChangeText={set('name')} />
        </Pair>
        <Pair>
          <Input label="Sessions" keyboardType="number-pad" value={f.totalSessions} onChangeText={set('totalSessions')} />
          <Input label="Price / session (₹)" keyboardType="decimal-pad" value={f.pricePerSession} onChangeText={set('pricePerSession')} />
        </Pair>
        <Pair>
          <Input label="Trainer commission %" keyboardType="decimal-pad" value={f.commissionPercent} onChangeText={set('commissionPercent')} />
          <Input label="Collect now (₹)" keyboardType="decimal-pad" placeholder={String(withGst)} value={f.payNow} onChangeText={set('payNow')} hint={`Total incl. 18% GST: ${inr(withGst, 2)}`} />
        </Pair>
        <Select label="Method" options={['cash', 'upi', 'card', 'online', 'bank_transfer']} value={f.method} onChange={set('method')} />
      </Sheet>

      <Sheet visible={!!cur} title={cur ? `${cur.memberId?.name} · ${cur.name}` : ''} subtitle={cur ? `${cur.trainerId?.name} · ${cur.remainingSessions}/${cur.totalSessions} sessions left` : undefined} onClose={() => setOpen(null)} footer={<Btn light label="Close" onPress={() => setOpen(null)} />}>
        {cur?.status === 'active' && canWrite && (
          <View style={{ marginBottom: 12 }}>
            <Input label="Schedule a session" placeholder="YYYY-MM-DD HH:mm" value={when} onChangeText={setWhen} />
            <Btn label="Schedule" disabled={!when} onPress={schedule} />
          </View>
        )}
        {(cur?.sessions || []).length === 0 && <Empty text="No sessions booked yet" />}
        {(cur?.sessions || []).map((s: any, i: number) => (
          <View key={s._id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
            <View style={S.rowBetween}>
              <Text style={[S.body, { flex: 1 }]}>#{i + 1} · {fmtDateTime(s.scheduledAt)} ({s.durationMin} min)</Text>
              <Pill value={s.status} />
            </View>
            {s.status === 'scheduled' && canWrite && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                <Btn small label="Completed" onPress={() => mark(s._id, 'completed')} />
                <Btn small light label="Missed" onPress={() => mark(s._id, 'missed')} />
                <Btn small danger label="Cancel" onPress={() => mark(s._id, 'cancelled')} />
              </View>
            )}
          </View>
        ))}
      </Sheet>
      <ExportSheet spec={exp} onClose={() => setExp(null)} />
    </Screen>
  );
}
