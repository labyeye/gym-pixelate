// Config-driven list/form screens — each mirrors a ResourcePage on the web
// (same fields, same API resource, same filters).
import React, { useState } from 'react';
import { Linking } from 'react-native';
import {
  CalendarClock,
  Layers,
  Megaphone,
  Receipt,
  Ruler,
  Tag,
  UserCheck,
  UserPlus,
  Wallet,
  Wrench,
  LockKeyhole,
  Unlock,
} from 'lucide-react-native';
import ResourceScreen from '../../components/ResourceScreen';
import { MemberPicker } from '../../components/pickers';
import { Btn, Input, Select, Sheet, StatCard, StatGrid, notify } from '../../components/ui';
import { gym } from '../../api/gym';
import { fmtDate, inr, titleCase, todayStr, waLink } from '../../utils/format';

const I = (C: any) => <C size={14} color="#fff" />;

/* ------------------------------------------------------------------ membership plans */
const PLAN_TYPES = ['daily', 'weekly', 'monthly', 'quarterly', 'half_yearly', 'annual', 'corporate', 'custom'];
export function PlansScreen() {
  return (
    <ResourceScreen
      title="Membership Plans"
      noun="plan"
      api={gym.plans}
      filters={[{ key: 'isActive', label: 'plans', options: ['true', 'false'] }]}
      stats={(rows, total) => (
        <StatGrid>
          <StatCard label="Plans" value={total} icon={I(Layers)} color="#024BAB" />
          <StatCard label="On sale" value={rows.filter(r => r.isActive).length} icon={I(Tag)} color="#00C48C" />
        </StatGrid>
      )}
      card={r => ({
        title: r.name,
        subtitle: `${titleCase(r.category)} · ${titleCase(r.type)}`,
        pill: r.isActive ? 'active' : 'inactive',
        value: inr(r.price),
        lines: [
          ['Duration', `${r.durationDays} days`],
          ['GST', `${r.gstPercent}% ${r.priceIncludesGst ? 'incl.' : 'extra'}${r.admissionFee ? ` · +${inr(r.admissionFee)} joining` : ''}`],
          ['Includes', [r.includes?.classes && 'Classes', r.includes?.ptSessions > 0 && `${r.includes.ptSessions} PT`, r.includes?.locker && 'Locker', r.includes?.steamSauna && 'Steam', r.includes?.dietConsult && 'Diet'].filter(Boolean).join(', ') || '—'],
          ['Freeze', r.freezeAllowedDays ? `${r.freezeAllowedDays}d × ${r.maxFreezes}` : 'No'],
        ],
      })}
      fields={[
        { key: 'name', label: 'Plan name', required: true, placeholder: 'Gold – 3 months' },
        { key: 'type', label: 'Duration type', type: 'select', options: PLAN_TYPES, default: 'monthly', required: true },
        { key: 'category', label: 'Category', type: 'select', options: ['gym', 'cardio', 'crossfit', 'yoga', 'zumba', 'personal_training', 'combo', 'other'], default: 'gym' },
        { key: 'durationDays', label: 'Duration (days)', type: 'number', required: true, default: 30, hint: 'Monthly 30 · Quarterly 90 · Half-yearly 180 · Annual 365' },
        { key: 'price', label: 'Price (₹)', type: 'number', required: true },
        { key: 'admissionFee', label: 'Joining fee (₹)', type: 'number', default: 0, hint: "Charged only on a member's first plan" },
        { key: 'gstPercent', label: 'GST %', type: 'number', default: 18 },
        { key: 'priceIncludesGst', label: 'Price includes GST', type: 'checkbox', hint: 'Price already has GST in it' },
        { key: 'freezeAllowedDays', label: 'Freeze days allowed', type: 'number', default: 0, hint: '0 = freezing not allowed' },
        { key: 'maxFreezes', label: 'Max freezes', type: 'number', default: 1 },
        { key: 'gracePeriodDays', label: 'Grace after expiry (days)', type: 'number', default: 0 },
        { key: 'includes.classes', label: 'Group classes', type: 'checkbox', hint: 'Included' },
        { key: 'includes.classCreditsPerMonth', label: 'Class credits / month', type: 'number', default: 0, hint: '0 = unlimited (if classes included)' },
        { key: 'includes.ptSessions', label: 'PT sessions included', type: 'number', default: 0 },
        { key: 'includes.locker', label: 'Locker', type: 'checkbox', hint: 'Included' },
        { key: 'includes.steamSauna', label: 'Steam / sauna', type: 'checkbox', hint: 'Included' },
        { key: 'includes.dietConsult', label: 'Diet consultation', type: 'checkbox', hint: 'Included' },
        { key: 'transferable', label: 'Transferable', type: 'checkbox', hint: 'Member may transfer remaining days' },
        { key: 'isActive', label: 'On sale', type: 'checkbox', default: true, hint: 'Show in sell-membership list' },
        { key: 'description', label: 'Description', type: 'textarea' },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ lockers */
export function LockersScreen() {
  const [assign, setAssign] = useState<any>(null);
  const [member, setMember] = useState<any>(null);
  const [months, setMonths] = useState('1');
  const [reload, setReload] = useState<() => void>(() => () => {});
  const run = async (fn: () => Promise<any>, ok: string) => {
    try {
      await fn();
      notify.success(ok);
      setAssign(null);
      setMember(null);
      reload();
    } catch (e: any) {
      notify.error('Failed', e.message);
    }
  };
  return (
    <ResourceScreen
      title="Lockers"
      noun="locker"
      api={gym.lockers}
      filters={[{ key: 'status', label: 'statuses', options: ['available', 'assigned', 'maintenance'] }, { key: 'zone', label: 'zones', options: ['men', 'women', 'unisex'] }]}
      stats={(rows, total) => (
        <StatGrid>
          <StatCard label="Total lockers" value={total} icon={I(LockKeyhole)} color="#024BAB" />
          <StatCard label="Available" value={rows.filter(r => r.status === 'available').length} icon={I(Unlock)} color="#00C48C" />
        </StatGrid>
      )}
      card={r => ({
        title: `Locker #${r.number}`,
        subtitle: titleCase(r.zone),
        pill: r.status,
        value: inr(r.monthlyRent) + '/mo',
        lines: r.memberId ? [['Member', r.memberId.name], ['Valid till', fmtDate(r.validTill)]] : [],
      })}
      fields={[
        { key: 'number', label: 'Locker number', required: true },
        { key: 'zone', label: 'Zone', type: 'select', options: ['men', 'women', 'unisex'], default: 'unisex' },
        { key: 'monthlyRent', label: 'Monthly rent (₹)', type: 'number', default: 0 },
        { key: 'deposit', label: 'Deposit (₹)', type: 'number', default: 0 },
        { key: 'status', label: 'Status', type: 'select', options: ['available', 'maintenance'], default: 'available', hint: 'Use Assign to give a locker to a member' },
      ]}
      rowActions={(r, rl) => {
        if (reload !== rl) setTimeout(() => setReload(() => rl), 0);
        return [
          { label: 'Assign', tone: 'primary', hidden: r.status !== 'available', onPress: () => setAssign(r) },
          { label: 'Release', hidden: r.status !== 'assigned', onPress: () => run(() => gym.lockers.release(r._id), 'Locker released') },
        ];
      }}
      after={
        <Sheet
          visible={!!assign}
          title={`Assign locker #${assign?.number || ''}`}
          onClose={() => setAssign(null)}
          footer={
            <>
              <Btn light label="Cancel" onPress={() => setAssign(null)} />
              <Btn label="Assign" disabled={!member} onPress={() => run(() => gym.lockers.assign(assign._id, { memberId: member._id, months: Number(months) }), 'Locker assigned')} />
            </>
          }
        >
          <MemberPicker value={member} onChange={setMember} required />
          <Select label="For" options={['1', '3', '6', '12'].map(m => ({ value: m, label: `${m} month${m === '1' ? '' : 's'}` }))} value={months} onChange={setMonths} />
        </Sheet>
      }
    />
  );
}

/* ------------------------------------------------------------------ expenses */
const EXP_CATS = ['rent', 'salary', 'electricity', 'water', 'equipment', 'maintenance', 'marketing', 'supplies', 'software', 'other'];
export function ExpensesScreen() {
  return (
    <ResourceScreen
      title="Expenses"
      noun="expense"
      api={gym.expenses}
      filters={[{ key: 'category', label: 'categories', options: EXP_CATS }]}
      stats={(rows, total) => (
        <StatGrid>
          <StatCard label="Entries" value={total} icon={I(Receipt)} color="#024BAB" />
          <StatCard label="Spend (this page)" value={inr(rows.reduce((s, r) => s + r.amount, 0))} icon={I(Wallet)} color="#EF4444" />
        </StatGrid>
      )}
      card={r => ({
        title: titleCase(r.category),
        subtitle: [fmtDate(r.paidOn), r.vendor].filter(Boolean).join(' · '),
        value: inr(r.amount),
        lines: [['Method', titleCase(r.method)], ...(r.description ? [['Note', r.description] as [string, string]] : [])],
      })}
      fields={[
        { key: 'category', label: 'Category', type: 'select', options: EXP_CATS, required: true, default: 'rent' },
        { key: 'amount', label: 'Amount (₹)', type: 'number', required: true },
        { key: 'paidOn', label: 'Paid on', type: 'date', default: todayStr() },
        { key: 'method', label: 'Method', type: 'select', options: ['cash', 'card', 'upi', 'bank_transfer', 'cheque'], default: 'cash' },
        { key: 'vendor', label: 'Vendor / payee' },
        { key: 'description', label: 'Description', type: 'textarea' },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ coupons */
export function CouponsScreen() {
  return (
    <ResourceScreen
      title="Coupons & Offers"
      noun="coupon"
      api={gym.coupons}
      card={r => ({
        title: r.code,
        subtitle: r.description,
        pill: !r.isActive ? 'inactive' : r.validTill && new Date(r.validTill) < new Date() ? 'expired' : 'active',
        lines: [
          ['Offer', r.type === 'percent' ? `${r.value}% off${r.maxDiscount ? ` (max ${inr(r.maxDiscount)})` : ''}` : `${inr(r.value)} off`],
          ['Min bill', r.minAmount ? inr(r.minAmount) : '—'],
          ['Used', `${r.usedCount}${r.usageLimit ? ` / ${r.usageLimit}` : ''}`],
          ['Valid till', fmtDate(r.validTill)],
        ],
      })}
      fields={[
        { key: 'code', label: 'Code', required: true, placeholder: 'NEWYEAR20' },
        { key: 'type', label: 'Type', type: 'select', options: ['percent', 'flat'], default: 'percent', required: true },
        { key: 'value', label: 'Value (% or ₹)', type: 'number', required: true },
        { key: 'maxDiscount', label: 'Max discount (₹)', type: 'number', hint: 'For % coupons. 0 = no cap' },
        { key: 'minAmount', label: 'Minimum bill (₹)', type: 'number' },
        { key: 'usageLimit', label: 'Usage limit', type: 'number', hint: '0 = unlimited' },
        { key: 'validFrom', label: 'Valid from', type: 'date' },
        { key: 'validTill', label: 'Valid till', type: 'date' },
        { key: 'description', label: 'Description' },
        { key: 'isActive', label: 'Active', type: 'checkbox', default: true, hint: 'Coupon can be used' },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ announcements */
export function AnnouncementsScreen() {
  return (
    <ResourceScreen
      title="Announcements"
      noun="announcement"
      api={gym.announcements}
      stats={(_r, total) => (
        <StatGrid>
          <StatCard label="Announcements" value={total} icon={I(Megaphone)} color="#FA731C" />
        </StatGrid>
      )}
      card={r => ({
        title: `${r.pinned ? '📌 ' : ''}${r.title}`,
        subtitle: r.body,
        pill: r.kind,
        lines: [['Audience', titleCase(r.audience)], ['Publish', fmtDate(r.publishAt)], ['Expires', fmtDate(r.expiresAt)]],
      })}
      fields={[
        { key: 'title', label: 'Title', required: true },
        { key: 'kind', label: 'Type', type: 'select', options: ['notice', 'holiday', 'offer', 'event', 'maintenance'], default: 'notice' },
        { key: 'audience', label: 'Audience', type: 'select', options: ['all', 'active_members', 'expiring', 'staff'], default: 'all' },
        { key: 'publishAt', label: 'Publish on', type: 'date', default: todayStr() },
        { key: 'expiresAt', label: 'Expires on', type: 'date' },
        { key: 'body', label: 'Message', type: 'textarea' },
        { key: 'pinned', label: 'Pin to top', type: 'checkbox', hint: 'Show first' },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ equipment */
const EQ_CATS = ['cardio', 'strength', 'free_weights', 'functional', 'accessory', 'other'];
const EQ_STATUS = ['working', 'under_maintenance', 'out_of_order', 'retired'];
export function EquipmentScreen() {
  const [svc, setSvc] = useState<any>(null);
  const [note, setNote] = useState('');
  const [cost, setCost] = useState('');
  const [reload, setReload] = useState<() => void>(() => () => {});
  const due = (r: any) => r.nextServiceOn && new Date(r.nextServiceOn).getTime() - Date.now() < 7 * 86400000 && r.status !== 'retired';
  return (
    <ResourceScreen
      title="Equipment"
      noun="equipment"
      api={gym.equipment}
      filters={[{ key: 'status', label: 'statuses', options: EQ_STATUS }, { key: 'category', label: 'categories', options: EQ_CATS }]}
      stats={(rows, total) => (
        <StatGrid>
          <StatCard label="Equipment" value={total} icon={I(Wrench)} color="#024BAB" />
          <StatCard label="Service due ≤ 7d" value={rows.filter(due).length} icon={I(Wrench)} color="#FA731C" />
        </StatGrid>
      )}
      card={r => ({
        title: r.name,
        subtitle: [r.brand, r.serialNo].filter(Boolean).join(' · '),
        pill: r.status,
        lines: [['Category', titleCase(r.category)], ['Last service', fmtDate(r.lastServiceOn)], ['Next service', fmtDate(r.nextServiceOn)], ['Warranty', fmtDate(r.warrantyTill)]],
      })}
      fields={[
        { key: 'name', label: 'Name', required: true },
        { key: 'category', label: 'Category', type: 'select', options: EQ_CATS, default: 'strength' },
        { key: 'brand', label: 'Brand' },
        { key: 'serialNo', label: 'Serial no.' },
        { key: 'purchasedOn', label: 'Purchased on', type: 'date' },
        { key: 'purchaseCost', label: 'Purchase cost (₹)', type: 'number' },
        { key: 'warrantyTill', label: 'Warranty till', type: 'date' },
        { key: 'serviceEveryDays', label: 'Service every (days)', type: 'number', default: 90 },
        { key: 'nextServiceOn', label: 'Next service on', type: 'date' },
        { key: 'status', label: 'Status', type: 'select', options: EQ_STATUS, default: 'working' },
      ]}
      rowActions={(r, rl) => {
        if (reload !== rl) setTimeout(() => setReload(() => rl), 0);
        return [{ label: 'Log service', onPress: () => { setSvc(r); setNote(''); setCost(''); } }];
      }}
      after={
        <Sheet
          visible={!!svc}
          title={`Service — ${svc?.name || ''}`}
          onClose={() => setSvc(null)}
          footer={
            <>
              <Btn light label="Cancel" onPress={() => setSvc(null)} />
              <Btn
                label="Save"
                onPress={async () => {
                  try {
                    await gym.equipment.service(svc._id, { note, cost: Number(cost) || 0 });
                    notify.success('Service logged');
                    setSvc(null);
                    reload();
                  } catch (e: any) {
                    notify.error('Failed', e.message);
                  }
                }}
              />
            </>
          }
        >
          <Input label="What was done" value={note} onChangeText={setNote} multiline />
          <Input label="Cost (₹)" value={cost} onChangeText={setCost} keyboardType="decimal-pad" />
        </Sheet>
      }
    />
  );
}

/* ------------------------------------------------------------------ body progress */
export function MeasurementsScreen() {
  const n = (key: string, label: string, step?: string): any => ({ key, label, type: 'number' as const, step });
  return (
    <ResourceScreen
      title="Body Progress"
      noun="measurement"
      api={gym.measurements}
      searchable={false}
      stats={(_r, total) => (
        <StatGrid>
          <StatCard label="Check-ins logged" value={total} icon={I(Ruler)} color="#A855F7" />
        </StatGrid>
      )}
      card={r => ({
        title: r.memberId?.name || 'Member',
        subtitle: `${r.memberId?.memberCode || ''} · ${fmtDate(r.measuredAt)}`,
        lines: [
          ['Weight', r.weightKg ? `${r.weightKg} kg` : '—'],
          ['BMI', r.bmi ?? '—'],
          ['Body fat', r.bodyFatPct ? `${r.bodyFatPct}%` : '—'],
          ['Waist', r.waistCm ? `${r.waistCm} cm` : '—'],
          ['Chest / Arm', [r.chestCm, r.armCm].filter(Boolean).join(' / ') || '—'],
        ],
      })}
      fields={[
        { key: 'memberId', label: 'Member', type: 'member', required: true, createOnly: true },
        { key: 'measuredAt', label: 'Date', type: 'date', default: todayStr() },
        n('weightKg', 'Weight (kg)'),
        n('heightCm', 'Height (cm)'),
        n('bodyFatPct', 'Body fat (%)'),
        n('muscleMassKg', 'Muscle mass (kg)'),
        n('visceralFat', 'Visceral fat'),
        n('restingHr', 'Resting HR (bpm)'),
        n('bpSystolic', 'BP systolic'),
        n('bpDiastolic', 'BP diastolic'),
        n('chestCm', 'Chest (cm)'),
        n('waistCm', 'Waist (cm)'),
        n('hipsCm', 'Hips (cm)'),
        n('armCm', 'Arm (cm)'),
        n('thighCm', 'Thigh (cm)'),
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ]}
    />
  );
}
