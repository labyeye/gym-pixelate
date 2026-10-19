import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Lock, Mail, User } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { S } from '../theme';
import { PhoneInput } from '../components/PhoneInput';
import { Btn } from '../components/ui';
import { AuthScreen, ErrorBox, IconInput } from '../components/authKit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same flow as NestHR: a short signup, then the onboarding wizard collects the gym details and payment.
export default function RegisterScreen() {
  const nav = useNavigation<any>();
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof form) => (v: string) => {
    setForm(f => ({ ...f, [k]: v }));
    setError('');
  };

  const submit = async () => {
    if (form.name.trim().length < 2) return setError('Please enter your full name.');
    if (!EMAIL_RE.test(form.email.trim())) return setError('Please enter a valid email address.');
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    setLoading(true);
    const r = await register({ ...form, name: form.name.trim() });
    setLoading(false);
    if (!r.success) setError(r.error || 'Registration failed.');
    // on success the navigator moves on to the onboarding wizard by itself
  };

  return (
    <AuthScreen title="Create account" subtitle="Set up your gym workspace">
      <ErrorBox text={error} />
      <IconInput label="Full name" icon={User} value={form.name} onChangeText={set('name')} placeholder="Rahul Sharma" autoComplete="name" />
      <IconInput label="Email" icon={Mail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={form.email} onChangeText={set('email')} placeholder="you@gym.com" />
      <PhoneInput label="WhatsApp number" value={form.phone} onChange={set('phone')} />
      <IconInput label="Password" icon={Lock} secure value={form.password} onChangeText={set('password')} placeholder="Min. 8 characters" onSubmitEditing={submit} />
      <Btn label="Create account" busy={loading} onPress={submit} disabled={!form.name || !form.email || !form.password} />
      <View style={{ borderTopWidth: 1, borderTopColor: '#E5E7EB', marginTop: 20, paddingTop: 16, alignItems: 'center' }}>
        <Text style={S.small}>
          Already have an account?{' '}
          <Text style={{ color: '#024BAB', fontFamily: 'DMSans-Bold' }} onPress={() => nav.navigate('Login')}>
            Sign in
          </Text>
        </Text>
      </View>
    </AuthScreen>
  );
}
