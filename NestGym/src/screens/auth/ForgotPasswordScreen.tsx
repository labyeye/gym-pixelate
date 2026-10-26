import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LottieView from 'lottie-react-native';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react-native';
import { authAPI } from '../../api/api';
import { Passkey } from 'react-native-passkey';
import { C } from '../../theme';
import PasswordChecklist from '../../components/PasswordChecklist';

const forgotAnim = require('../../assets/lottie/forgot.json');
const PLACEHOLDER = '#9CA3AF';

type Step = 'email' | 'choose' | 'code' | 'done';
type CodeMethod = 'whatsapp' | 'totp' | 'backup' | 'passkey';

// Only methods the account has actually set up are offered (the server decides, see /forgot-password/methods).
const METHOD_INFO: Record<string, { label: string; desc: string }> = {
  email: { label: 'Email link', desc: 'Get a password reset link in your inbox' },
  whatsapp: { label: 'WhatsApp code', desc: 'Get a 6-digit code on your verified WhatsApp number' },
  totp: { label: 'Authenticator app', desc: 'Enter the code from your authenticator app' },
  backup: { label: 'Backup code', desc: 'Use one of your saved one-time backup codes' },
  passkey: { label: 'Passkey', desc: 'Confirm with your fingerprint, face or screen lock' },
};

function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, styles.inputPad]}
          placeholderTextColor={PLACEHOLDER}
          autoCapitalize="none"
          {...props}
        />
      </View>
    </View>
  );
}

