import React, { useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RazorpayCheckout from 'react-native-razorpay';
import { Check, ChevronRight } from 'lucide-react-native';
import { authAPI } from '../api/api';
import { gym } from '../api/gym';
import { useAuth } from '../contexts/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { C, FONT, S } from '../theme';
import { inr, titleCase } from '../utils/format';
import { PhoneInput } from '../components/PhoneInput';
import { Btn, Input, Loader, Row, Rise, Tabs, brut, notify, ToastHost } from '../components/ui';
import FadeInUp from '../components/motion/FadeInUp';
import Pop from '../components/motion/Pop';

const logoLong = require('../assets/logo_long.png');

type Step = 'gym' | 'plan' | 'payment';
const STEPS: { id: Step; label: string }[] = [
  { id: 'gym', label: 'Gym' },
  { id: 'plan', label: 'Plan' },
  { id: 'payment', label: 'Payment' },
];
const CYCLES = [
  { id: 'monthly', label: 'Monthly', months: 1, off: 0 },
  { id: 'quarterly', label: '3 mo', months: 3, off: 10 },
  { id: 'half_yearly', label: '6 mo', months: 6, off: 20 },
  { id: 'yearly', label: 'Yearly', months: 12, off: 30 },
];
const ORDER = ['starter', 'growth', 'pro', 'elite'];
const rupees = (paise: number) => inr(Math.round(paise / 100));

function StepBar({ current }: { current: Step }) {
  const idx = STEPS.findIndex(s => s.id === current);
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', marginBottom: 22 }}>
      {STEPS.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <View key={s.id} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ alignItems: 'center', width: 64 }}>
              <Pop key={`${s.id}-${active}`}>
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderWidth: 2,
                    borderColor: C.black,
                    borderRadius: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: done ? C.primary : active ? C.secondary : C.white,
                  }}
                >
                  {done ? <Check size={16} color="#fff" /> : <Text style={{ fontFamily: FONT.bold, color: active ? '#fff' : '#9CA3AF' }}>{i + 1}</Text>}
                </View>
              </Pop>
              <Text style={{ fontFamily: FONT.bold, fontSize: 9, textTransform: 'uppercase', marginTop: 4, color: active ? C.secondary : done ? C.primary : '#9CA3AF' }}>{s.label}</Text>
            </View>
            {i < STEPS.length - 1 && <View style={{ width: 28, height: 2, marginTop: 16, backgroundColor: i < idx ? C.primary : '#E5E7EB' }} />}
          </View>
        );
      })}
    </View>
  );
}

