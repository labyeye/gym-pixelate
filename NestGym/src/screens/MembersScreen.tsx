import React, { useMemo, useState } from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Plus } from 'lucide-react-native';
import { gym } from '../api/gym';
import { isManager, useAuth } from '../contexts/AuthContext';
import { useDebounced, useFetch } from '../hooks/useFetch';
import { C, S } from '../theme';
import { daysFromNow, fmtDate, inr, toInputDate, waLink } from '../utils/format';
import { PhoneInput } from '../components/PhoneInput';
import { useTrainers } from '../components/pickers';
import { Avatar, PhotoPicker } from '../components/PhotoPicker';
import { SellMembershipSheet } from '../components/gymSheets';
import { Btn, CheckField, Empty, Input, Loader, Pager, Pill, Screen, SearchBox, Select, Sheet, StatCard, StatGrid, Tabs, notify, Rise } from '../components/ui';

const GOALS = ['weight_loss', 'muscle_gain', 'strength', 'endurance', 'flexibility', 'general_fitness', 'rehab', 'sports'];
const SOURCES = ['walk_in', 'referral', 'instagram', 'facebook', 'google', 'website', 'whatsapp', 'poster', 'corporate', 'other'];
const CONDITIONS = ['Diabetes', 'Hypertension', 'Heart condition', 'Asthma', 'Thyroid', 'PCOS', 'Back pain', 'Knee issue', 'Epilepsy'];
const TABS = [
  { id: '0', label: 'Basic' },
  { id: '1', label: 'Health' },
  { id: '2', label: 'Fitness' },
  { id: '3', label: 'Emergency & ID' },
];
const EMPTY = {
  name: '', phone: '', altPhone: '', email: '', gender: 'male', dob: '', occupation: '', address: '', city: '', state: '', pincode: '',
  health: { bloodGroup: '', conditions: [] as string[], injuries: '', allergies: '', medications: '', pregnant: false, doctorClearance: false },
  fitness: { goal: '', level: '', heightCm: '', startWeightKg: '', targetWeightKg: '', preferredSlot: '' },
  source: 'walk_in', photo: '', trainerId: '', emergencyContact: { name: '', phone: '', relation: '' }, idProof: { type: '', number: '' }, notes: '', acceptDeclaration: false,
};

const get = (o: any, path: string) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const set = (o: any, path: string, v: any) => {
  const keys = path.split('.');
  const next = { ...o };
  let cur = next;
  keys.slice(0, -1).forEach(k => {
    cur[k] = { ...(cur[k] || {}) };
    cur = cur[k];
  });
  cur[keys[keys.length - 1]] = v;
  return next;
};

