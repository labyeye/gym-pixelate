import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Plus } from 'lucide-react-native';
import { gym } from '../../api/gym';
import { request, usersAPI } from '../../api/api';
import { isManager, useAuth } from '../../contexts/AuthContext';
import { useFetch } from '../../hooks/useFetch';
import { C, S } from '../../theme';
import { inr, titleCase, todayStr } from '../../utils/format';
import { PhoneInput } from '../../components/PhoneInput';
import { Avatar, PhotoPicker } from '../../components/PhotoPicker';
import { MemberPicker } from '../../components/pickers';
import { Btn, Empty, Input, Loader, Pill, Row, Screen, Select, StatCard, StatGrid, Sheet, Tabs, notify, RCard, Pair } from '../../components/ui';
import { Dumbbell as StatDumbbell, IndianRupee as StatIndianRupee, Layers as StatLayers, Users as StatUsers } from 'lucide-react-native';
import ExportSheet, { ExportSpec } from '../../components/ExportSheet';
import { Download as ExportIcon } from 'lucide-react-native';

/* ------------------------------------------------------------------ trainers */
const blank = {
  avatar: '', name: '', email: '', password: '', phone: '', specializations: '', certifications: '', experienceYears: '', ptRate: '', commissionPercent: '', shift: '', maxClients: '', bio: '',
  dob: '', gender: '', bloodGroup: '', address: '', city: '', pincode: '', languages: '', joiningDate: '', employmentType: '', monthlySalary: '',
  emergencyName: '', emergencyPhone: '', emergencyRelation: '', idType: '', idNumber: '',
};
const TRAINER_TABS = [{ id: '0', label: 'Basic' }, { id: '1', label: 'Personal' }, { id: '2', label: 'Skills' }, { id: '3', label: 'Pay & ID' }];
const dateOnly = (d?: string) => (d ? String(d).slice(0, 10) : '');
const fmtD = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const list = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);
const num = (v: any) => (v === '' ? undefined : Number(v));

