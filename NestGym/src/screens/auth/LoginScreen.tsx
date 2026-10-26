import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StatusBar,
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LottieView from 'lottie-react-native';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  ArrowRight,
  Phone,
  KeyRound,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { authAPI } from '../../api/api';
import { Passkey } from 'react-native-passkey';
import { C } from '../../theme';
import { PhoneInput } from '../../components/PhoneInput';
import WhatsAppIcon from '../../components/WhatsAppIcon';

const loginAnim = require('../../assets/lottie/login.json');
const otpAnim = require('../../assets/lottie/otp.json');

const PLACEHOLDER = '#9CA3AF';

// Same screen as NestHR's login. NestGym signs in with email + password or a WhatsApp OTP
// (the OTP also unlocks an account locked after wrong passwords).
export default function LoginScreen({ navigation }: any) {
  const { login, otpSend, loginWithOtp, completeLogin } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  // set when the password was right for an account with two-factor on
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [tfaCode, setTfaCode] = useState('');

  const entrance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    entrance.setValue(0);
    Animated.timing(entrance, {
      toValue: 1,
      duration: 650,
      useNativeDriver: true,
    }).start();
  }, [mode, entrance]);

  const slideUp = (distance = 24) => ({
    opacity: entrance,
    transform: [
      {
        translateY: entrance.interpolate({
          inputRange: [0, 1],
          outputRange: [distance, 0],
        }),
      },
    ],
  });

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Validation', 'Email and password are required');
      return;
    }
    setLoading(true);
    const result = await login(email.trim().toLowerCase(), password);
    setLoading(false);
    if (result.requires2FA) {
      setPendingToken(result.pendingToken || '');
      setTfaCode('');
      return;
    }
    if (!result.success) {
      setLocked(/locked/i.test(result.error || ''));
      Alert.alert('Login Failed', result.error || 'Invalid credentials');
    }
  };

  const handleVerify2FA = async () => {
    setLoading(true);
    try {
      const res = await authAPI.verify2FA(pendingToken || '', tfaCode.trim());
      const r = await completeLogin(res);
      if (!r.success) Alert.alert('Error', r.error || 'Sign in failed');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Invalid authentication code');
    } finally {
      setLoading(false);
    }
  };

  const signInWithPasskey = async () => {
    if (!Passkey.isSupported()) {
      return Alert.alert('Not supported', 'Passkeys are not supported on this device.');
    }
    setPasskeyBusy(true);
    try {
      const { data: opts }: any = await authAPI.passkeyLoginOptions();
      const result = await Passkey.get({
        rpId: opts.rpId,
        challenge: opts.challenge,
        allowCredentials: opts.allowCredentials,
        userVerification: opts.userVerification,
        timeout: opts.timeout,
      });
      const res = await authAPI.passkeyLogin({
        challengeToken: opts.challengeToken,
        id: result.id,
        rawId: result.rawId,
        type: 'public-key',
        response: {
          clientDataJSON: result.response.clientDataJSON,
          authenticatorData: result.response.authenticatorData,
          signature: result.response.signature,
          userHandle: result.response.userHandle ?? null,
        },
        clientExtensionResults: {},
      });
      const r = await completeLogin(res);
      if (!r.success) Alert.alert('Error', r.error || 'Sign in failed');
    } catch (e: any) {
      const cancelled = e?.error === 'UserCancelled' || e?.name === 'NotAllowedError';
      if (!cancelled) Alert.alert('Passkey sign-in failed', e?.message || 'Try another sign-in method.');
    } finally {
      setPasskeyBusy(false);
    }
  };

  const viaEmail = channel === 'email';

  const handleSendOtp = async () => {
    if (viaEmail ? !email.trim() : !phone.trim()) {
      Alert.alert('Validation', viaEmail ? 'Email is required' : 'Phone number is required');
      return;
    }
    setOtpLoading(true);
    try {
      if (viaEmail) await authAPI.emailOtpSend(email.trim().toLowerCase());
      else {
        const r = await otpSend(phone);
        if (!r.success) throw new Error(r.error);
      }
      setOtpSent(true);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to send OTP. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.trim().length !== 6) {
      Alert.alert('Validation', 'Enter the 6-digit OTP');
      return;
    }
    setOtpLoading(true);
    let r: { success: boolean; error?: string };
    try {
      r = viaEmail
        ? await completeLogin(await authAPI.emailOtpVerify(email.trim().toLowerCase(), otp))
        : await loginWithOtp(phone, otp);
    } catch (e: any) {
      r = { success: false, error: e.message };
    }
    setOtpLoading(false);
    if (!r.success) Alert.alert('Error', r.error || 'Invalid or expired OTP.');
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <>
          <Animated.View style={slideUp(50)}>
            <LottieView
              key={mode}
              source={mode === 'phone' ? otpAnim : loginAnim}
              autoPlay
              loop
              style={mode === 'phone' ? styles.lottieOtp : styles.lottieLogin}
            />
          </Animated.View>
          <Text style={styles.cardTitle}>{pendingToken !== null ? 'Two-Step Check' : 'Login'}</Text>
          {pendingToken !== null ? (
            /* ── 2FA code step ────────────────────────────────── */
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Authenticator or backup code</Text>
                <TextInput
                  style={[styles.inputRow, styles.otpInput]}
                  value={tfaCode}
                  onChangeText={setTfaCode}
                  placeholder="000000"
                  placeholderTextColor={PLACEHOLDER}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={11}
                  autoFocus
                />
              </View>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={handleVerify2FA}
                disabled={loading || tfaCode.length < 6}
              >
                {loading ? (
                  <ActivityIndicator color={C.white} />
                ) : (
                  <>
                    <ArrowRight size={16} color={C.white} />
                    <Text style={styles.btnPrimaryText}>Verify Code</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.forgotBtn}
                onPress={() => {
                  setPendingToken(null);
                  setTfaCode('');
                }}
              >
                <Text style={styles.forgotText}>← Back to login</Text>
              </TouchableOpacity>
            </>
          ) : mode === 'phone' ? (
            /* ── Phone OTP flow ───────────────────────────────── */
            <>
              {!otpSent ? (
                <>
                  {viaEmail ? (
                    <View style={styles.field}>
                      <Text style={styles.label}>Email Address</Text>
                      <View style={styles.inputRow}>
                        <Mail size={16} color={C.textMuted} style={styles.inputIcon} />
                        <TextInput
                          style={styles.input}
                          value={email}
                          onChangeText={setEmail}
                          placeholder="Enter Email Address"
                          placeholderTextColor={PLACEHOLDER}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoComplete="email"
                        />
                      </View>
                    </View>
                  ) : (
                    <PhoneInput
                      label="Phone Number"
                      value={phone}
                      onChange={setPhone}
                    />
                  )}
                  <TouchableOpacity
                    style={styles.btnPrimary}
                    onPress={handleSendOtp}
                    disabled={otpLoading || (viaEmail ? !email.trim() : !phone.trim())}
                  >
                    {otpLoading ? (
                      <ActivityIndicator color={C.white} />
                    ) : (
                      <>
                        {viaEmail ? <ArrowRight size={16} color={C.white} /> : <WhatsAppIcon size={20} />}
                        <Text style={styles.btnPrimaryText}>
                          {viaEmail ? 'Send OTP to Email' : 'Send OTP on WhatsApp'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.forgotBtn}
                    onPress={() => setChannel(c => (c === 'email' ? 'whatsapp' : 'email'))}
                  >
                    <Text style={styles.forgotText}>
                      {viaEmail ? 'Use WhatsApp OTP instead' : 'Use email OTP instead'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.field}>
                    <Text style={styles.label}>{viaEmail ? 'Enter OTP (from email)' : 'Enter OTP (from WhatsApp)'}</Text>
                    <TextInput
                      style={[styles.inputRow, styles.otpInput]}
                      value={otp}
                      onChangeText={t =>
                        setOtp(t.replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder="000000"
                      placeholderTextColor={PLACEHOLDER}
                      keyboardType="number-pad"
                      maxLength={6}
                      autoFocus
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.btnPrimary}
                    onPress={handleVerifyOtp}
                    disabled={otpLoading || otp.length < 6}
                  >
                    {otpLoading ? (
                      <ActivityIndicator color={C.white} />
                    ) : (
                      <>
                        <ArrowRight size={16} color={C.white} />
                        <Text style={styles.btnPrimaryText}>Verify OTP</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.forgotBtn}
                    onPress={() => {
                      setOtpSent(false);
                      setOtp('');
                    }}
                  >
                    <Text style={styles.forgotText}>
                      ← Change number / Resend
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          ) : (
            /* ── Email / Password flow ────────────────────────── */
            <>
              <Animated.View style={[styles.field, slideUp(30)]}>
                <Text style={styles.label}>Email Address</Text>
                <View style={styles.inputRow}>
                  <Mail
                    size={16}
                    color={C.textMuted}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Enter Email Address"
                    placeholderTextColor={PLACEHOLDER}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                  />
                </View>
              </Animated.View>

              <Animated.View style={[styles.field, slideUp(30)]}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.inputRow}>
                  <Lock
                    size={16}
                    color={C.textMuted}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter Password"
                    placeholderTextColor={PLACEHOLDER}
                    secureTextEntry={!showPw}
                    autoComplete="password"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPw(p => !p)}
                    style={styles.eyeBtn}
                  >
                    {showPw ? (
                      <EyeOff size={16} color={C.textMuted} />
                    ) : (
                      <Eye size={16} color={C.textMuted} />
                    )}
                  </TouchableOpacity>
                </View>
              </Animated.View>

              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={C.white} />
                ) : (
                  <>
                    <LogIn size={16} color={C.white} />
                    <Text style={styles.btnPrimaryText}>Sign In</Text>
                  </>
                )}
              </TouchableOpacity>

              {locked && (
                <TouchableOpacity
                  style={styles.forgotBtn}
                  onPress={() => {
                    setLocked(false);
                    setMode('phone');
                  }}
                >
                  <Text style={styles.forgotText}>Unlock with an OTP →</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.forgotBtn}
                onPress={() => navigation.navigate('ForgotPassword')}
              >
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>
            </>
          )}

          {pendingToken === null && (
            <>
          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>Or login with</Text>
            <View style={styles.orLine} />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
            <View style={{ alignItems: 'center' }}>
              <TouchableOpacity
                style={styles.altBtn}
                onPress={() => {
                  if (mode === 'phone') {
                    setMode('email');
                    setOtpSent(false);
                    setPhone('');
                    setOtp('');
                  } else {
                    setMode('phone');
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={
                  mode === 'phone' ? 'Sign in with email' : 'Sign in with phone OTP'
                }
              >
                {mode === 'phone' ? (
                  <Mail size={24} color={C.white} />
                ) : (
                  <Phone size={24} color={C.white} />
                )}
              </TouchableOpacity>
              <Text style={styles.altLabel}>
                {mode === 'phone' ? 'Email' : 'Phone'}
              </Text>
            </View>
            <View style={{ alignItems: 'center', marginLeft: 24 }}>
              <TouchableOpacity
                style={styles.altBtn}
                onPress={signInWithPasskey}
                disabled={passkeyBusy}
                accessibilityRole="button"
                accessibilityLabel="Sign in with a passkey"
              >
                {passkeyBusy ? <ActivityIndicator color={C.white} /> : <KeyRound size={24} color={C.white} />}
              </TouchableOpacity>
              <Text style={styles.altLabel}>Passkey</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.forgotBtn}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.forgotText}>New to NestGym? Create an account</Text>
          </TouchableOpacity>
            </>
          )}
        </>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  lottieLogin: { width: '100%', height: 220, marginTop: 5, marginBottom: 6 },
  lottieOtp: { width: '100%', height: 300, marginTop: -204, marginBottom: 24 },
  cardTitle: {
    fontSize: 36,
    fontWeight: '600',
    color: '#000',
    marginBottom: 18,
    textAlign: 'left',
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
    backgroundColor: C.white,
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
  eyeBtn: { padding: 12 },
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  btnPrimaryText: {
    color: C.white,
    fontWeight: '700',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  forgotBtn: { alignItems: 'center', paddingVertical: 10 },
  forgotText: { fontSize: 13, fontWeight: '700', color: C.primary },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    marginBottom: 12,
  },
  orLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  orText: { fontSize: 12, fontWeight: '600', color: C.textMuted },
  altBtn: {
    alignSelf: 'center',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  altLabel: {
    textAlign: 'center',
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: C.textMuted,
  },
  otpInput: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 10,
    textAlign: 'center',
    color: C.black,
    width: '100%',
  },
});
