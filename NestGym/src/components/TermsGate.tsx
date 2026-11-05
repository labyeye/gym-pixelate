import React, { useEffect, useState } from 'react';
import { Linking, Modal, Text, TouchableOpacity, View } from 'react-native';
import { request } from '../api/api';
import { onTermsRequired } from '../utils/termsGate';
import { Btn } from './ui';
import { C, FONT } from '../theme';

const SITE = 'https://www.pixelatenest.com/legal';

export default function TermsGate({ onAccepted }: { onAccepted: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => onTermsRequired(() => setOpen(true)), []);

  const accept = async () => {
    setBusy(true);
    setErr('');
    try {
      await request('/legal/accept', { method: 'POST' });
      setOpen(false);
      onAccepted(); // remount the app so the failed screens reload
    } catch (e: any) {
      setErr(e.message || 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: '#fff', borderWidth: 2, borderColor: '#000', padding: 20 }}>
          <Text style={{ fontFamily: FONT.bold, fontSize: 20, color: '#000' }}>Terms & Privacy Policy</Text>
          <Text style={{ marginTop: 10, fontSize: 14, lineHeight: 20, color: '#000' }}>
            To keep using NestGym, please accept the updated Terms of Service and Privacy Policy.
          </Text>
          <View style={{ flexDirection: 'row', gap: 18, marginTop: 12 }}>
            <TouchableOpacity onPress={() => Linking.openURL(`${SITE}/terms-of-service.html`)}>
              <Text style={{ color: C.primary, textDecorationLine: 'underline' }}>Terms of Service</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Linking.openURL(`${SITE}/privacy-policy.html#nestgym`)}>
              <Text style={{ color: C.primary, textDecorationLine: 'underline' }}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
          {!!err && <Text style={{ color: '#b91c1c', marginTop: 10 }}>{err}</Text>}
          <View style={{ marginTop: 16 }}>
            <Btn label="I accept" onPress={accept} busy={busy} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