export function TrainersScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const canWrite = user?.role === 'gym_owner' || isManager(user);
  const [open, setOpen] = useState<any>(null);
  const [assign, setAssign] = useState<any>(null);
  const [member, setMember] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const [f, setF] = useState<any>(blank);
  const [ftab, setFtab] = useState('0');
  const [busy, setBusy] = useState(false);
  const [exp, setExp] = useState<ExportSpec | null>(null);

  const tr = useFetch(() => gym.users.list({ role: 'trainer' }), []);
  const asg = useFetch(() => request<any>('/trainers?limit=500'), []);
  const pts = useFetch(() => gym.pt.list({ status: 'active' }), []);
  const trainers: any[] = tr.data?.data || [];
  const assignments: any[] = (asg.data?.data || []).filter((a: any) => a.isActive);
  const clientsOf = (id: string) => assignments.filter(a => (a.trainerId?._id || a.trainerId) === id);
  const ptOf = (id: string) => (pts.data?.data || []).filter((p: any) => (p.trainerId?._id || p.trainerId) === id);
  const reload = () => { tr.reload(); asg.reload(); pts.reload(); };
  const exportTrainers = () =>
    setExp({
      name: 'Trainers',
      cols: [
        { header: 'Name', value: (t: any) => t.name },
        { header: 'Phone', value: (t: any) => t.phone },
        { header: 'Email', value: (t: any) => t.email },
        { header: 'Status', value: (t: any) => t.status },
        { header: 'Active clients', value: (t: any) => clientsOf(t._id).length },
        { header: 'Active PT packages', value: (t: any) => ptOf(t._id).length },
      ],
      rows: async () => trainers,
    });
  const cur = open ? trainers.find(t => t._id === open._id) || open : null;

  const openEdit = (t?: any) => {
    const p = t?.trainerProfile || {};
    setF(t ? { ...blank, avatar: t.avatar || '', name: t.name, email: t.email, phone: t.phone || '', specializations: (p.specializations || []).join(', '), certifications: (p.certifications || []).join(', '), experienceYears: String(p.experienceYears ?? ''), ptRate: String(p.ptRate ?? ''), commissionPercent: String(p.commissionPercent ?? ''), shift: p.shift || '', maxClients: String(p.maxClients ?? ''), bio: p.bio || '',
      dob: dateOnly(p.dob), gender: p.gender || '', bloodGroup: p.bloodGroup || '', address: p.address || '', city: p.city || '', pincode: p.pincode || '',
      languages: (p.languages || []).join(', '), joiningDate: dateOnly(p.joiningDate), employmentType: p.employmentType || '', monthlySalary: t.monthlySalary ? String(t.monthlySalary) : '',
      emergencyName: p.emergencyContact?.name || '', emergencyPhone: p.emergencyContact?.phone || '', emergencyRelation: p.emergencyContact?.relation || '',
      idType: p.idProof?.type || '', idNumber: p.idProof?.number || '' } : blank);
    setFtab('0');
    setEdit(t || 'new');
  };
  const save = async () => {
    const trainerProfile = { specializations: list(f.specializations), certifications: list(f.certifications), experienceYears: num(f.experienceYears), ptRate: num(f.ptRate), commissionPercent: num(f.commissionPercent), shift: f.shift, maxClients: num(f.maxClients), bio: f.bio,
      dob: f.dob || undefined, gender: f.gender, bloodGroup: f.bloodGroup, address: f.address, city: f.city, pincode: f.pincode, languages: list(f.languages),
      joiningDate: f.joiningDate || undefined, employmentType: f.employmentType,
      emergencyContact: { name: f.emergencyName, phone: f.emergencyPhone, relation: f.emergencyRelation }, idProof: { type: f.idType, number: f.idNumber } };
    try {
      setBusy(true);
      if (edit === 'new') await usersAPI.create({ avatar: f.avatar || undefined, name: f.name, email: f.email, password: f.password, phone: f.phone, role: 'trainer', monthlySalary: num(f.monthlySalary), trainerProfile });
      else await usersAPI.update(edit._id, { avatar: f.avatar, name: f.name, phone: f.phone, monthlySalary: num(f.monthlySalary) ?? 0, trainerProfile });
      notify.success('Trainer saved');
      setEdit(null);
      reload();
    } catch (e: any) {
      notify.error('Save failed', e.message);
    } finally {
      setBusy(false);
    }
  };
  const doAssign = async () => {
    try {
      await request('/trainers/assign', { method: 'POST', body: JSON.stringify({ trainerId: assign._id, memberId: member._id }) });
      notify.success('Client assigned', `${member.name} → ${assign.name}`);
      setAssign(null); setMember(null); reload();
    } catch (e: any) { notify.error('Failed', e.message); }
  };
  const unassign = async (id: string) => {
    try { await request(`/trainers/${id}/unassign`, { method: 'POST', body: '{}' }); reload(); } catch (e: any) { notify.error('Failed', e.message); }
  };
  const set = (k: string) => (v: string) => setF((s: any) => ({ ...s, [k]: v }));

  return (
    <Screen title="Trainers" refreshing={tr.loading && !!tr.data} onRefresh={reload} right={<><Btn small label="Export" icon={<ExportIcon />} onPress={exportTrainers} />{canWrite && <Btn small label="Add" icon={<Plus size={14} color="#fff" />} onPress={() => openEdit()} />}</>}>
      <StatGrid>
        <StatCard label="Trainers" value={trainers.filter(t => t.status === 'active').length} icon={<StatDumbbell />} color="#024BAB" />
        <StatCard label="Assigned clients" value={assignments.length} icon={<StatUsers />} color="#00C48C" />
        <StatCard label="Active PT packages" value={pts.data?.count ?? 0} icon={<StatLayers />} color="#A855F7" />
        <StatCard label="Avg clients / trainer" value={trainers.length ? (assignments.length / trainers.length).toFixed(1) : '0'} icon={<StatUsers />} color="#FA731C" />
      </StatGrid>
      {tr.loading && !tr.data ? <Loader /> : trainers.length === 0 ? <Empty text="No trainers yet" /> : trainers.map(t => {
        const max = t.trainerProfile?.maxClients;
        return (
          <RCard key={t._id} style={S.card}>
            <View style={S.rowBetween}>
              <Avatar uri={t.avatar} name={t.name} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={S.h3}>{t.name}</Text>
                <Text style={S.small}>{(t.trainerProfile?.specializations || []).join(', ') || 'No specialisation'}{t.trainerProfile?.shift ? ` · ${t.trainerProfile.shift}` : ''}</Text>
              </View>
              <Pill value={t.status} />
            </View>
            <Row k="Clients" v={`${clientsOf(t._id).length}${max ? ` / ${max}` : ''}`} bold />
            <Row k="PT packages" v={ptOf(t._id).length} />
            <Row k="PT rate" v={t.trainerProfile?.ptRate ? inr(t.trainerProfile.ptRate) : '—'} />
            <Row k="Commission" v={t.trainerProfile?.commissionPercent != null ? `${t.trainerProfile.commissionPercent}%` : '—'} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              <Btn small light label="Clients" onPress={() => setOpen(t)} />
              {canWrite && <Btn small label="Assign client" onPress={() => { setAssign(t); setMember(null); }} />}
              {canWrite && <Btn small light label="Edit" onPress={() => openEdit(t)} />}
            </View>
          </RCard>
        );
      })}

      <Sheet visible={!!cur} title={cur?.name || ''} subtitle={`${clientsOf(cur?._id).length} clients`} onClose={() => setOpen(null)} footer={<Btn light label="Close" onPress={() => setOpen(null)} />}>
        {!!cur && (
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Avatar uri={cur.avatar} name={cur.name} size={56} />
              <View style={{ flex: 1 }}>
                <Text style={S.h3}>{cur.name}</Text>
                <Text style={S.small}>{cur.phone || cur.email}</Text>
              </View>
            </View>
            <Row k="Date of birth" v={fmtD(cur.trainerProfile?.dob) || '—'} />
            <Row k="Gender" v={titleCase(cur.trainerProfile?.gender) || '—'} />
            <Row k="Joined" v={fmtD(cur.trainerProfile?.joiningDate) || '—'} />
            <Row k="Experience" v={cur.trainerProfile?.experienceYears != null ? `${cur.trainerProfile.experienceYears} yrs` : '—'} />
            <Row k="Certifications" v={(cur.trainerProfile?.certifications || []).join(', ') || '—'} />
            <Row k="Languages" v={(cur.trainerProfile?.languages || []).join(', ') || '—'} />
          </View>
        )}
        {clientsOf(cur?._id).length === 0 ? <Empty text="No assigned clients" /> : clientsOf(cur?._id).map((a: any) => (
          <View key={a._id} style={[S.rowBetween, { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }]}>
            <Text style={[S.h3, { flex: 1 }]} onPress={() => { setOpen(null); nav.navigate('MemberProfile', { id: a.memberId?._id }); }}>{a.memberId?.name}</Text>
            {canWrite && <Btn small light label="Unassign" onPress={() => unassign(a._id)} />}
          </View>
        ))}
        {!!cur?.trainerProfile?.bio && <Text style={[S.body, { marginTop: 12 }]}>{cur.trainerProfile.bio}</Text>}
      </Sheet>

      <Sheet visible={!!assign} title={`Assign client to ${assign?.name || ''}`} onClose={() => setAssign(null)} footer={<><Btn light label="Cancel" onPress={() => setAssign(null)} /><Btn label="Assign" disabled={!member} onPress={doAssign} /></>}>
        <MemberPicker value={member} onChange={setMember} required />
      </Sheet>

      <Sheet
        visible={!!edit}
        title={edit === 'new' ? 'Add trainer' : 'Edit trainer'}
        subtitle="Photo, personal details, skills and pay"
        onClose={() => setEdit(null)}
        footer={
          <>
            <Btn light label="Cancel" onPress={() => setEdit(null)} />
            {Number(ftab) > 0 && <Btn light label="Back" onPress={() => setFtab(String(Number(ftab) - 1))} />}
            {Number(ftab) < TRAINER_TABS.length - 1 ? (
              <Btn label="Next" onPress={() => setFtab(String(Number(ftab) + 1))} />
            ) : (
              <Btn label="Save trainer" busy={busy} disabled={!f.name || (edit === 'new' && (!f.email || f.password.length < 6))} onPress={save} />
            )}
          </>
        }
      >
        <Tabs fill tabs={TRAINER_TABS} value={ftab} onChange={setFtab} />
        {ftab === '0' && (
          <>
            <PhotoPicker label="Photo" name={f.name} value={f.avatar} onChange={set('avatar')} />
            <Pair>
              <Input label="Name" required value={f.name} onChangeText={set('name')} />
              <PhoneInput label="Phone" value={f.phone} onChange={set('phone')} />
            </Pair>
            {edit === 'new' && (
              <>
                <Pair>
                  <Input label="Login email" required keyboardType="email-address" autoCapitalize="none" value={f.email} onChangeText={set('email')} />
                  <Input label="Password" required secureTextEntry hint="Min 6 characters" value={f.password} onChangeText={set('password')} />
                </Pair>
              </>
            )}
          </>
        )}
        {ftab === '1' && (
          <>
            <Pair>
              <Input label="Date of birth" placeholder="YYYY-MM-DD" value={f.dob} onChangeText={set('dob')} />
              <Select label="Gender" options={['male', 'female', 'other']} value={f.gender} onChange={set('gender')} allowEmpty />
            </Pair>
            <Pair>
              <Select label="Blood group" options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']} value={f.bloodGroup} onChange={set('bloodGroup')} allowEmpty />
              <Input label="Languages" hint="Comma separated: English, Hindi" value={f.languages} onChangeText={set('languages')} />
            </Pair>
            <Pair>
              <Input label="City" value={f.city} onChangeText={set('city')} />
              <Input label="Pincode" keyboardType="number-pad" maxLength={6} value={f.pincode} onChangeText={set('pincode')} />
            </Pair>
            <Input label="Address" multiline value={f.address} onChangeText={set('address')} />
            <Pair>
              <Input label="Emergency contact name" value={f.emergencyName} onChangeText={set('emergencyName')} />
              <PhoneInput label="Emergency contact phone" value={f.emergencyPhone} onChange={set('emergencyPhone')} />
            </Pair>
            <Input label="Relation" value={f.emergencyRelation} onChangeText={set('emergencyRelation')} />
          </>
        )}
        {ftab === '2' && (
          <>
            <Pair>
              <Input label="Specialisations" hint="Comma separated: weight training, yoga" value={f.specializations} onChangeText={set('specializations')} />
              <Input label="Certifications" hint="ACE, ISSA, NASM…" value={f.certifications} onChangeText={set('certifications')} />
            </Pair>
            <Pair>
              <Input label="Experience (years)" keyboardType="number-pad" value={f.experienceYears} onChangeText={set('experienceYears')} />
              <Input label="Shift" placeholder="06:00-14:00" value={f.shift} onChangeText={set('shift')} />
            </Pair>
            <Input label="Max clients" hint="Blocks assigning beyond this" keyboardType="number-pad" value={f.maxClients} onChangeText={set('maxClients')} />
            <Input label="Bio" multiline value={f.bio} onChangeText={set('bio')} />
          </>
        )}
        {ftab === '3' && (
          <>
            <Pair>
              <Input label="Joining date" placeholder="YYYY-MM-DD" value={f.joiningDate} onChangeText={set('joiningDate')} />
              <Select label="Employment type" options={[{ value: 'full_time', label: 'Full time' }, { value: 'part_time', label: 'Part time' }, { value: 'freelance', label: 'Freelance' }]} value={f.employmentType} onChange={set('employmentType')} allowEmpty />
            </Pair>
            <Pair>
              <Input label="Monthly salary (₹)" hint="Used by payroll" keyboardType="decimal-pad" value={f.monthlySalary} onChangeText={set('monthlySalary')} />
              <Input label="PT rate / session (₹)" keyboardType="decimal-pad" value={f.ptRate} onChangeText={set('ptRate')} />
            </Pair>
            <Pair>
              <Input label="Default commission %" keyboardType="decimal-pad" value={f.commissionPercent} onChangeText={set('commissionPercent')} />
              <Select label="ID proof" options={['aadhaar', 'pan', 'driving_license', 'passport', 'voter_id', 'other']} value={f.idType} onChange={set('idType')} allowEmpty />
            </Pair>
            <Input label="ID number" value={f.idNumber} onChangeText={set('idNumber')} />
          </>
        )}
      </Sheet>
      <ExportSheet spec={exp} onClose={() => setExp(null)} />
    </Screen>
  );
}

