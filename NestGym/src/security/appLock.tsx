import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { Btn } from '../components/ui';
import { C, S } from '../theme';

// Optional biometric / device-passcode lock. The secret lives in the keychain behind an access control,
// so reading it IS the biometric prompt (no extra biometric library needed).
const SERVICE = 'nestgym.lock';
const store = createAsyncStorage('nestgym');
const FLAG = 'nestgym_applock';
const GRACE_MS = 60_000; // coming back within a minute doesn't re-ask

export const lockEnabled = async () => (await store.getItem(FLAG)) === '1';

export async function enableLock(): Promise<boolean> {
  try {
    const ok = await Keychain.setGenericPassword('lock', '1', {
      service: SERVICE,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
      accessible: Keychain.ACCESSIBLE.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
    });
    if (!ok) return false;
    await store.setItem(FLAG, '1');
    return true;
  } catch {
    return false; // no passcode / biometrics set up on the phone
  }
}

export async function disableLock() {
  await Keychain.resetGenericPassword({ service: SERVICE });
  await store.removeItem(FLAG);
}

const unlock = async () => {
  try {
    return !!(await Keychain.getGenericPassword({ service: SERVICE, authenticationPrompt: { title: 'Unlock NestGym' } }));
  } catch {
    return false;
  }
};

/** Covers the app with a lock screen on cold start and after a minute in the background. */
export function LockGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [locked, setLocked] = useState(false);
  const left = useRef(0);
  const asking = useRef(false);

  const ask = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    if (await unlock()) setLocked(false);
    asking.current = false;
  }, []);

  useEffect(() => {
    lockEnabled().then(on => on && setLocked(true));
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', async s => {
      if (s !== 'active') left.current = Date.now();
      else if (left.current && Date.now() - left.current > GRACE_MS && (await lockEnabled())) setLocked(true);
    });
    return () => sub.remove();
  }, []);

  const show = locked && isAuthenticated && !isLoading;
  useEffect(() => {
    if (show) ask();
  }, [show, ask]);

  return (
    <>
      {children}
      {show && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={[S.h2, { marginBottom: 16 }]}>NestGym is locked</Text>
          <Btn label="Unlock" onPress={ask} />
        </View>
      )}
    </>
  );
}
