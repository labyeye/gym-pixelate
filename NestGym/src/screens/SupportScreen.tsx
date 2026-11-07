import React, { useCallback, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { request } from '../api/api';
import { S } from '../theme';
import { Btn, Empty, Input, Loader, Pill, Screen, Select, Sheet, brut, notify } from '../components/ui';
import { fmtDateTime } from '../utils/format';

const empty = { subject: '', description: '', priority: 'medium' };

export default function SupportScreen() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>(null);
  const [view, setView] = useState<any>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r: any = await request('/support');
      setRows(r.data || []);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    setBusy(true);
    try {
      await request('/support', { method: 'POST', body: JSON.stringify(form) });
      notify.success('Ticket raised', 'Our team will reply here.');
      setForm(null);
      load();
    } catch (e: any) {
      notify.error('Could not raise ticket', e.message);
    }
    setBusy(false);
  };

  const sendReply = async () => {
    setBusy(true);
    try {
      const r: any = await request(`/support/${view._id}/reply`, { method: 'POST', body: JSON.stringify({ message: reply }) });
      setView(r.data);
      setReply('');
      load();
    } catch (e: any) {
      notify.error('Could not send', e.message);
    }
    setBusy(false);
  };

  return (
    <Screen title="Support" back refreshing={loading} onRefresh={load}>
      <Btn label="Raise ticket" onPress={() => setForm({ ...empty })} />
      <View style={{ height: 12 }} />
      {loading ? <Loader /> : rows.length === 0 ? <Empty text="No tickets yet" /> : rows.map(t => (
        <TouchableOpacity key={t._id} onPress={() => setView(t)} style={brut({ padding: 14, marginBottom: 10 })}>
          <Text style={S.label}>{t.ticketId} · {fmtDateTime(t.createdAt)}</Text>
          <Text style={S.body}>{t.subject}</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
            <Pill value={t.priority} />
            <Pill value={t.status} />
          </View>
        </TouchableOpacity>
      ))}

      <Sheet
        visible={!!form}
        title="Raise ticket"
        onClose={() => setForm(null)}
        footer={<Btn label="Submit" busy={busy} disabled={!form?.subject?.trim() || !form?.description?.trim()} onPress={submit} />}
      >
        <Input label="Subject" required value={form?.subject} onChangeText={(v: string) => setForm({ ...form, subject: v })} />
        <Select label="Priority" value={form?.priority} onChange={(v: string) => setForm({ ...form, priority: v })} options={['low', 'medium', 'high', 'critical']} />
        <Input label="Description" multiline value={form?.description} onChangeText={(v: string) => setForm({ ...form, description: v })} />
      </Sheet>

      <Sheet visible={!!view} title={view?.ticketId || 'Ticket'} subtitle={view?.subject} onClose={() => setView(null)}
        footer={<Btn label="Send reply" busy={busy} disabled={!reply.trim()} onPress={sendReply} />}>
        <Text style={S.body}>{view?.description}</Text>
        {(view?.replies || []).map((r: any) => (
          <View key={r._id} style={brut({ padding: 10, marginTop: 8 })}>
            <Text style={S.label}>{r.senderName || r.from}</Text>
            <Text style={S.body}>{r.message}</Text>
          </View>
        ))}
        <Input label="Add a reply" multiline value={reply} onChangeText={setReply} />
      </Sheet>
    </Screen>
  );
}