/* ------------------------------------------------------------------ staff & payroll */
const STATUS: Record<string, { short: string; color: string; label: string }> = {
  present: { short: 'P', color: '#00C48C', label: 'Present' },
  half_day: { short: '½', color: '#A3E635', label: 'Half day' },
  paid_leave: { short: 'PL', color: '#0EA5E9', label: 'Paid leave' },
  unpaid_leave: { short: 'UL', color: '#FA731C', label: 'Unpaid leave' },
  absent: { short: 'A', color: '#EF4444', label: 'Absent' },
  weekly_off: { short: 'WO', color: '#A855F7', label: 'Weekly off' },
  holiday: { short: 'H', color: '#0D9488', label: 'Holiday' },
};
const ORDER = Object.keys(STATUS);

export function StaffScreen() {
  const { user } = useAuth();
  const canWrite = user?.role === 'gym_owner' || isManager(user);
  const [tab, setTab] = useState('attendance');
  const [date, setDate] = useState(todayStr());
  const [salary, setSalary] = useState<Record<string, string>>({});
  const month = date.slice(0, 7);

  const grid = useFetch(() => gym.staff.month(month), [month]);
  const pay = useFetch(() => gym.staff.payroll(month), [month], tab === 'payroll');
  const staff: any[] = grid.data?.data || [];
  const day = Number(date.slice(8, 10)) || 1;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const present = staff.filter(s => ['present', 'half_day'].includes(s.marks[day])).length;

  const mark = async (userId: string, status: string) => {
    try {
      await gym.staff.mark({ userId, date, status });
      grid.reload();
      pay.reload();
    } catch (e: any) { notify.error('Could not mark', e.message); }
  };
  const markAll = async () => {
    try {
      await Promise.all(staff.filter(s => !s.marks[day]).map(s => gym.staff.mark({ userId: s._id, date, status: 'present' })));
      grid.reload();
      notify.success('Marked', 'Unmarked staff set to present');
    } catch (e: any) { notify.error('Failed', e.message); }
  };
  const saveSalary = async (id: string) => {
    try { await usersAPI.update(id, { monthlySalary: Number(salary[id]) || 0 }); notify.success('Salary saved'); grid.reload(); pay.reload(); } catch (e: any) { notify.error('Failed', e.message); }
  };

  return (
    <Screen title="Staff & Payroll" refreshing={grid.loading && !!grid.data} onRefresh={() => { grid.reload(); pay.reload(); }}>
      <StatGrid>
        <StatCard label="Staff" value={staff.length} icon={<StatUsers />} color="#024BAB" />
        <StatCard label="Present on date" value={present} icon={<StatUsers />} color="#00C48C" />
        <StatCard label="Payroll (this month)" value={inr(pay.data?.totals?.total)} sub="base + PT commission" icon={<StatIndianRupee />} color="#A855F7" />
      </StatGrid>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'attendance', label: 'Attendance' }, { id: 'payroll', label: 'Payroll' }]} />
      <Input label={tab === 'attendance' ? 'Date' : 'Month (taken from date)'} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />

      {tab === 'attendance' && (
        <>
          {canWrite && valid && <View style={{ marginBottom: 12 }}><Btn light small label="Mark rest present" onPress={markAll} /></View>}
          {grid.loading && !grid.data ? <Loader /> : staff.length === 0 ? <Empty text="No staff accounts yet — add them in Settings" /> : staff.map(s => (
            <RCard key={s._id} style={S.card}>
              <View style={S.rowBetween}>
                <Text style={S.h3}>{s.name}</Text>
                <Text style={S.small}>{titleCase(s.role)}</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {ORDER.map(k => {
                  const on = s.marks[day] === k;
                  return (
                    <Btn key={k} small label={STATUS[k].short} disabled={!canWrite || !valid} color={on ? STATUS[k].color : C.white} light={!on} onPress={() => mark(s._id, k)} />
                  );
                })}
              </View>
              {!!s.marks[day] && <Text style={[S.small, { marginTop: 6 }]}>{STATUS[s.marks[day]]?.label}</Text>}
            </RCard>
          ))}
          <Text style={S.small}>P present · ½ half day · PL paid leave · UL unpaid leave · A absent · WO weekly off · H holiday. Unmarked days are unpaid in payroll.</Text>
        </>
      )}

      {tab === 'payroll' && (pay.loading && !pay.data ? <Loader /> : (pay.data?.data || []).length === 0 ? <Empty text="No payroll data" /> : (
        <>
          {(pay.data?.data || []).map((r: any) => (
            <RCard key={r.userId} style={S.card}>
              <View style={S.rowBetween}>
                <Text style={S.h3}>{r.name}</Text>
                <Text style={[S.h3, { color: '#00A070' }]}>{inr(r.total)}</Text>
              </View>
              <Text style={[S.small, { marginBottom: 6 }]}>{titleCase(r.role)}</Text>
              <Row k="Present / Half" v={`${r.present} / ${r.halfDays}`} />
              <Row k="Leave (paid / unpaid)" v={`${r.paidLeave} / ${r.unpaidLeave}`} />
              <Row k="Absent" v={r.absent} color={r.absent ? C.danger : undefined} />
              <Row k="Unmarked" v={r.unmarkedDays} color={r.unmarkedDays ? C.secondary : undefined} />
              <Row k="Payable days" v={`${r.payableDays} / ${r.daysInMonth}`} />
              <Row k="Base pay" v={inr(r.basePay)} />
              <Row k="PT commission" v={r.ptSessions ? `${inr(r.commission)} (${r.ptSessions} sessions)` : '—'} />
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 8 }}>
                <View style={{ flex: 1 }}><Input label="Salary / month" keyboardType="decimal-pad" value={salary[r.userId] ?? String(r.monthlySalary ?? '')} onChangeText={v => setSalary(s => ({ ...s, [r.userId]: v }))} editable={canWrite} /></View>
                {canWrite && salary[r.userId] !== undefined && salary[r.userId] !== String(r.monthlySalary) && <View style={{ marginBottom: 14 }}><Btn small label="Save" onPress={() => saveSalary(r.userId)} /></View>}
              </View>
            </RCard>
          ))}
          <Text style={S.h3}>Total payable: {inr(pay.data?.totals?.total)}</Text>
          <Text style={S.small}>base {inr(pay.data?.totals?.basePay)} + commission {inr(pay.data?.totals?.commission)}</Text>
        </>
      ))}
    </Screen>
  );
}
