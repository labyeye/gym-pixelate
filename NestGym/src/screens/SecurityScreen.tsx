import React, { useEffect, useState } from 'react';
import { Alert, Image, Platform, Text, TouchableOpacity, View } from 'react-native';
import { KeyRound, Trash2 } from 'lucide-react-native';
import { Passkey } from 'react-native-passkey';
import { authAPI, setToken } from '../api/api';
import { useFetch } from '../hooks/useFetch';
import { C, S } from '../theme';
import { Btn, Input, Loader, Panel, Pill, Screen, notify } from '../components/ui';
import { disableLock, enableLock, lockEnabled } from '../security/appLock';
import PasswordChecklist from '../components/PasswordChecklist';

// Account security for the signed-in user: verify email/phone, two-factor, recovery codes, password, devices.
export default function SecurityScreen() {
  const me = useFetch(async () => (await authAPI.getMe() as any).data, []);
  const u: any = me.data || {};
  const codes = useFetch(async () => (await authAPI.backupCodesStatus() as any).data, [u.twoFactorEnabled], !!u.twoFactorEnabled);
  const passkeys = useFetch(async () => (await authAPI.passkeyList() as any).data as any[], []);
  const sessions = useFetch(async () => (await authAPI.sessions() as any).data as any[], []);

  const [busy, setBusy] = useState('');
  const [lockOn, setLockOn] = useState(false);
  useEffect(() => {
    lockEnabled().then(setLockOn);
  }, []);
  const act = async (key: string, fn: () => Promise<void>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) notify.success(ok);
    } catch (e: any) {
      notify.error('Could not do that', e.message);
    } finally {
      setBusy('');
    }
  };

  const [emailSent, setEmailSent] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [phoneSent, setPhoneSent] = useState(false);
  const [phoneCode, setPhoneCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [tfaCode, setTfaCode] = useState('');
  const [shown, setShown] = useState<string[] | null>(null);
  const [offPw, setOffPw] = useState('');
  const [offCode, setOffCode] = useState('');
  const [regenPw, setRegenPw] = useState('');
  const [pw, setPw] = useState({ current: '', next: '', again: '' });

  const addPasskey = () =>
    act('pk', async () => {
      if (!Passkey.isSupported()) throw new Error('Passkeys are not supported on this device.');
      const { data: o }: any = await authAPI.passkeyRegisterOptions();
      let result: any;
      try {
        result = await Passkey.create({
          rp: o.rp,
          user: o.user,
          challenge: o.challenge,
          pubKeyCredParams: o.pubKeyCredParams,
          timeout: o.timeout,
          excludeCredentials: o.excludeCredentials,
          authenticatorSelection: o.authenticatorSelection,
          attestation: o.attestation,
        } as any);
      } catch (e: any) {
        if (e?.error === 'UserCancelled' || e?.name === 'NotAllowedError') return;
        throw e;
      }
      await authAPI.passkeyRegister({
        challengeToken: o.challengeToken,
        name: Platform.OS === 'ios' ? 'iPhone' : 'Android phone',
        id: result.id,
        rawId: result.rawId,
        type: 'public-key',
        response: { clientDataJSON: result.response.clientDataJSON, attestationObject: result.response.attestationObject },
        clientExtensionResults: {},
      });
      passkeys.reload();
    }, 'Passkey added');

  const removePasskey = (id: string) =>
    Alert.alert('Remove passkey', 'You will no longer be able to use it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => act('pk' + id, async () => { await authAPI.passkeyDelete(id); passkeys.reload(); }, 'Passkey removed') },
    ]);

  if (me.loading && !me.data) {
    return (
      <Screen title="Security" back>
        <Loader />
      </Screen>
    );
  }

  return (
    <Screen title="Security" back refreshing={me.loading} onRefresh={() => { me.reload(); sessions.reload(); }}>
      <Panel title="Verification">
        <View style={[S.rowBetween, { marginBottom: 6 }]}>
          <View style={{ flex: 1 }}>
            <Text style={S.label}>Email</Text>
            <Text style={S.body}>{u.email}</Text>
          </View>
          <Pill value={u.emailVerified ? 'active' : 'pending'} tone={u.emailVerified ? 'green' : 'orange'} />
        </View>
        {!u.emailVerified &&
          (!emailSent ? (
            <Btn label="Send code" busy={busy === 'email'} onPress={() => act('email', async () => { await authAPI.sendEmailVerifyOtp(u.email); setEmailSent(true); }, 'Code sent to your email')} />
          ) : (
            <>
              <Input label="6-digit code" keyboardType="number-pad" maxLength={6} value={emailCode} onChangeText={t => setEmailCode(t.replace(/\D/g, ''))} />
              <Btn label="Verify email" busy={busy === 'email'} disabled={emailCode.length < 6} onPress={() => act('email', async () => { await authAPI.verifyEmailOtp(emailCode); setEmailSent(false); setEmailCode(''); me.reload(); }, 'Email verified')} />
            </>
          ))}

        <View style={[S.rowBetween, { marginTop: 14, marginBottom: 6 }]}>
          <View style={{ flex: 1 }}>
            <Text style={S.label}>WhatsApp number</Text>
            <Text style={S.body}>{u.phone || 'Not added yet. Add it in your profile.'}</Text>
          </View>
          {!!u.phone && <Pill value={u.phoneVerified ? 'active' : 'pending'} tone={u.phoneVerified ? 'green' : 'orange'} />}
        </View>
        {!!u.phone && !u.phoneVerified &&
          (!phoneSent ? (
            <Btn label="Send code on WhatsApp" busy={busy === 'phone'} onPress={() => act('phone', async () => { await authAPI.sendPhoneVerifyOtp(); setPhoneSent(true); }, 'Code sent on WhatsApp')} />
          ) : (
            <>
              <Input label="6-digit code" keyboardType="number-pad" maxLength={6} value={phoneCode} onChangeText={t => setPhoneCode(t.replace(/\D/g, ''))} />
              <Btn label="Verify number" busy={busy === 'phone'} disabled={phoneCode.length < 6} onPress={() => act('phone', async () => { await authAPI.verifyPhoneOtp(phoneCode); setPhoneSent(false); setPhoneCode(''); me.reload(); }, 'Phone verified')} />
            </>
          ))}
        <Text style={[S.small, { marginTop: 10 }]}>A verified number lets you reset your password with a WhatsApp code.</Text>
      </Panel>

      <Panel title="App lock">
        <Text style={[S.small, { marginBottom: 10 }]}>Ask for fingerprint, face or your phone passcode when you open NestGym.</Text>
        <Btn
          label={lockOn ? 'Turn off app lock' : 'Turn on app lock'}
          light={lockOn}
          busy={busy === 'lock'}
          onPress={() =>
            act('lock', async () => {
              if (lockOn) await disableLock();
              else if (!(await enableLock())) throw new Error('Set a screen lock (passcode or fingerprint) on your phone first.');
              setLockOn(!lockOn);
            })
          }
        />
      </Panel>

      <Panel title="Two-factor authentication" right={<Pill value={u.twoFactorEnabled ? 'active' : 'pending'} tone={u.twoFactorEnabled ? 'green' : 'orange'} />}>
        {!u.twoFactorEnabled && !setup && (
          <>
            <Text style={[S.small, { marginBottom: 10 }]}>Ask for a code from an authenticator app (Google Authenticator, Authy) each time you sign in with your password.</Text>
            <Btn label="Turn on" busy={busy === '2fa'} onPress={() => act('2fa', async () => setSetup(((await authAPI.setup2FA()) as any).data))} />
          </>
        )}
        {!u.twoFactorEnabled && !!setup && (
          <>
            <Text style={[S.body, { marginBottom: 8 }]}>1. Scan this QR code in your authenticator app, or type the key.</Text>
            <Image source={{ uri: setup.qr }} style={{ width: 180, height: 180, alignSelf: 'center', marginBottom: 8 }} />
            <Text selectable style={[S.small, { textAlign: 'center', marginBottom: 12 }]}>{setup.secret}</Text>
            <Input label="2. Enter the 6-digit code" keyboardType="number-pad" maxLength={6} value={tfaCode} onChangeText={t => setTfaCode(t.replace(/\D/g, ''))} />
            <Btn label="Confirm" busy={busy === '2fa'} disabled={tfaCode.length < 6} onPress={() => act('2fa', async () => { const r: any = await authAPI.confirm2FA(tfaCode); setShown(r.data.backupCodes); setSetup(null); setTfaCode(''); me.reload(); }, 'Two-factor is on')} />
            <Btn label="Cancel" light style={{ marginTop: 8 }} onPress={() => setSetup(null)} />
          </>
        )}
        {!!u.twoFactorEnabled && (
          <>
            <Text style={[S.small, { marginBottom: 8 }]}>To turn it off, enter your password and a current code (or a backup code).</Text>
            <Input label="Password" secureTextEntry autoCapitalize="none" value={offPw} onChangeText={setOffPw} />
            <Input label="Code" autoCapitalize="characters" value={offCode} onChangeText={setOffCode} />
            <Btn label="Turn off" light busy={busy === '2fa'} disabled={!offPw || !offCode} onPress={() => act('2fa', async () => { await authAPI.disable2FA(offPw, offCode.trim()); setOffPw(''); setOffCode(''); me.reload(); }, 'Two-factor is off')} />
          </>
        )}
      </Panel>

      {!!u.twoFactorEnabled && (
        <Panel title="Backup codes">
          <Text style={[S.small, { marginBottom: 8 }]}>
            {codes.data ? `${codes.data.remaining} unused codes left. ` : ''}Each code signs you in once if you lose your authenticator. Making new codes replaces the old ones.
          </Text>
          {!!shown && (
            <View style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: C.black, padding: 10, marginBottom: 10 }}>
              <Text style={[S.label, { marginBottom: 6 }]}>Save these now. They are shown only once.</Text>
              {shown.map(c => (
                <Text key={c} selectable style={S.body}>{c}</Text>
              ))}
            </View>
          )}
          <Input label="Password" secureTextEntry autoCapitalize="none" value={regenPw} onChangeText={setRegenPw} />
          <Btn label="Make new codes" busy={busy === 'codes'} disabled={!regenPw} onPress={() => act('codes', async () => { setShown(((await authAPI.generateBackupCodes(regenPw)) as any).data.codes); setRegenPw(''); codes.reload(); }, 'New codes ready')} />
        </Panel>
      )}

      <Panel title="Passkeys">
        <Text style={[S.small, { marginBottom: 8 }]}>Sign in with Face ID, fingerprint or your screen lock instead of a password. A passkey also lets you reset a forgotten password.</Text>
        {(passkeys.data || []).map((p: any) => (
          <View key={p._id} style={[S.rowBetween, { paddingVertical: 6, gap: 8 }]}>
            <KeyRound size={16} color={C.primary} />
            <View style={{ flex: 1 }}>
              <Text style={S.body}>{p.name}</Text>
              <Text style={S.small}>Added {new Date(p.createdAt).toLocaleDateString()}{p.lastUsedAt ? ` · used ${new Date(p.lastUsedAt).toLocaleDateString()}` : ' · never used'}</Text>
            </View>
            <TouchableOpacity onPress={() => removePasskey(p._id)} hitSlop={8}>
              <Trash2 size={18} color={C.danger} />
            </TouchableOpacity>
          </View>
        ))}
        {!passkeys.loading && !(passkeys.data || []).length && <Text style={S.small}>No passkeys yet.</Text>}
        <View style={{ marginTop: 8 }}>
          <Btn label="Add a passkey" busy={busy === 'pk'} onPress={addPasskey} />
        </View>
      </Panel>

      <Panel title="Change password">
        <Input label="Current password" secureTextEntry autoCapitalize="none" value={pw.current} onChangeText={t => setPw({ ...pw, current: t })} />
        <Input label="New password" secureTextEntry autoCapitalize="none" value={pw.next} onChangeText={t => setPw({ ...pw, next: t })} />
        {!!pw.next && <PasswordChecklist password={pw.next} />}
        <Input label="Repeat new password" secureTextEntry autoCapitalize="none" value={pw.again} onChangeText={t => setPw({ ...pw, again: t })} />
        <Btn
          label="Change password"
          busy={busy === 'pw'}
          disabled={!pw.current || !pw.next}
          onPress={() =>
            act('pw', async () => {
              if (pw.next !== pw.again) throw new Error('The new passwords do not match');
              const r: any = await authAPI.changePassword(pw.current, pw.next);
              if (r.data?.token) await setToken(r.data.token); // this device keeps its session; the others are signed out
              setPw({ current: '', next: '', again: '' });
              sessions.reload();
            }, 'Password changed. Other devices were signed out.')
          }
        />
      </Panel>

      <Panel
        title="Signed-in devices"
        right={(sessions.data?.length || 0) > 1 ? <Btn small light label="Sign out others" onPress={() => act('others', async () => { await authAPI.removeOtherSessions(); sessions.reload(); }, 'Signed out of other devices')} /> : undefined}
      >
        {(sessions.data || []).map((s: any) => (
          <View key={s._id} style={[S.rowBetween, { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }]}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={S.body}>{s.deviceName}{s.current ? '  (this device)' : ''}</Text>
              <Text style={S.small}>{s.platform} · {s.ip || 'unknown IP'} · {new Date(s.lastActiveAt).toLocaleString()}</Text>
            </View>
            {!s.current && <Btn small light label="Sign out" onPress={() => act('s' + s._id, async () => { await authAPI.removeSession(s._id); sessions.reload(); }, 'Device signed out')} />}
          </View>
        ))}
      </Panel>
    </Screen>
  );
}
