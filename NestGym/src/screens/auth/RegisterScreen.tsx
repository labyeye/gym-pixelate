import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LottieView from 'lottie-react-native';
import { User, Mail, Lock, ArrowLeft } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { C } from '../../theme';
import { PhoneInput } from '../../components/PhoneInput';
import PasswordChecklist from '../../components/PasswordChecklist';
import { passwordOk } from '../../utils/passwordRules';

const loginAnim = require('../../assets/lottie/login.json');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLACEHOLDER = '#9CA3AF';

// Same screen as NestHR's register, plus the WhatsApp number (needed for OTP login and password reset).
// After signing up the navigator moves to the onboarding wizard by itself.
export default function RegisterScreen({ navigation }: any) {
  const { register } = useAuth();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !phone.trim() || !password.trim()) {
      Alert.alert('Validation', 'All fields are required');
      return;
    }
    if (name.trim().length < 2) {
      Alert.alert('Validation', 'Please enter your full name');
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      Alert.alert('Validation', 'Please enter a valid email address');
      return;
    }
    if (!passwordOk(password)) {
      Alert.alert('Validation', 'Please meet every point in the password checklist');
      return;
    }
    setLoading(true);
    const result = await register({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone,
      password,
    });
    setLoading(false);
    if (!result.success)
      Alert.alert(
        'Registration Failed',
        result.error || 'Something went wrong',
      );
  };

  const field = (
    label: string,
    icon: React.ReactNode,
    value: string,
    setter: (v: string) => void,
    props: React.ComponentProps<typeof TextInput>,
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <View style={styles.inputIcon}>{icon}</View>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setter}
          placeholderTextColor={PLACEHOLDER}
          {...props}
        />
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.safe}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <LottieView source={loginAnim} autoPlay loop style={styles.lottie} />
        <Text style={styles.title}>Create Account</Text>

        <View>
          {field('Full Name', <User size={16} color={C.textMuted} />, name, setName, {
            placeholder: 'Rahul Sharma',
            autoCapitalize: 'words',
          })}
          {field('Email', <Mail size={16} color={C.textMuted} />, email, setEmail, {
            placeholder: 'Enter Email Address',
            keyboardType: 'email-address',
            autoCapitalize: 'none',
            autoCorrect: false,
          })}
          <PhoneInput label="WhatsApp Number" required value={phone} onChange={setPhone} />
          {field('Password', <Lock size={16} color={C.textMuted} />, password, setPassword, {
            placeholder: 'Create a strong password',
            secureTextEntry: true,
            autoCapitalize: 'none',
          })}
          {!!password && <PasswordChecklist password={password} />}

          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <Text style={styles.btnPrimaryText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backLink}
            onPress={() => navigation.navigate('Login')}
          >
            <ArrowLeft size={14} color={C.primary} />
            <Text style={styles.backLinkText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  scroll: { flexGrow: 1, paddingHorizontal: 24, backgroundColor: '#fff' },
  lottie: { width: '100%', height: 220, alignSelf: 'center' },
  title: {
    fontSize: 36,
    fontWeight: '600',
    color: C.black,
    marginTop: 12,
    marginBottom: 18,
  },
  field: { marginBottom: 16 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: C.black,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 8,
    borderRightWidth: 5,
    borderBottomWidth: 5,
    borderRightColor: '#0A0A0A',
    borderBottomColor: '#0A0A0A',
    borderColor: C.black,
  },
  inputIcon: { marginHorizontal: 10 },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 12,
    fontSize: 14,
    fontWeight: '500',
    color: C.black,
  },
  btnPrimary: {
    backgroundColor: C.primary,
    borderWidth: 2,
    borderRadius: 8,
    borderRightWidth: 5,
    borderBottomWidth: 5,
    borderRightColor: '#0A0A0A',
    borderBottomColor: '#0A0A0A',
    borderColor: C.black,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnPrimaryText: {
    color: C.white,
    fontWeight: '700',
    fontSize: 14,
    textTransform: 'uppercase',
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
  },
  backLinkText: { fontSize: 13, color: C.primary, fontWeight: '700' },
});
