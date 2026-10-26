import React, { useMemo, useState } from 'react';
import { Alert, Linking, Share, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowUpDown, Download, Pencil, Plus, SlidersHorizontal, Trash2, Upload } from 'lucide-react-native';
import { gym } from '../api/gym';
import { isManager, useAuth } from '../contexts/AuthContext';
import { useDebounced, useFetch } from '../hooks/useFetch';
import { C, FONT, S } from '../theme';
import { daysFromNow, fmtDate, inr, toInputDate, waLink } from '../utils/format';
import { PhoneInput } from '../components/PhoneInput';
import { usePlans, useTrainers } from '../components/pickers';
import { Avatar, PhotoPicker } from '../components/PhotoPicker';
import { METHODS, SellMembershipSheet } from '../components/gymSheets';
import WhatsAppIcon from '../components/WhatsAppIcon';
import { Btn, CheckField, Empty, IconBtn, Input, Loader, Pager, Pair, Pill, Screen, SearchBox, Select, Sheet, Tabs, notify, Rise } from '../components/ui';
import ExportSheet, { ExportSpec } from '../components/ExportSheet';

const GOALS = ['weight_loss', 'muscle_gain', 'strength', 'endurance', 'flexibility', 'general_fitness', 'rehab', 'sports'];
const SOURCES = ['walk_in', 'referral', 'instagram', 'facebook', 'google', 'website', 'whatsapp', 'poster', 'corporate', 'other'];
const CONDITIONS = ['Diabetes', 'Hypertension', 'Heart condition', 'Asthma', 'Thyroid', 'PCOS', 'Back pain', 'Knee issue', 'Epilepsy'];
const SORTS = [
  { value: '-createdAt', label: 'Newest first' },
  { value: 'createdAt', label: 'Oldest first' },
  { value: 'name', label: 'Name A → Z' },
  { value: '-name', label: 'Name Z → A' },
];
const PLAN_STATES = [
  { value: '', label: 'Any' },
  { value: 'active', label: 'Active plan' },
  { value: 'expiring', label: 'Expiring in 7 days' },
  { value: 'expired', label: 'Expired' },
  { value: 'dues', label: 'Has dues' },
  { value: 'none', label: 'No plan' },
];
const EMPTY = {
  name: '', phone: '', altPhone: '', email: '', gender: 'male', dob: '', occupation: '', address: '', city: '', state: '', pincode: '',
  health: { bloodGroup: '', conditions: [] as string[], injuries: '', allergies: '', medications: '', pregnant: false, doctorClearance: false },
  fitness: { goal: '', level: '', heightCm: '', startWeightKg: '', targetWeightKg: '', preferredSlot: '' },
  source: 'walk_in', photo: '', trainerId: '', emergencyContact: { name: '', phone: '', relation: '' }, idProof: { type: '', number: '' }, notes: '', acceptDeclaration: false,
};
const NO_FILTERS = { planStatus: '', gender: '' };

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
const csvCell = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export default function MembersScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const canWrite = user?.role === 'gym_owner' || isManager(user);
  const [search, setSearch] = useState('');
  const dsearch = useDebounced(search);
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('-createdAt');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [sheet, setSheet] = useState<'sort' | 'filter' | 'import' | null>(null);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [tab, setTab] = useState('0');
  const [saving, setSaving] = useState(false);
  const [exp, setExp] = useState<ExportSpec | null>(null);
  const [sell, setSell] = useState<any>(null);
  const [planId, setPlanId] = useState('');
  const [payNow, setPayNow] = useState('');
  const [method, setMethod] = useState('cash');
  const trainers = useTrainers();
  const plans = usePlans(true);

  const params = useMemo(
    () => ({ page, limit: 25, search: dsearch, status, sort, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }),
    [page, dsearch, status, sort, filters],
  );
  const { data, loading, reload } = useFetch(() => gym.members.list(params), [params]);
  const members: any[] = data?.data || [];
  const t = Number(tab);
  const isNew = editing === 'new';
  const TABS = [
    { id: '0', label: 'Basic' },
    ...(isNew ? [{ id: '1', label: 'Plan' }] : []),
    { id: '2', label: 'Health' },
    { id: '3', label: 'Fitness' },
    { id: '4', label: 'ID' },
  ];
  const order = TABS.map(x => x.id);
  const at = order.indexOf(tab);
  const filtersOn = Object.values(filters).some(Boolean) || !!status;

  const openNew = () => { setForm(EMPTY); setTab('0'); setPlanId(''); setPayNow(''); setMethod('cash'); setEditing('new'); };
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

  const plan = plans.find((p: any) => p._id === planId);
  const planTotal = plan ? Math.round((plan.price + (plan.priceIncludesGst ? 0 : (plan.price * (plan.gstPercent || 0)) / 100)) * 100) / 100 : 0;

  const save = async () => {
    if (!form.name.trim() || !form.phone.trim()) { setTab('0'); return notify.error('Name and phone are required'); }
    const body = JSON.parse(JSON.stringify(form));
    for (const k of ['heightCm', 'startWeightKg', 'targetWeightKg']) body.fitness[k] = body.fitness[k] === '' ? undefined : Number(body.fitness[k]);
    if (!body.dob) delete body.dob;
    if (!body.trainerId || !isNew) delete body.trainerId; // trainer is picked only when adding
    if (!body.idProof.type) delete body.idProof;
    try {
      setSaving(true);
      if (isNew) {
        const created = await gym.members.create(body);
        if (planId) {
          try {
            const memberId = created?.data?._id || created?._id;
            const pay = payNow === '' ? planTotal : Number(payNow);
            const res = await gym.memberships.create({
              memberId, planId, payNow: pay, method, idempotencyKey: `${memberId}-${planId}-${Date.now()}`,
            });
            notify.success('Member added', `${form.name} · ${res.invoice?.invoiceNumber || plan?.name}`);
          } catch (e: any) {
            notify.error('Member added, plan not sold', e.message);
          }
        } else notify.success('Member added', form.name);
      } else {
        await gym.members.update(editing._id, body);
        notify.success('Member updated', form.name);
      }
      setEditing(null);
      reload();
    } catch (e: any) {
      notify.error('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = (m: any) =>
    Alert.alert(`Delete ${m.name}?`, 'Members with plan or invoice history are deactivated instead of erased.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const r = await gym.members.remove(m._id);
            notify.success(r?.message || 'Member deleted', m.name);
            reload();
          } catch (e: any) {
            notify.error('Delete failed', e.message);
          }
        },
      },
    ]);

  // everything the current search / filters match (all pages), as Excel or PDF
  const exportMembers = () =>
    setExp({
      name: 'Members',
      cols: [
        { header: 'Member code', value: (m: any) => m.memberCode },
        { header: 'Name', value: (m: any) => m.name },
        { header: 'Phone', value: (m: any) => m.phone },
        { header: 'Email', value: (m: any) => m.email },
        { header: 'Gender', value: (m: any) => m.gender },
        { header: 'Status', value: (m: any) => m.status },
        { header: 'Plan', value: (m: any) => m.currentMembership?.planName },
        { header: 'Valid till', value: (m: any) => (m.currentMembership?.endDate ? fmtDate(m.currentMembership.endDate) : '') },
        { header: 'Dues', value: (m: any) => m.currentMembership?.due || 0 },
      ],
      rows: async () => (await gym.members.list({ ...params, page: 1, limit: 1000 })).data || [],
    });

  // "name, phone, email, gender" per line (a header line is skipped)
  const runImport = async () => {
    const lines = importText.split('\n').map(l => l.trim()).filter(Boolean);
    const rows = lines.map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, ''))).filter(r => r[0] && r[1] && !/^name$/i.test(r[0]));
    if (!rows.length) return notify.error('Nothing to import', 'Use one member per line: name, phone, email, gender');
    setImporting(true);
    let ok = 0;
    let failed = 0;
    for (const [name, phone, email, gender] of rows) {
      try {
        await gym.members.create({ name, phone, email: email || undefined, gender: ['male', 'female', 'other'].includes((gender || '').toLowerCase()) ? gender.toLowerCase() : 'male', source: 'other' });
        ok++;
      } catch {
        failed++;
      }
    }
    setImporting(false);
    notify[failed ? 'error' : 'success']('Import finished', `${ok} added${failed ? ` · ${failed} failed (duplicate or invalid)` : ''}`);
    if (ok) { setSheet(null); setImportText(''); reload(); }
  };

  return (
    <Screen
      title="Members"
      refreshing={loading && !!data}
      onRefresh={reload}
      right={
        <>
          <Btn small label="Export" icon={<Download />} onPress={exportMembers} />
          {canWrite && <Btn small label="Import" icon={<Upload />} onPress={() => setSheet('import')} />}
          <Btn small label="Sort" icon={<ArrowUpDown />} onPress={() => setSheet('sort')} />
          <Btn small label="Filter" icon={<SlidersHorizontal color={filtersOn ? C.secondary : C.black} />} onPress={() => setSheet('filter')} />
          {canWrite && <Btn small label="Add" icon={<Plus />} onPress={openNew} />}
        </>
      }
    >
      <SearchBox value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Name, phone or member code…" />

      {loading && !data ? <Loader /> : members.length === 0 ? <Empty text="No members found" /> : members.map(m => {
        const c = m.currentMembership;
        const left = c ? daysFromNow(c.endDate) : null;
        const tone = left == null ? C.black : left < 0 ? C.danger : left <= 7 ? '#C2410C' : '#15803D';
        return (
          <Rise key={m._id}>
            <TouchableOpacity activeOpacity={0.85} onPress={() => nav.navigate('MemberProfile', { id: m._id })} style={[S.card, { padding: 12 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar uri={m.photo} name={m.name} size={48} round />
                <View style={{ flex: 1 }}>
                  <Text style={S.h3} numberOfLines={1}>{m.name}</Text>
                  <Text style={S.small} numberOfLines={1}>{m.memberCode} · {m.phone}</Text>
                </View>
                <Pill value={m.status} />
              </View>
              <View style={{ flexDirection: 'row', marginTop: 10, borderTopWidth: 1, borderColor: '#E5E7EB', paddingTop: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[S.small, { fontSize: 10, textTransform: 'uppercase' }]}>Plan</Text>
                  <Text style={[S.body, { fontFamily: FONT.bold }]} numberOfLines={1}>{c ? c.planName : 'No plan'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[S.small, { fontSize: 10, textTransform: 'uppercase' }]}>{c?.due > 0 ? 'Dues' : 'Valid till'}</Text>
                  {c?.due > 0 ? (
                    <Text style={[S.body, { fontFamily: FONT.bold, color: C.danger }]}>{inr(c.due)}</Text>
                  ) : (
                    <Text style={[S.body, { fontFamily: FONT.bold, color: tone }]} numberOfLines={1}>
                      {c ? `${fmtDate(c.endDate)} · ${left! < 0 ? `${-left!}d ago` : `${left}d`}` : '—'}
                    </Text>
                  )}
                </View>
              </View>
              <View style={[S.rowBetween, { marginTop: 6 }]}>
                <Btn small label={c ? 'Renew' : 'Sell'} onPress={() => setSell(m)} />
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity hitSlop={8} style={{ padding: 6 }} onPress={() => { const u = waLink(m.phone, `Hi ${m.name}, `); if (u) Linking.openURL(u); }} accessibilityLabel="WhatsApp">
                    <WhatsAppIcon size={20} />
                  </TouchableOpacity>
                  {canWrite && <IconBtn icon={Pencil} label="Edit" onPress={() => openEdit(m)} />}
                  {canWrite && <IconBtn icon={Trash2} label="Delete" color={C.danger} onPress={() => remove(m)} />}
                </View>
              </View>
            </TouchableOpacity>
          </Rise>
        );
      })}
      <Pager page={page} pages={data?.pages || 1} onPage={setPage} />

      <SellMembershipSheet open={!!sell} member={sell} mode="sell" onClose={() => { setSell(null); reload(); }} />

      <Sheet visible={sheet === 'sort'} title="Sort by" onClose={() => setSheet(null)}>
        {SORTS.map(o => (
          <TouchableOpacity key={o.value} onPress={() => { setSort(o.value); setPage(1); setSheet(null); }} style={[S.rowBetween, { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }]}>
            <Text style={[S.body, sort === o.value && { fontFamily: FONT.bold, color: C.primary }]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </Sheet>

      <Sheet
        visible={sheet === 'filter'}
        title="Filter members"
        onClose={() => setSheet(null)}
        footer={<><Btn light label="Clear" onPress={() => { setFilters(NO_FILTERS); setStatus(''); setPage(1); }} /><Btn label="Done" onPress={() => setSheet(null)} /></>}
      >
        <Tabs
          value={status}
          onChange={v => { setStatus(v); setPage(1); }}
          tabs={[{ id: '', label: 'All' }, { id: 'active', label: 'Active' }, { id: 'inactive', label: 'Inactive' }, { id: 'blacklisted', label: 'Blacklisted' }]}
        />
        <Pair>
          <Select label="Plan status" options={PLAN_STATES} value={filters.planStatus} onChange={v => { setFilters(f => ({ ...f, planStatus: v })); setPage(1); }} />
          <Select label="Gender" options={[{ value: '', label: 'Any' }, 'male', 'female', 'other']} value={filters.gender} onChange={v => { setFilters(f => ({ ...f, gender: v })); setPage(1); }} />
        </Pair>
      </Sheet>

      <Sheet
        visible={sheet === 'import'}
        title="Import members"
        subtitle="One member per line: name, phone, email, gender"
        onClose={() => setSheet(null)}
        footer={<><Btn light label="Cancel" onPress={() => setSheet(null)} /><Btn label="Import" busy={importing} onPress={runImport} /></>}
      >
        <Input label="Members" multiline placeholder={'Asha Rao, 9876543210, asha@mail.com, female\nRahul, 9123456780, , male'} value={importText} onChangeText={setImportText} style={{ minHeight: 160 }} />
      </Sheet>

      <Sheet
        visible={!!editing}
        title={isNew ? 'Add member' : `Edit ${editing?.name || ''}`}
        subtitle={!isNew ? editing?.memberCode : 'A member code is generated automatically'}
        onClose={() => setEditing(null)}
        footer={
          <>
            {at > 0 && <Btn light label="Back" onPress={() => setTab(order[at - 1])} />}
            {at < order.length - 1 ? <Btn label="Next" onPress={() => setTab(order[at + 1])} /> : <Btn label="Save member" busy={saving} onPress={save} />}
          </>
        }
      >
        <Tabs fill tabs={TABS} value={tab} onChange={setTab} />
        {t === 0 && (
          <>
            <PhotoPicker label="Photo" name={form.name} value={form.photo || ''} onChange={url => setForm((f: any) => ({ ...f, photo: url }))} />
            <Pair>
              <Input label="Full name" required {...bind('name')} />
              <Select label="Gender" options={['male', 'female', 'other']} value={form.gender} onChange={v => setForm((f: any) => ({ ...f, gender: v }))} />
            </Pair>
            <Pair>
              <PhoneInput label="Mobile" required value={String(get(form, 'phone') ?? '')} onChange={v => setForm((f: any) => set(f, 'phone', v))} />
              <PhoneInput label="Alternate mobile" value={String(get(form, 'altPhone') ?? '')} onChange={v => setForm((f: any) => set(f, 'altPhone', v))} />
            </Pair>
            <Pair>
              <Input label="Email" keyboardType="email-address" autoCapitalize="none" {...bind('email')} />
              <Input label="Date of birth" placeholder="YYYY-MM-DD" {...bind('dob')} />
            </Pair>
            <Pair>
              <Input label="Occupation" {...bind('occupation')} />
              <Input label="Pincode" keyboardType="number-pad" {...bind('pincode')} />
            </Pair>
            <Pair>
              <Input label="City" {...bind('city')} />
              <Input label="State" {...bind('state')} />
            </Pair>
            <Input label="Address" multiline {...bind('address')} />
          </>
        )}
        {t === 1 && (
          <>
            <Text style={[S.small, { marginBottom: 12 }]}>Pick the plan this member is taking and its duration. Leave empty to add the member now and sell a plan later.</Text>
            <Select
              label="Membership plan"
              allowEmpty
              placeholder="No plan yet"
              value={planId}
              onChange={v => { setPlanId(v); setPayNow(''); }}
              options={plans.map((p: any) => ({ value: p._id, label: `${p.name} — ${p.durationDays >= 30 ? `${Math.round(p.durationDays / 30)} month${Math.round(p.durationDays / 30) > 1 ? 's' : ''}` : `${p.durationDays} days`} · ${inr(p.price)}` }))}
            />
            {plan && (
              <>
                <View style={{ backgroundColor: '#EFF6FF', borderRadius: 8, borderWidth: 2, borderColor: C.black, padding: 10, marginBottom: 14 }}>
                  <View style={S.rowBetween}><Text style={S.small}>Duration</Text><Text style={S.body}>{plan.durationDays} days</Text></View>
                  <View style={S.rowBetween}><Text style={S.small}>Total with GST</Text><Text style={[S.body, { fontFamily: FONT.bold }]}>{inr(planTotal)}</Text></View>
                  {!!plan.admissionFee && <Text style={[S.small, { marginTop: 4 }]}>Joining fee of {inr(plan.admissionFee)} is added automatically for new members.</Text>}
                </View>
                <Pair>
                  <Input label="Collect now (₹)" keyboardType="decimal-pad" placeholder={String(planTotal)} value={payNow} onChangeText={setPayNow} />
                  <Select label="Payment method" options={METHODS} value={method} onChange={setMethod} />
                </Pair>
              </>
            )}
          </>
        )}
        {t === 2 && (
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
            <Pair>
              <Input label="Allergies" {...bind('health.allergies')} />
              <Input label="Medications" {...bind('health.medications')} />
            </Pair>
            <Input label="Past injuries / surgeries" {...bind('health.injuries')} />
            {form.gender === 'female' && <CheckField hint="Pregnant / postnatal" value={form.health.pregnant} onChange={v => setForm((f: any) => set(f, 'health.pregnant', v))} />}
            <CheckField hint="Has doctor's clearance" value={form.health.doctorClearance} onChange={v => setForm((f: any) => set(f, 'health.doctorClearance', v))} />
            {isNew && <CheckField hint="Member confirms the health details are correct and accepts the gym's liability waiver." value={form.acceptDeclaration} onChange={v => setForm((f: any) => ({ ...f, acceptDeclaration: v }))} />}
          </>
        )}
        {t === 3 && (
          <>
            <Pair>
              <Select label="Primary goal" options={GOALS} value={form.fitness.goal} onChange={v => setForm((f: any) => set(f, 'fitness.goal', v))} allowEmpty placeholder="—" />
              <Select label="Experience" options={['beginner', 'intermediate', 'advanced']} value={form.fitness.level} onChange={v => setForm((f: any) => set(f, 'fitness.level', v))} allowEmpty placeholder="—" />
            </Pair>
            <Pair>
              <Input label="Height (cm)" keyboardType="decimal-pad" {...bind('fitness.heightCm')} />
              <Input label="Start weight (kg)" keyboardType="decimal-pad" {...bind('fitness.startWeightKg')} />
            </Pair>
            <Pair>
              <Input label="Target weight (kg)" keyboardType="decimal-pad" {...bind('fitness.targetWeightKg')} />
              <Select label="Preferred slot" options={['early_morning', 'morning', 'afternoon', 'evening', 'night']} value={form.fitness.preferredSlot} onChange={v => setForm((f: any) => set(f, 'fitness.preferredSlot', v))} allowEmpty placeholder="—" />
            </Pair>
            <Pair>
              {isNew ? <Select label="Trainer (optional)" options={trainers} value={form.trainerId} onChange={v => setForm((f: any) => ({ ...f, trainerId: v }))} allowEmpty placeholder="No trainer" /> : <View />}
              <Select label="How did they find us?" options={SOURCES} value={form.source} onChange={v => setForm((f: any) => ({ ...f, source: v }))} />
            </Pair>
            <Input label="Notes" multiline {...bind('notes')} />
          </>
        )}
        {t === 4 && (
          <>
            <Pair>
              <Input label="Emergency contact" {...bind('emergencyContact.name')} />
              <Input label="Relation" {...bind('emergencyContact.relation')} />
            </Pair>
            <PhoneInput label="Emergency contact phone" value={String(get(form, 'emergencyContact.phone') ?? '')} onChange={v => setForm((f: any) => set(f, 'emergencyContact.phone', v))} />
            <Pair>
              <Select label="ID proof" options={['aadhaar', 'pan', 'driving_license', 'passport', 'voter_id', 'other']} value={form.idProof.type} onChange={v => setForm((f: any) => set(f, 'idProof.type', v))} allowEmpty placeholder="None" />
              <Input label="ID number" {...bind('idProof.number')} />
            </Pair>
          </>
        )}
      </Sheet>
      <ExportSheet spec={exp} onClose={() => setExp(null)} />
    </Screen>
  );
}
