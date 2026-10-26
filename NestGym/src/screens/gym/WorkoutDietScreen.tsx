import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';
import { gym } from '../../api/gym';
import { isManager, useAuth } from '../../contexts/AuthContext';
import { useFetch } from '../../hooks/useFetch';
import { C, S } from '../../theme';
import { fmtDate, titleCase } from '../../utils/format';
import { MemberPicker, useTrainers } from '../../components/pickers';
import { Btn, CheckField, Empty, Input, Loader, Pill, Row, Screen, Select, Sheet, StatCard, StatGrid, Tabs, notify, RCard, Pair } from '../../components/ui';
import { Layers as StatLayers, Users as StatUsers } from 'lucide-react-native';

const GOALS = ['weight_loss', 'muscle_gain', 'strength', 'endurance', 'flexibility', 'general_fitness', 'rehab'];
const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'glutes', 'core', 'cardio', 'full_body', 'other'];
const SLOTS = ['early_morning', 'breakfast', 'mid_morning', 'lunch', 'evening_snack', 'pre_workout', 'post_workout', 'dinner', 'bedtime'];
const ex = () => ({ name: '', muscleGroup: 'other', sets: '3', reps: '10', restSec: '60', weightKg: '' });
const day = (n: number) => ({ label: `Day ${n}`, focus: '', exercises: [ex()] });
const meal = () => ({ slot: 'breakfast', items: '', calories: '', proteinG: '' });
const W0 = { name: '', goal: '', level: '', weeks: '4', isTemplate: false, member: null as any, trainerId: '', notes: '', days: [day(1)] };
const D0 = { name: '', type: 'veg', goal: '', targetCalories: '', targetProteinG: '', waterLitres: '3', isTemplate: false, member: null as any, supplements: '', avoid: '', meals: [meal()] };
const num = (v: any) => (v === '' || v === undefined || v === null ? undefined : Number(v));