// Same screen as NestHR's forgot password: email first, then choose how to prove it is you.
export default function ForgotPasswordScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [methods, setMethods] = useState<string[]>([]);
  const [method, setMethod] = useState<CodeMethod>('whatsapp');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [doneMsg, setDoneMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setLoading(true);
    try {
      await fn();
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addr = email.trim().toLowerCase();

  const sendLink = async () => {
    await authAPI.forgotPassword(addr);
    setDoneMsg(
      `If an account with ${addr} exists, you'll receive a password reset link shortly. The link expires in 1 hour.`,
    );
    setStep('done');
  };

  const onContinue = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      return setError('Please enter a valid email address');
    }
    run(async () => {
      const res: any = await authAPI.forgotPasswordMethods(addr);
      setMethods(res.data.methods);
      if (res.data.methods.length > 1) return setStep('choose');
      await sendLink();
    });
  };

  const choose = (m: string) =>
    run(async () => {
      if (m === 'email') return sendLink();
      if (m === 'whatsapp') await authAPI.forgotPasswordWhatsapp(addr);
      setMethod(m as CodeMethod);
      setCode('');
      setStep('code');
    });

  const onReset = () => {
    if (password !== confirm) return setError("Passwords don't match");
    run(async () => {
      if (method === 'passkey') {
        if (!Passkey.isSupported()) throw new Error('Passkeys are not supported on this device.');
        const { data: o }: any = await authAPI.resetPasskeyOptions();
        let r: any;
        try {
          r = await Passkey.get({
            rpId: o.rpId,
            challenge: o.challenge,
            allowCredentials: o.allowCredentials,
            userVerification: o.userVerification,
            timeout: o.timeout,
          });
        } catch (e: any) {
          throw new Error(
            e?.error === 'UserCancelled' || e?.name === 'NotAllowedError'
              ? 'Passkey verification was cancelled.'
              : e?.message || 'Passkey verification failed.',
          );
        }
        await authAPI.resetWithPasskey({
          challengeToken: o.challengeToken,
          password,
          id: r.id,
          rawId: r.rawId,
          type: 'public-key',
          response: {
            clientDataJSON: r.response.clientDataJSON,
            authenticatorData: r.response.authenticatorData,
            signature: r.response.signature,
            userHandle: r.response.userHandle ?? null,
          },
          clientExtensionResults: {},
        });
      } else if (method === 'backup') await authAPI.resetWithBackupCode(addr, code.trim(), password);
      else if (method === 'whatsapp') await authAPI.resetPasswordWithOtp(addr, code.trim(), password);
      else await authAPI.resetPasswordWithTotp(addr, code.trim(), password);
      setDoneMsg('Your password has been reset. You can now sign in.');
      setStep('done');
    });
  };

  const title =
    step === 'email'
      ? 'Forgot password?'
      : step === 'choose'
      ? 'How do you want to reset it?'
      : step === 'code'
      ? method === 'passkey'
        ? 'Choose a new password'
        : method === 'whatsapp'
        ? 'Enter WhatsApp code'
        : method === 'backup'
        ? 'Enter a backup code'
        : 'Enter authenticator code'
      : 'All set';

  const sub =
    step === 'email'
      ? 'Enter the email address you registered with to see how you can reset your password.'
      : step === 'choose'
      ? 'Choose one of the methods set up on your account.'
      : step === 'code'
      ? method === 'passkey'
        ? 'Pick a new password, then confirm it with your passkey.'
        : method === 'whatsapp'
        ? 'We sent a 6-digit code to your verified WhatsApp number.'
        : method === 'backup'
        ? 'Enter one of your saved backup codes. It stops working after this.'
        : 'Open your authenticator app and enter the current 6-digit code (or a backup code).'
      : '';

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
        <LottieView source={forgotAnim} autoPlay loop style={styles.lottie} />
        <View style={styles.card}>
          {step === 'done' ? (
            <View style={styles.successBlock}>
              <View style={styles.successIcon}>
                <CheckCircle2 size={32} color={C.success} />
              </View>
              <Text style={styles.cardTitle}>{title}</Text>
              <Text style={styles.cardSub}>{doneMsg}</Text>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={() => navigation.navigate('Login')}
              >
                <Text style={styles.btnPrimaryText}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.cardTitle}>{title}</Text>
              <Text style={styles.cardSub}>{sub}</Text>

              {!!error && <Text style={styles.errorText}>{error}</Text>}

              {step === 'email' && (
                <>
                  <View style={styles.field}>
                    <Text style={styles.label}>Email Address</Text>
                    <View style={styles.inputRow}>
                      <Mail size={16} color={C.textMuted} style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        value={email}
                        onChangeText={v => {
                          setEmail(v);
                          setError('');
                        }}
                        placeholder="Enter Email Address"
                        placeholderTextColor={PLACEHOLDER}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        returnKeyType="send"
                        onSubmitEditing={onContinue}
                      />
                    </View>
                  </View>
                  <Primary title="Continue" loading={loading} onPress={onContinue} />
                </>
              )}

              {step === 'choose' &&
                methods.map(m => (
                  <TouchableOpacity
                    key={m}
                    style={styles.method}
                    onPress={() => choose(m)}
                    disabled={loading}
                  >
                    <Text style={styles.methodLabel}>{METHOD_INFO[m]?.label ?? m}</Text>
                    <Text style={styles.methodDesc}>{METHOD_INFO[m]?.desc}</Text>
                  </TouchableOpacity>
                ))}

              {step === 'code' && (
                <>
                  {method !== 'passkey' && <Field
                    label={
                      method === 'whatsapp'
                        ? 'WhatsApp Code'
                        : method === 'backup'
                        ? 'Backup Code'
                        : 'Authenticator Code'
                    }
                    value={code}
                    onChangeText={setCode}
                    keyboardType={method === 'whatsapp' ? 'number-pad' : 'default'}
                    autoCapitalize={method === 'backup' ? 'characters' : 'none'}
                    placeholder={method === 'backup' ? 'XXXXX-XXXXX' : '123456'}
                  />}
                  <Field
                    label="New Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    placeholder="8+ chars, upper, lower & a number"
                  />
                  {!!password && <PasswordChecklist password={password} />}
                  <Field
                    label="Confirm New Password"
                    value={confirm}
                    onChangeText={setConfirm}
                    secureTextEntry
                  />
                  <Primary title="Reset Password" loading={loading} onPress={onReset} />
                </>
              )}

              <TouchableOpacity
                style={styles.backLink}
                onPress={() => {
                  setError('');
                  if (step === 'code') setStep('choose');
                  else if (step === 'choose') setStep('email');
                  else navigation.goBack();
                }}
              >
                <ArrowLeft size={14} color={C.primary} />
                <Text style={styles.backLinkText}>
                  {step === 'code'
                    ? 'Choose a different method'
                    : step === 'choose'
                    ? 'Back'
                    : 'Back to Sign In'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Primary({
  title,
  loading,
  onPress,
}: {
  title: string;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.btnPrimary} onPress={onPress} disabled={loading}>
      {loading ? (
        <ActivityIndicator color={C.white} />
      ) : (
        <Text style={styles.btnPrimaryText}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  scroll: { flexGrow: 1, paddingHorizontal: 24, backgroundColor: '#fff' },
  lottie: { width: '100%', height: 240, alignSelf: 'center' },
  card: { marginTop: 24 },
  cardTitle: { fontSize: 32, fontWeight: '600', color: C.black, marginBottom: 8 },
  cardSub: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 20,
    lineHeight: 20,
  },
  errorText: { color: C.danger, fontWeight: '600', fontSize: 13, marginBottom: 12 },
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
  inputPad: { paddingLeft: 12 },
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
    justifyContent: 'center',
    marginTop: 4,
  },
  btnPrimaryText: {
    color: C.white,
    fontWeight: '700',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  method: {
    borderWidth: 2,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderRightColor: '#0A0A0A',
    borderBottomColor: '#0A0A0A',
    borderRadius: 8,
    borderColor: C.black,
    padding: 14,
    marginBottom: 12,
  },
  methodLabel: { fontWeight: '700', fontSize: 15, color: C.black },
  methodDesc: { color: '#6B7280', marginTop: 2, fontSize: 12 },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
  },
  backLinkText: { fontSize: 13, fontWeight: '700', color: C.primary },
  successBlock: { alignItems: 'center', gap: 12 },
  successIcon: {
    width: 64,
    height: 64,
    borderWidth: 2,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderRightColor: '#0A0A0A',
    borderBottomColor: '#0A0A0A',
    borderRadius: 8,
    borderColor: C.success,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
});