// Same wizard as NestHR / the web app: gym details -> plan -> Razorpay payment (or start the free trial).
export default function OnboardingScreen() {
  const { user, logout, completeOnboarding } = useAuth();
  const [step, setStep] = useState<Step>('gym');
  const [form, setForm] = useState({ name: '', email: user?.email || '', phone: user?.phone || '', address: '', gst: '', pan: '' });
  const [saving, setSaving] = useState(false);
  const [cycle, setCycle] = useState('yearly');
  const [planKey, setPlanKey] = useState('growth');
  const [paying, setPaying] = useState(false);
  const plansRes = useFetch(() => gym.billing.plans(), []);
  const plans: any = (plansRes.data as any)?.data || {};
  const months = CYCLES.find(c => c.id === cycle)!.months;
  const plan = plans[planKey];
  const total: number | undefined = plan?.prices?.[cycle];
  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const saveDetails = async () => {
    try {
      setSaving(true);
      await authAPI.onboarding(form);
      setStep('plan');
    } catch (e: any) {
      notify.error('Could not save', e.message);
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    const r = await completeOnboarding();
    if (!r.success) throw new Error(r.error || 'Could not finish setup');
  };

  const startTrial = async () => {
    try {
      await finish();
    } catch (e: any) {
      notify.error('Could not start trial', e.message);
    }
  };

  const pay = async () => {
    try {
      setPaying(true);
      const o: any = await gym.billing.razorpayOrder({ plan: planKey, billingCycle: cycle });
      const d = o.data;
      const r = await RazorpayCheckout.open({
        key: d.key,
        order_id: d.orderId,
        amount: d.amount,
        currency: d.currency,
        name: 'NestGym',
        description: `${titleCase(planKey)} · ${CYCLES.find(c => c.id === cycle)?.label}`,
        prefill: { name: d.customerName, email: d.customerEmail, contact: d.customerPhone },
        theme: { color: C.primary },
      });
      await gym.billing.razorpayVerify({ razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature });
      notify.success('Payment successful', 'Your plan is active. Welcome to NestGym!');
      await finish();
    } catch (e: any) {
      // closing the checkout window rejects with a code/description, not an Error
      const msg = e?.description || e?.message || 'Please try again.';
      if (!/cancel/i.test(String(msg))) notify.error('Could not complete payment', String(msg));
    } finally {
      setPaying(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F0F6FF' }} edges={['top', 'bottom']}>
      <View style={[S.rowBetween, { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.white, borderBottomWidth: 2, borderBottomColor: C.black }]}>
        <Image source={logoLong} style={{ width: 130, height: 40 }} resizeMode="contain" />
        <TouchableOpacity onPress={logout} hitSlop={10}>
          <Text style={[S.label, { color: C.primary }]}>Logout</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <StepBar current={step} />

        {step === 'gym' && (
          <FadeInUp key="gym" distance={18}>
            <Text style={[S.h1, { textAlign: 'center' }]}>Set up your gym</Text>
            <Text style={[S.small, { textAlign: 'center', marginBottom: 16 }]}>Your business details. These appear on member invoices.</Text>
            <View style={brut({ backgroundColor: C.white, padding: 16 })}>
              <Input label="Gym name" required value={form.name} onChangeText={set('name')} placeholder="Iron Paradise Fitness" />
              <Input label="Gym email" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={set('email')} placeholder="gym@example.com" />
              <PhoneInput label="Phone" required value={form.phone} onChange={set('phone')} />
              <Input label="Address" multiline value={form.address} onChangeText={set('address')} placeholder="Street, area, city" />
              <Input label="GST number" autoCapitalize="characters" maxLength={15} value={form.gst} onChangeText={v => set('gst')(v.toUpperCase())} placeholder="27AABCT1234A1Z5" />
              <Input label="PAN number" autoCapitalize="characters" maxLength={10} value={form.pan} onChangeText={v => set('pan')(v.toUpperCase())} placeholder="AAAAA0000A" />
              <Btn label="Continue to plans" busy={saving} disabled={form.name.trim().length < 2 || !form.phone} onPress={saveDetails} icon={<ChevronRight size={16} color="#fff" />} />
            </View>
          </FadeInUp>
        )}

        {step === 'plan' && (
          <FadeInUp key="plan" distance={18}>
            <Text style={[S.h1, { textAlign: 'center' }]}>Choose your plan</Text>
            <Text style={[S.small, { textAlign: 'center', marginBottom: 14 }]}>Longer terms cost less per month. Prices exclude GST.</Text>
            <Tabs fill value={cycle} onChange={setCycle} tabs={CYCLES.map(c => ({ id: c.id, label: c.off ? `${c.label} -${c.off}%` : c.label }))} />
            {plansRes.loading && !plansRes.data ? (
              <Loader />
            ) : (
              ORDER.filter(k => plans[k]).map((k, i) => {
                const p = plans[k];
                const on = planKey === k;
                const t = p.prices?.[cycle];
                return (
                  <Rise key={k} index={i}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setPlanKey(k)}
                      style={brut({ backgroundColor: C.white, padding: 14, marginBottom: 12, borderColor: on ? C.primary : C.black, borderRightColor: on ? C.primary : '#0A0A0A', borderBottomColor: on ? C.primary : '#0A0A0A' })}
                    >
                      <View style={S.rowBetween}>
                        <Text style={S.h2}>{p.name}</Text>
                        {on ? <Check size={20} color={C.primary} /> : p.popular ? <Text style={[S.label, { color: C.secondary, fontSize: 10 }]}>Popular</Text> : null}
                      </View>
                      <Text style={[S.small, { marginBottom: 6 }]}>{p.members == null ? 'Unlimited members' : `Up to ${p.members} members`}</Text>
                      {t != null && (
                        <Text style={{ fontFamily: FONT.bold, fontSize: 24, color: C.primary }}>
                          {rupees(t / months)}
                          <Text style={[S.small, { fontSize: 12 }]}> /mo</Text>
                        </Text>
                      )}
                      {t != null && months > 1 && <Text style={S.small}>{rupees(t)} every {months} months</Text>}
                      {(p.features || []).slice(0, 4).map((f: string) => (
                        <View key={f} style={{ flexDirection: 'row', gap: 6, marginTop: 5 }}>
                          <Check size={12} color={C.primary} style={{ marginTop: 3 }} />
                          <Text style={[S.small, { flex: 1, color: C.black }]}>{f}</Text>
                        </View>
                      ))}
                    </TouchableOpacity>
                  </Rise>
                );
              })
            )}
            <Btn label="Continue to payment" disabled={!plan} onPress={() => setStep('payment')} icon={<ChevronRight size={16} color="#fff" />} />
            <TouchableOpacity onPress={() => setStep('gym')} style={{ alignItems: 'center', marginTop: 14 }}>
              <Text style={[S.label, { color: '#6B7280' }]}>← Back</Text>
            </TouchableOpacity>
          </FadeInUp>
        )}

        {step === 'payment' && (
          <FadeInUp key="payment" distance={18}>
            <Text style={[S.h1, { textAlign: 'center' }]}>Confirm & pay</Text>
            <Text style={[S.small, { textAlign: 'center', marginBottom: 16 }]}>A secure Razorpay window will open to complete your payment.</Text>
            <View style={brut({ backgroundColor: C.white, padding: 16, marginBottom: 14 })}>
              <Text style={[S.label, { marginBottom: 8 }]}>Order summary</Text>
              <Row k="Plan" v={`NestGym ${titleCase(planKey)}`} bold />
              <Row k="Members" v={plan?.members == null ? 'Unlimited' : `Up to ${plan.members}`} />
              <Row k="Term" v={CYCLES.find(c => c.id === cycle)?.label} />
              {total != null && <Row k="Per month" v={rupees(total / months)} />}
              <View style={{ borderTopWidth: 2, borderTopColor: C.black, marginTop: 8, paddingTop: 8 }}>
                <Row k="Total (excl. GST)" v={total != null ? rupees(total) : '—'} bold color={C.primary} />
              </View>
            </View>
            <Btn label={`Pay ${total != null ? rupees(total) : ''} via Razorpay`} busy={paying} disabled={total == null} onPress={pay} />
            <Text style={[S.small, { textAlign: 'center', marginTop: 10 }]}>Secured by Razorpay · PCI-DSS compliant</Text>
            <TouchableOpacity onPress={() => setStep('plan')} style={{ alignItems: 'center', marginTop: 14 }}>
              <Text style={[S.label, { color: '#6B7280' }]}>← Back to plan selection</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={startTrial} disabled={paying} style={{ alignItems: 'center', marginTop: 12 }}>
              <Text style={[S.label, { color: C.primary }]}>Not ready? Start the free trial instead</Text>
            </TouchableOpacity>
          </FadeInUp>
        )}
      </ScrollView>
      <ToastHost />
    </SafeAreaView>
  );
}
