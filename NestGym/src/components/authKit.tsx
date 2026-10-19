// Shared pieces of the sign-in / sign-up screens, in the NestHR / NestLeads mobile look:
// blue wavy banner, brand logo, bordered card with icon inputs, "or continue with" row.
import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCircle, Eye, EyeOff } from 'lucide-react-native';
import { C, FONT, S } from '../theme';
import AuthBanner from './AuthBanner';
import FadeInUp from './motion/FadeInUp';
import { brut } from './ui';

const logoLong = require('../assets/logo_long.png');

export function AuthScreen({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.white }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AuthBanner />
          <View style={{ paddingHorizontal: 20, marginTop: -44 }}>
            <FadeInUp delay={50} distance={24} duration={650} style={{ alignItems: 'center' }}>
              <View style={brut({ backgroundColor: C.white, paddingHorizontal: 18, paddingVertical: 6, borderRightWidth: 3, borderBottomWidth: 3 })}>
                <Image source={logoLong} style={{ width: 170, height: 52 }} resizeMode="contain" />
              </View>
            </FadeInUp>
            <FadeInUp delay={150} distance={20} duration={650}>
              <Text style={[S.h1, { fontSize: 26, marginTop: 18 }]}>{title}</Text>
              <Text style={[S.small, { marginTop: 2, marginBottom: 18 }]}>{subtitle}</Text>
            </FadeInUp>
            <FadeInUp delay={250} distance={26} duration={700}>
              {children}
            </FadeInUp>
            <Legal />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export const ErrorBox = ({ text }: { text: string }) =>
  text ? (
    <View style={[S.rowCenter, { gap: 8, backgroundColor: '#FEF2F2', borderWidth: 2, borderColor: C.danger, borderRadius: 8, padding: 10, marginBottom: 14 }]}>
      <AlertCircle size={16} color={C.danger} />
      <Text style={[S.body, { color: C.danger, flex: 1, fontSize: 13 }]}>{text}</Text>
    </View>
  ) : null;

/** Input with a leading icon (HR-mobile style). Pass `secure` for a show/hide eye. */
export function IconInput({
  label,
  icon: Icon,
  secure,
  ...rest
}: TextInputProps & { label: string; icon: any; secure?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[S.label, { fontSize: 11, marginBottom: 5 }]}>{label}</Text>
      <View style={[S.input, { flexDirection: 'row', alignItems: 'center', paddingVertical: 0, paddingHorizontal: 12, gap: 10 }]}>
        <Icon size={16} color={C.primary} />
        <TextInput
          placeholder={`Enter ${label.toLowerCase()}`}
          placeholderTextColor="#9CA3AF"
          {...rest}
          secureTextEntry={secure && !show}
          style={{ flex: 1, fontFamily: FONT.medium, fontSize: 14, color: C.black, paddingVertical: 11 }}
        />
        {secure && (
          <TouchableOpacity onPress={() => setShow(v => !v)} hitSlop={10}>
            {show ? <EyeOff size={16} color={C.black} /> : <Eye size={16} color={C.black} />}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export const OrDivider = ({ text }: { text: string }) => (
  <View style={[S.rowCenter, { gap: 10, marginVertical: 16 }]}>
    <View style={{ flex: 1, height: 1, backgroundColor: '#D1D5DB' }} />
    <Text style={[S.label, { fontSize: 10, color: '#9CA3AF' }]}>{text}</Text>
    <View style={{ flex: 1, height: 1, backgroundColor: '#D1D5DB' }} />
  </View>
);

export const Legal = () => (
  <Text style={[S.small, { textAlign: 'center', marginTop: 22, marginBottom: 18, color: '#6B7280' }]}>
    © 2026 Pixelate Nest.{' '}
    <Text style={{ color: C.primary, fontFamily: FONT.bold }} onPress={() => Linking.openURL('https://www.pixelatenest.com/legal/privacy-policy.html')}>
      Privacy Policy
    </Text>
    {' · '}
    <Text style={{ color: C.primary, fontFamily: FONT.bold }} onPress={() => Linking.openURL('https://www.pixelatenest.com/legal/terms-of-service.html')}>
      Terms of Service
    </Text>
  </Text>
);
