import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Lock, Mail, Smartphone } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { C, S } from '../theme';
import { PhoneInput } from '../components/PhoneInput';
import { Btn, Input } from '../components/ui';
import { AuthScreen, ErrorBox, IconInput, OrDivider } from '../components/authKit';

export default function LoginScreen() {
  const nav = useNavigation<any>();
  const { login, otpSend, loginWithOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpMode, setOtpMode] = useState(false);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submit = async () => {
    setError('');
    setInfo('');
    setLoading(true);
    let r: { success: boolean; error?: string };
    if (!otpMode) r = await login(email, password);
    else if (!otpSent) {
      r = await otpSend(phone);
      if (r.success) {
        setOtpSent(true);
        setInfo('OTP sent. Check WhatsApp for your 6-digit code.');
      }
    } else r = await loginWithOtp(phone, otp);
    setLoading(false);
    if (!r.success) setError(r.error || 'Login failed. Please check your credentials.');
  };

  const switchMode = () => {
    setOtpMode(m => !m);
    setError('');
    setInfo('');
    setOtpSent(false);
    setOtp('');
  };

  return (
    <AuthScreen
      title={otpMode ? (otpSent ? 'Enter OTP' : 'Phone login') : 'Welcome back'}
      subtitle={
        otpMode
          ? otpSent
            ? 'We sent a 6-digit OTP to your WhatsApp.'
            : "We'll send a one-time password to your WhatsApp."
          : 'Sign in to manage your gym'
      }
    >
      <ErrorBox text={error} />
      {!!info && (
        <View style={{ backgroundColor: '#DCFCE7', borderWidth: 2, borderColor: C.success, borderRadius: 8, padding: 10, marginBottom: 14 }}>
          <Text style={[S.body, { fontSize: 13 }]}>{info}</Text>
        </View>
      )}

      {otpMode ? (
        <>
          <PhoneInput label="WhatsApp number" value={phone} onChange={setPhone} editable={!otpSent} />
          {otpSent && <Input label="6-digit code" keyboardType="number-pad" maxLength={6} value={otp} onChangeText={setOtp} autoFocus placeholder="000000" />}
        </>
      ) : (
        <>
          <IconInput label="Email" icon={Mail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={email} onChangeText={setEmail} placeholder="you@gym.com" />
          <IconInput label="Password" icon={Lock} secure value={password} onChangeText={setPassword} placeholder="••••••••" onSubmitEditing={submit} />
        </>
      )}

      <Btn
        label={otpMode ? (otpSent ? 'Verify & sign in' : 'Send WhatsApp OTP') : 'Sign in'}
        busy={loading}
        onPress={submit}
        disabled={otpMode ? !phone : !email || !password}
      />

      <OrDivider text="Or login with" />
      <View style={{ alignItems: 'center' }}>
        <TouchableOpacity
          onPress={switchMode}
          activeOpacity={0.85}
          style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.primary, borderWidth: 2, borderColor: C.black, alignItems: 'center', justifyContent: 'center' }}
        >
          {otpMode ? <Mail size={22} color="#fff" /> : <Smartphone size={22} color="#fff" />}
        </TouchableOpacity>
        <Text style={[S.label, { fontSize: 10, marginTop: 6 }]}>{otpMode ? 'Email' : 'Phone OTP'}</Text>
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: '#E5E7EB', marginTop: 20, paddingTop: 16, alignItems: 'center' }}>
        <Text style={S.small}>
          New to NestGym?{' '}
          <Text style={{ color: C.primary, fontFamily: 'DMSans-Bold' }} onPress={() => nav.navigate('Register')}>
            Create an account
          </Text>
        </Text>
      </View>
    </AuthScreen>
  );
}