export default function MembersScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const canWrite = user?.role === 'gym_owner' || isManager(user);
  const [search, setSearch] = useState('');
  const dsearch = useDebounced(search);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [tab, setTab] = useState('0');
  const [saving, setSaving] = useState(false);
  const [sell, setSell] = useState<any>(null);
  const trainers = useTrainers();

  const params = useMemo(() => ({ page, limit: 25, search: dsearch, status }), [page, dsearch, status]);
  const { data, loading, reload } = useFetch(() => gym.members.list(params), [params]);
  const members: any[] = data?.data || [];
  const t = Number(tab);

  const expiring = members.filter(m => m.currentMembership?.status === 'active' && daysFromNow(m.currentMembership.endDate) <= 7).length;
  const withDues = members.filter(m => (m.currentMembership?.due || 0) > 0).length;

  const openNew = () => { setForm(EMPTY); setTab('0'); setEditing('new'); };
  const openEdit = (m: any) => {
    const f = JSON.parse(JSON.stringify({
      ...EMPTY, ...m,
      health: { ...EMPTY.health, ...m.health },
      fitness: { ...EMPTY.fitness, ...m.fitness },
      emergencyContact: { ...EMPTY.emergencyContact, ...m.emergencyContact },
      idProof: { ...EMPTY.idProof, ...m.idProof },
    }));
    f.dob = toInputDate(m.dob);
    for (const k of ['heightCm', 'startWeightKg', 'targetWeightKg']) f.fitness[k] = f.fitness[k] == null ? '' : String(f.fitness[k]);
    setForm(f); setTab('0'); setEditing(m);
  };
  const bind = (path: string) => ({ value: String(get(form, path) ?? ''), onChangeText: (v: string) => setForm((f: any) => set(f, path, v)) });
  const toggleCondition = (c: string) =>
    setForm((f: any) => {
      const cur: string[] = f.health.conditions || [];
      return set(f, 'health.conditions', cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c]);
    });

  const save = async () => {
    if (!form.name.trim() || !form.phone.trim()) { setTab('0'); return notify.error('Name and phone are required'); }
    const body = JSON.parse(JSON.stringify(form));
    for (const k of ['heightCm', 'startWeightKg', 'targetWeightKg']) body.fitness[k] = body.fitness[k] === '' ? undefined : Number(body.fitness[k]);
    if (!body.dob) delete body.dob;
    if (!body.trainerId || editing !== 'new') delete body.trainerId; // trainer is picked only when adding
    if (!body.idProof.type) delete body.idProof;
    try {
      setSaving(true);
      if (editing === 'new') await gym.members.create(body);
      else await gym.members.update(editing._id, body);
      notify.success(editing === 'new' ? 'Member added' : 'Member updated', form.name);
      setEditing(null);
      reload();
    } catch (e: any) {
      notify.error('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title="Members"
      refreshing={loading && !!data}
      onRefresh={reload}
      right={canWrite ? <Btn small label="Add" icon={<Plus size={14} color="#fff" />} onPress={openNew} /> : undefined}
    >
      <StatGrid>
        <StatCard label="Total members" value={data?.total ?? 0} color="#024BAB" onPress={() => setStatus('')} />
        <StatCard label="Expiring ≤ 7 days" value={expiring} sub="on this page" color="#FA731C" />
        <StatCard label="Payment dues" value={withDues} sub="on this page" color={withDues ? '#EF4444' : '#14B8A6'} />
      </StatGrid>
      <SearchBox value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Name, phone or member code…" />
      <Tabs
        value={status}
        onChange={v => { setStatus(v); setPage(1); }}
        tabs={[{ id: '', label: 'All' }, { id: 'active', label: 'Active' }, { id: 'inactive', label: 'Inactive' }, { id: 'blacklisted', label: 'Blacklisted' }]}
      />

      {loading && !data ? <Loader /> : members.length === 0 ? <Empty text="No members found" /> : members.map(m => {
        const c = m.currentMembership;
        const left = c ? daysFromNow(c.endDate) : null;
        return (
          <Rise key={m._id}><TouchableOpacity key={m._id} activeOpacity={0.85} onPress={() => nav.navigate('MemberProfile', { id: m._id })} style={S.card}>
            <View style={S.rowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <Avatar uri={m.photo} name={m.name} />
                <View style={{ flex: 1 }}>
                  <Text style={S.h3} numberOfLines={1}>{m.name}</Text>
                  <Text style={S.small}>{m.memberCode} · {m.phone}</Text>
                </View>
              </View>
              <Pill value={m.status} />
            </View>
            <View style={{ marginTop: 10, gap: 3 }}>
              <View style={S.rowBetween}>
                <Text style={S.small}>Plan</Text>
                {c ? <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Text style={S.body}>{c.planName}</Text><Pill value={c.status} /></View> : <Text style={S.small}>No plan</Text>}
              </View>
              {c && (
                <View style={S.rowBetween}>
                  <Text style={S.small}>Valid till</Text>
                  <Text style={[S.body, { color: left! < 0 ? C.danger : left! <= 7 ? '#C2410C' : C.black }]}>
                    {fmtDate(c.endDate)} · {left! < 0 ? `${-left!}d ago` : `${left}d left`}
                  </Text>
                </View>
              )}
              {c?.due > 0 && (
                <View style={S.rowBetween}>
                  <Text style={S.small}>Dues</Text>
                  <Text style={[S.body, { color: C.danger, fontFamily: 'DMSans-Bold' }]}>{inr(c.due)}</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <Btn small label={c ? 'Renew / sell' : 'Sell plan'} onPress={() => setSell(m)} />
              <Btn small light label="WhatsApp" onPress={() => { const u = waLink(m.phone, `Hi ${m.name}, `); if (u) Linking.openURL(u); }} />
              {canWrite && <Btn small light label="Edit" onPress={() => openEdit(m)} />}
            </View>
          </TouchableOpacity></Rise>
        );
      })}
      <Pager page={page} pages={data?.pages || 1} onPage={setPage} />

      <SellMembershipSheet open={!!sell} member={sell} mode="sell" onClose={() => { setSell(null); reload(); }} />

      <Sheet
        visible={!!editing}
        title={editing === 'new' ? 'Add member' : `Edit ${editing?.name || ''}`}
        subtitle={editing !== 'new' ? editing?.memberCode : 'A member code is generated automatically'}
        onClose={() => setEditing(null)}
        footer={
          <>
            {t > 0 && <Btn light label="Back" onPress={() => setTab(String(t - 1))} />}
            {t < TABS.length - 1 ? <Btn label="Next" onPress={() => setTab(String(t + 1))} /> : <Btn label="Save member" busy={saving} onPress={save} />}
          </>
        }
      >
        <Tabs fill tabs={TABS} value={tab} onChange={setTab} />
        {t === 0 && (
          <>
            <PhotoPicker label="Photo" name={form.name} value={form.photo || ''} onChange={url => setForm((f: any) => ({ ...f, photo: url }))} />
            <Input label="Full name" required {...bind('name')} />
            <PhoneInput label="Mobile" required value={String(get(form, 'phone') ?? '')} onChange={v => setForm((f: any) => set(f, 'phone', v))} />
            <PhoneInput label="Alternate mobile" value={String(get(form, 'altPhone') ?? '')} onChange={v => setForm((f: any) => set(f, 'altPhone', v))} />
            <Input label="Email" keyboardType="email-address" autoCapitalize="none" {...bind('email')} />
            <Select label="Gender" options={['male', 'female', 'other']} value={form.gender} onChange={v => setForm((f: any) => ({ ...f, gender: v }))} />
            <Input label="Date of birth" placeholder="YYYY-MM-DD" {...bind('dob')} />
            <Input label="Occupation" {...bind('occupation')} />
            <Input label="Pincode" keyboardType="number-pad" {...bind('pincode')} />
            <Input label="City" {...bind('city')} />
            <Input label="State" {...bind('state')} />
            <Input label="Address" multiline {...bind('address')} />
          </>
        )}
        {t === 1 && (
          <>
            <Text style={[S.small, { marginBottom: 12 }]}>Health screen before the first workout — trainers see this on the member profile.</Text>
            <Text style={[S.label, { marginBottom: 6 }]}>Medical conditions</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {CONDITIONS.map(c => {
                const on = form.health.conditions.includes(c);
                return (
                  <TouchableOpacity key={c} onPress={() => toggleCondition(c)} style={{ borderWidth: 2, borderColor: C.black, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: on ? '#FEE2E2' : C.white }}>
                    <Text style={[S.body, { fontSize: 12, color: on ? '#B91C1C' : C.black }]}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Select label="Blood group" options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']} value={form.health.bloodGroup} onChange={v => setForm((f: any) => set(f, 'health.bloodGroup', v))} allowEmpty placeholder="Unknown" />
            <Input label="Allergies" {...bind('health.allergies')} />
            <Input label="Medications" {...bind('health.medications')} />
            <Input label="Past injuries / surgeries" {...bind('health.injuries')} />
            {form.gender === 'female' && <CheckField hint="Pregnant / postnatal" value={form.health.pregnant} onChange={v => setForm((f: any) => set(f, 'health.pregnant', v))} />}
            <CheckField hint="Has doctor's clearance" value={form.health.doctorClearance} onChange={v => setForm((f: any) => set(f, 'health.doctorClearance', v))} />
            {editing === 'new' && <CheckField hint="Member confirms the health details are correct and accepts the gym's liability waiver." value={form.acceptDeclaration} onChange={v => setForm((f: any) => ({ ...f, acceptDeclaration: v }))} />}
          </>
        )}
        {t === 2 && (
          <>
            <Select label="Primary goal" options={GOALS} value={form.fitness.goal} onChange={v => setForm((f: any) => set(f, 'fitness.goal', v))} allowEmpty placeholder="—" />
            <Select label="Experience" options={['beginner', 'intermediate', 'advanced']} value={form.fitness.level} onChange={v => setForm((f: any) => set(f, 'fitness.level', v))} allowEmpty placeholder="—" />
            <Input label="Height (cm)" keyboardType="decimal-pad" {...bind('fitness.heightCm')} />
            <Input label="Starting weight (kg)" keyboardType="decimal-pad" {...bind('fitness.startWeightKg')} />
            <Input label="Target weight (kg)" keyboardType="decimal-pad" {...bind('fitness.targetWeightKg')} />
            <Select label="Preferred slot" options={['early_morning', 'morning', 'afternoon', 'evening', 'night']} value={form.fitness.preferredSlot} onChange={v => setForm((f: any) => set(f, 'fitness.preferredSlot', v))} allowEmpty placeholder="—" />
            {editing === 'new' && <Select label="Trainer (optional)" options={trainers} value={form.trainerId} onChange={v => setForm((f: any) => ({ ...f, trainerId: v }))} allowEmpty placeholder="No trainer" />}
            <Select label="How did they find us?" options={SOURCES} value={form.source} onChange={v => setForm((f: any) => ({ ...f, source: v }))} />
            <Input label="Notes" multiline {...bind('notes')} />
          </>
        )}
        {t === 3 && (
          <>
            <Input label="Emergency contact name" {...bind('emergencyContact.name')} />
            <PhoneInput label="Emergency contact phone" value={String(get(form, 'emergencyContact.phone') ?? '')} onChange={v => setForm((f: any) => set(f, 'emergencyContact.phone', v))} />
            <Input label="Relation" {...bind('emergencyContact.relation')} />
            <Select label="ID proof" options={['aadhaar', 'pan', 'driving_license', 'passport', 'voter_id', 'other']} value={form.idProof.type} onChange={v => setForm((f: any) => set(f, 'idProof.type', v))} allowEmpty placeholder="None" />
            <Input label="ID number" {...bind('idProof.number')} />
          </>
        )}
      </Sheet>
    </Screen>
  );
}
