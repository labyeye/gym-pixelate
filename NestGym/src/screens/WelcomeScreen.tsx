import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowRight, BarChart3, CalendarCheck, CheckCircle, CreditCard, Megaphone, ScanFace, Users } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { C, FONT, S } from '../theme';
import { brut, Rise } from '../components/ui';
import FadeInUp from '../components/motion/FadeInUp';
import Pop from '../components/motion/Pop';

const FEATURES = [
  { icon: Users, label: 'Members & Plans', color: '#024BAB' },
  { icon: ScanFace, label: 'Face Check-in', color: '#FA731C' },
  { icon: CreditCard, label: 'Billing & Invoices', color: '#00C48C' },
  { icon: BarChart3, label: 'Reports', color: '#A855F7' },
  { icon: CalendarCheck, label: 'Classes', color: '#EF4444' },
  { icon: Megaphone, label: 'WhatsApp Reminders', color: '#F59E0B' },
];
const STEPS = [
  ['01', 'Add your membership plans', 'Monthly, quarterly and yearly packages'],
  ['02', 'Add your members', 'Enrol them and capture a face for check-in'],
  ['03', 'Invite trainers and staff', 'Give your team their own logins'],
];

/** Shown once after onboarding; `onDone` hands over to the app. */
export default function WelcomeScreen({ onDone }: { onDone: () => void }) {
  const { user, tenant } = useAuth();
  const first = user?.name?.split(' ')[0] || 'there';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F0F6FF' }} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        <FadeInUp distance={24} duration={700}>
          <View style={brut({ backgroundColor: C.white, padding: 0, overflow: 'hidden' })}>
            <View style={{ backgroundColor: C.primary, padding: 22 }}>
              <View style={[S.rowCenter, { gap: 12, marginBottom: 16 }]}>
                <Pop>
                  <View style={{ width: 48, height: 48, backgroundColor: '#fff', borderWidth: 2, borderColor: C.black, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle size={26} color={C.primary} />
                  </View>
                </Pop>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONT.bold, fontSize: 10, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>
                    {tenant?.plan === 'trial' ? 'Free trial started' : 'Subscription active'}
                  </Text>
                  <Text style={{ fontFamily: FONT.bold, fontSize: 15, color: '#fff' }} numberOfLines={2}>
                    {tenant?.name || 'Your gym'} is ready to go
                  </Text>
                </View>
              </View>
              <Text style={{ fontFamily: FONT.bold, fontSize: 28, color: '#fff' }}>Welcome aboard,</Text>
              <Text style={{ fontFamily: FONT.bold, fontSize: 28, color: C.secondary }}>{first}!</Text>
              <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 8 }}>
                Your NestGym workspace is live. Memberships, check-ins, billing and trainers are all set up for you.
              </Text>
            </View>
            <TouchableOpacity onPress={onDone} activeOpacity={0.85} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, backgroundColor: C.secondary, borderTopWidth: 2, borderTopColor: C.black }}>
              <Text style={{ fontFamily: FONT.bold, color: '#fff', textTransform: 'uppercase', fontSize: 13 }}>Go to dashboard</Text>
              <ArrowRight size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </FadeInUp>

        <Text style={[S.label, { marginTop: 22, marginBottom: 10, color: '#9CA3AF', fontSize: 10 }]}>Everything included in your plan</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {FEATURES.map(({ icon: Icon, label, color }, i) => (
            <Rise key={label} index={i} style={{ width: '48%' }}>
              <View style={brut({ backgroundColor: C.white, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderRightWidth: 3, borderBottomWidth: 3 })}>
                <View style={{ width: 28, height: 28, borderWidth: 2, borderColor: C.black, borderRadius: 6, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={14} color={color} />
                </View>
                <Text style={[S.small, { color: C.black, fontFamily: FONT.bold, flex: 1 }]} numberOfLines={1}>{label}</Text>
              </View>
            </Rise>
          ))}
        </View>

        <Text style={[S.label, { marginTop: 22, marginBottom: 10, color: '#9CA3AF', fontSize: 10 }]}>Quick setup checklist</Text>
        {STEPS.map(([n, title, desc], i) => (
          <Rise key={n} index={i + 4}>
            <View style={brut({ backgroundColor: C.white, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderRightWidth: 3, borderBottomWidth: 3 })}>
              <View style={{ width: 36, height: 36, backgroundColor: C.primary, borderWidth: 2, borderColor: C.black, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: FONT.bold, color: '#fff', fontSize: 12 }}>{n}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.h3}>{title}</Text>
                <Text style={S.small}>{desc}</Text>
              </View>
            </View>
          </Rise>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