export default function WorkoutDietScreen() {
  const { user } = useAuth();
  const coach = user?.role === 'trainer' || isManager(user);
  const canWrite = coach;
  const owner = user?.role === 'gym_owner';
  const trainers = useTrainers();
  const [tab, setTab] = useState('workout');
  const [view, setView] = useState('');
  const [edit, setEdit] = useState<any>(null);
  const [w, setW] = useState<any>(W0);
  const [d, setD] = useState<any>(D0);
  const [busy, setBusy] = useState(false);

  const api = tab === 'workout' ? gym.workouts : gym.diets;
  const { data, loading, reload } = useFetch(
    () => api.list({ limit: 100, ...(view === 'templates' ? { isTemplate: 'true' } : view === 'assigned' ? { isTemplate: 'false' } : {}) }),
    [tab, view],
  );
  const rows: any[] = data?.data || [];

  const openNew = (src?: any, asCopy = false) => {
    if (tab === 'workout') {
      setW(src ? { ...W0, ...src, weeks: String(src.weeks), member: asCopy ? null : src.memberId, trainerId: src.trainerId?._id || src.trainerId || '', isTemplate: asCopy ? false : src.isTemplate, name: asCopy ? `${src.name} (copy)` : src.name, days: src.days.map((x: any) => ({ ...x, exercises: x.exercises.map((e: any) => ({ ...e, sets: String(e.sets), restSec: String(e.restSec), weightKg: e.weightKg == null ? '' : String(e.weightKg) })) })) } : W0);
    } else {
      setD(src ? { ...D0, ...src, member: asCopy ? null : src.memberId, isTemplate: asCopy ? false : src.isTemplate, name: asCopy ? `${src.name} (copy)` : src.name, targetCalories: src.targetCalories == null ? '' : String(src.targetCalories), targetProteinG: src.targetProteinG == null ? '' : String(src.targetProteinG), waterLitres: String(src.waterLitres ?? 3), meals: src.meals.map((m: any) => ({ ...m, calories: m.calories == null ? '' : String(m.calories), proteinG: m.proteinG == null ? '' : String(m.proteinG) })) } : D0);
    }
    setEdit(src && !asCopy ? src : 'new');
  };

  const save = async () => {
    try {
      setBusy(true);
      let body: any;
      if (tab === 'workout') {
        if (!w.name.trim()) throw new Error('Give the plan a name');
        body = { name: w.name, goal: w.goal, level: w.level, weeks: Number(w.weeks) || 4, isTemplate: w.isTemplate, notes: w.notes, memberId: w.isTemplate ? undefined : w.member?._id, trainerId: w.trainerId || undefined, days: w.days.map((x: any) => ({ label: x.label, focus: x.focus, exercises: x.exercises.filter((e: any) => e.name.trim()).map((e: any) => ({ name: e.name, muscleGroup: e.muscleGroup, sets: Number(e.sets) || 3, reps: e.reps, restSec: Number(e.restSec) || 60, weightKg: num(e.weightKg) })) })) };
        if (!w.isTemplate && !body.memberId) throw new Error("Pick a member, or tick 'Save as template'");
      } else {
        if (!d.name.trim()) throw new Error('Give the plan a name');
        body = { name: d.name, type: d.type, goal: d.goal, targetCalories: num(d.targetCalories), targetProteinG: num(d.targetProteinG), waterLitres: num(d.waterLitres), isTemplate: d.isTemplate, supplements: d.supplements, avoid: d.avoid, memberId: d.isTemplate ? undefined : d.member?._id, meals: d.meals.filter((m: any) => m.items.trim()).map((m: any) => ({ slot: m.slot, items: m.items, calories: num(m.calories), proteinG: num(m.proteinG) })) };
        if (!d.isTemplate && !body.memberId) throw new Error("Pick a member, or tick 'Save as template'");
      }
      if (edit === 'new') await api.create(body); else await api.update(edit._id, body);
      notify.success('Plan saved');
      setEdit(null);
      reload();
    } catch (e: any) {
      notify.error('Could not save', e.message);
    } finally {
      setBusy(false);
    }
  };
  const del = (r: any) => Alert.alert(`Delete "${r.name}"?`, 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await api.remove(r._id); reload(); } catch (e: any) { notify.error('Failed', e.message); } } }]);

  const setDayAt = (i: number, patch: any) => setW({ ...w, days: w.days.map((x: any, j: number) => (j === i ? { ...x, ...patch } : x)) });
  const setExAt = (i: number, k: number, patch: any) => setDayAt(i, { exercises: w.days[i].exercises.map((e: any, j: number) => (j === k ? { ...e, ...patch } : e)) });
  const setMealAt = (i: number, patch: any) => setD({ ...d, meals: d.meals.map((m: any, j: number) => (j === i ? { ...m, ...patch } : m)) });

  return (
    <Screen title="Workout & Diet" refreshing={loading && !!data} onRefresh={reload} right={canWrite ? <Btn small label="New" icon={<Plus size={14} color="#fff" />} onPress={() => openNew()} /> : undefined}>
      <StatGrid>
        <StatCard label={tab === 'workout' ? 'Workout plans' : 'Diet plans'} value={data?.total ?? 0} icon={<StatLayers />} color="#024BAB" />
        <StatCard label="Templates" value={rows.filter(r => r.isTemplate).length} icon={<StatLayers />} color="#A855F7" />
        <StatCard label="Assigned to members" value={rows.filter(r => !r.isTemplate).length} icon={<StatUsers />} color="#FA731C" />
      </StatGrid>
      <Tabs value={tab} onChange={t => { setTab(t); setView(''); }} tabs={[{ id: 'workout', label: 'Workout' }, { id: 'diet', label: 'Diet' }]} />
      <Tabs value={view} onChange={setView} tabs={[{ id: '', label: 'All' }, { id: 'templates', label: 'Templates' }, { id: 'assigned', label: 'Assigned' }]} />

      {loading && !data ? <Loader /> : rows.length === 0 ? <Empty text="No plans yet" /> : rows.map(r => (
        <RCard key={r._id} style={S.card}>
          <View style={S.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={S.h3}>{r.name}</Text>
              <Text style={S.small}>{r.memberId?.name || 'No member'}{r.trainerId?.name ? ` · ${r.trainerId.name}` : ''}</Text>
            </View>
            {r.isTemplate && <Pill value="template" tone="purple" />}
          </View>
          <Row k="Goal" v={titleCase(r.goal) || '—'} />
          <Row k={tab === 'workout' ? 'Structure' : 'Targets'} v={tab === 'workout' ? `${r.days?.length || 0} days · ${r.weeks} weeks · ${(r.days || []).reduce((s: number, x: any) => s + x.exercises.length, 0)} exercises` : `${r.targetCalories ?? '—'} kcal · ${r.targetProteinG ?? '—'} g protein · ${(r.meals || []).length} meals`} />
          <Row k="Updated" v={fmtDate(r.updatedAt)} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {canWrite && <Btn small light label="Copy" onPress={() => openNew(r, true)} />}
            {canWrite && <Btn small light label="Edit" onPress={() => openNew(r)} />}
            {owner && <Btn small danger label="Delete" onPress={() => del(r)} />}
          </View>
        </RCard>
      ))}

      <Sheet visible={!!edit} title={`${edit === 'new' ? 'New' : 'Edit'} ${tab} plan`} onClose={() => setEdit(null)} footer={<><Btn light label="Cancel" onPress={() => setEdit(null)} /><Btn label="Save plan" busy={busy} onPress={save} /></>}>
        {tab === 'workout' ? (
          <>
            <Pair>
              <Input label="Plan name" required value={w.name} onChangeText={v => setW({ ...w, name: v })} placeholder="PPL 6-day hypertrophy" />
              <Select label="Goal" options={GOALS} value={w.goal} onChange={v => setW({ ...w, goal: v })} allowEmpty placeholder="—" />
            </Pair>
            <Pair>
              <Select label="Level" options={['beginner', 'intermediate', 'advanced']} value={w.level} onChange={v => setW({ ...w, level: v })} allowEmpty placeholder="—" />
              <Input label="Duration (weeks)" keyboardType="number-pad" value={w.weeks} onChangeText={v => setW({ ...w, weeks: v })} />
            </Pair>
            <Select label="Trainer" options={trainers} value={w.trainerId} onChange={v => setW({ ...w, trainerId: v })} allowEmpty placeholder="—" />
            <CheckField label="Template" hint="Save as reusable template" value={w.isTemplate} onChange={v => setW({ ...w, isTemplate: v })} />
            {!w.isTemplate && <MemberPicker label="Assign to member" required value={w.member} onChange={m => setW({ ...w, member: m })} />}
            {w.days.map((dy: any, i: number) => (
              <RCard key={i} style={[S.card, { padding: 10 }]}>
                <Pair>
                  <Input label="Day" value={dy.label} onChangeText={v => setDayAt(i, { label: v })} />
                  <Input label="Focus" placeholder="Chest + Triceps" value={dy.focus} onChangeText={v => setDayAt(i, { focus: v })} />
                </Pair>
                {dy.exercises.map((e: any, k: number) => (
                  <View key={k} style={{ borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 10, marginTop: 4 }}>
                    <Pair>
                      <Input label={`Exercise ${k + 1}`} value={e.name} onChangeText={v => setExAt(i, k, { name: v })} />
                      <Select label="Muscle group" options={MUSCLES} value={e.muscleGroup} onChange={v => setExAt(i, k, { muscleGroup: v })} />
                    </Pair>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}><Input label="Sets" keyboardType="number-pad" value={e.sets} onChangeText={v => setExAt(i, k, { sets: v })} /></View>
                      <View style={{ flex: 1 }}><Input label="Reps" value={e.reps} onChangeText={v => setExAt(i, k, { reps: v })} /></View>
                      <View style={{ flex: 1 }}><Input label="kg" keyboardType="decimal-pad" value={e.weightKg} onChangeText={v => setExAt(i, k, { weightKg: v })} /></View>
                    </View>
                    <Btn small light label="Remove exercise" icon={<Trash2 size={13} color={C.black} />} onPress={() => setDayAt(i, { exercises: dy.exercises.filter((_: any, j: number) => j !== k) })} />
                  </View>
                ))}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <Btn small light label="Exercise" icon={<Plus size={13} color={C.black} />} onPress={() => setDayAt(i, { exercises: [...dy.exercises, ex()] })} />
                  <Btn small danger label="Remove day" onPress={() => setW({ ...w, days: w.days.filter((_: any, j: number) => j !== i) })} />
                </View>
              </RCard>
            ))}
            <View style={{ marginBottom: 14 }}><Btn light small label="Add day" icon={<Plus size={13} color={C.black} />} onPress={() => setW({ ...w, days: [...w.days, day(w.days.length + 1)] })} /></View>
            <Input label="Notes" multiline value={w.notes} onChangeText={v => setW({ ...w, notes: v })} />
          </>
        ) : (
          <>
            <Pair>
              <Input label="Plan name" required value={d.name} onChangeText={v => setD({ ...d, name: v })} placeholder="1800 kcal fat-loss (veg)" />
              <Select label="Diet type" options={['veg', 'non_veg', 'eggetarian', 'vegan', 'jain']} value={d.type} onChange={v => setD({ ...d, type: v })} />
            </Pair>
            <Pair>
              <Select label="Goal" options={['weight_loss', 'muscle_gain', 'maintenance', 'general_health']} value={d.goal} onChange={v => setD({ ...d, goal: v })} allowEmpty placeholder="—" />
              <Input label="Target calories" keyboardType="number-pad" value={d.targetCalories} onChangeText={v => setD({ ...d, targetCalories: v })} />
            </Pair>
            <Pair>
              <Input label="Protein target (g)" keyboardType="number-pad" value={d.targetProteinG} onChangeText={v => setD({ ...d, targetProteinG: v })} />
              <Input label="Water (litres)" keyboardType="decimal-pad" value={d.waterLitres} onChangeText={v => setD({ ...d, waterLitres: v })} />
            </Pair>
            <CheckField hint="Save as reusable template" value={d.isTemplate} onChange={v => setD({ ...d, isTemplate: v })} />
            {!d.isTemplate && <MemberPicker label="Assign to member" required value={d.member} onChange={m => setD({ ...d, member: m })} />}
            <Text style={[S.label, { marginBottom: 6 }]}>Meals</Text>
            {d.meals.map((m: any, i: number) => (
              <RCard key={i} style={[S.card, { padding: 10 }]}>
                <Pair>
                  <Select label="Slot" options={SLOTS} value={m.slot} onChange={v => setMealAt(i, { slot: v })} />
                  <Input label="Items" placeholder="2 roti, dal, sabzi, curd" value={m.items} onChangeText={v => setMealAt(i, { items: v })} />
                </Pair>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}><Input label="kcal" keyboardType="number-pad" value={m.calories} onChangeText={v => setMealAt(i, { calories: v })} /></View>
                  <View style={{ flex: 1 }}><Input label="Protein g" keyboardType="number-pad" value={m.proteinG} onChangeText={v => setMealAt(i, { proteinG: v })} /></View>
                </View>
                <Btn small light label="Remove meal" icon={<Trash2 size={13} color={C.black} />} onPress={() => setD({ ...d, meals: d.meals.filter((_: any, j: number) => j !== i) })} />
              </RCard>
            ))}
            <View style={{ marginBottom: 14 }}><Btn light small label="Add meal" icon={<Plus size={13} color={C.black} />} onPress={() => setD({ ...d, meals: [...d.meals, meal()] })} /></View>
            <Input label="Supplements" multiline value={d.supplements} onChangeText={v => setD({ ...d, supplements: v })} />
            <Input label="Avoid" multiline value={d.avoid} onChangeText={v => setD({ ...d, avoid: v })} />
          </>
        )}
      </Sheet>
    </Screen>
  );
}
