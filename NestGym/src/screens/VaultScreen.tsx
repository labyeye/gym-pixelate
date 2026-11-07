import React, { useEffect, useState } from 'react';
import { Alert, Image, Text, TouchableOpacity, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { Eye, Lock, ShieldCheck, Trash2, Upload } from 'lucide-react-native';
import { API_BASE_URL } from '../config/env';
import { getToken, request } from '../api/api';
import { gym } from '../api/gym';
import { C, S } from '../theme';
import { fmtDate, titleCase } from '../utils/format';
import { brut, Btn, Empty, Input, Panel, RCard, Screen, Select, Sheet, notify } from '../components/ui';

const CATS = ['govt_id', 'license', 'gst', 'agreement', 'insurance', 'id_proof', 'medical', 'invoice', 'other'];
const kb = (n = 0) =>
  n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/** Encrypted document vault: nothing is listed until a one-time code unlocks a 10-minute pass. */
export default function VaultScreen() {
  // pass lives in memory only: leaving the screen locks the vault again
  const [pass, setPass] = useState('');
  const [left, setLeft] = useState(0);
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState('');
  const [docs, setDocs] = useState<any[]>([]);
  const [cat, setCat] = useState('');
  const [title, setTitle] = useState('');
  const [upCat, setUpCat] = useState('other');
  const [forKind, setForKind] = useState('gym');
  const [who, setWho] = useState('');
  const [people, setPeople] = useState<{ members: any[]; users: any[] }>({ members: [], users: [] });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ uri: string; title: string } | null>(null);

  const H = { 'X-Vault-Pass': pass };
  const lock = (m = '') => {
    setPass('');
    setDocs([]);
    setOtp('');
    if (m) notify.error(m);
  };
  const call = async <T,>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (e: any) {
      if (e?.status === 423) lock('Vault locked again. Request a new code.');
      else notify.error(e?.message || 'Something went wrong');
      return undefined;
    }
  };

  useEffect(() => {
    if (!pass) return;
    const end = Date.now() + 600000;
    const t = setInterval(() => {
      const s = Math.round((end - Date.now()) / 1000);
      if (s <= 0) lock('Vault locked after 10 minutes.');
      else setLeft(s);
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pass]);

  const load = async (p = pass, c = cat) => {
    const r: any = await call(() =>
      request(`/vault${c ? `?category=${c}` : ''}`, { headers: { 'X-Vault-Pass': p } }),
    );
    if (r) setDocs(r.data);
  };
  useEffect(() => {
    if (pass) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pass, cat]);

  useEffect(() => {
    if (!pass) return;
    Promise.all([gym.members.list({ limit: 200 }), gym.users.list()])
      .then(([m, u]: any[]) => setPeople({ members: m?.data || [], users: u?.data || [] }))
      .catch(() => {});
  }, [pass]);

  const options = (forKind === 'member'
    ? people.members
    : people.users.filter((u: any) =>
        forKind === 'trainer' ? u.role === 'trainer' : u.role !== 'trainer' && u.role !== 'gym_owner',
      )
  ).map((o: any) => ({
    value: o._id,
    label: `${o.name}${o.memberCode ? ` (${o.memberCode})` : ''}`,
  }));

  const sendCode = async () => {
    setBusy(true);
    const r: any = await call(() => request('/vault/otp', { method: 'POST' }));
    if (r) setSent(r.via);
    setBusy(false);
  };
  const unlock = async () => {
    setBusy(true);
    const r: any = await call(() =>
      request('/vault/unlock', { method: 'POST', body: JSON.stringify({ otp }) }),
    );
    if (r) {
      setPass(r.pass);
      setLeft(600);
      setOtp('');
    }
    setBusy(false);
  };

  const add = async () => {
    if (forKind !== 'gym' && !who) return notify.error('Choose the person this document belongs to');
    const pick = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
    const a = pick.assets?.[0];
    if (!a?.uri) return;
    const fd = new FormData();
    if (forKind === 'member') fd.append('memberId', who);
    else if (forKind !== 'gym') fd.append('userId', who);
    const name = a.fileName || `doc-${Date.now()}.jpg`;
    fd.append('file', { uri: a.uri, name, type: a.type || 'image/jpeg' } as any);
    fd.append('title', title || name);
    fd.append('category', upCat);
    setBusy(true);
    const r = await call(() => request('/vault', { method: 'POST', body: fd, headers: H }));
    if (r) {
      setTitle('');
      setWho('');
      notify.success('Document encrypted and saved');
      load();
    }
    setBusy(false);
  };

  const view = async (d: any) => {
    // fetch with the pass header, then show the decrypted bytes (never a plain URL)
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/vault/${d._id}/file`, {
        headers: { ...H, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (res.status === 423) return lock('Vault locked again. Request a new code.');
      if (!res.ok) return notify.error('Could not open this file');
      const blob = await res.blob();
      if (!/image/.test(blob.type)) return notify.error('PDFs can be opened from the web app only');
      const uri: string = await new Promise((ok, no) => {
        const fr = new FileReader();
        fr.onload = () => ok(String(fr.result));
        fr.onerror = no;
        fr.readAsDataURL(blob);
      });
      setPreview({ uri, title: d.title });
    } catch {
      notify.error('Could not open this file');
    }
  };

  const del = (d: any) =>
    Alert.alert(`Delete "${d.title}"?`, 'This cannot be undone.', [
      { text: 'Keep' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await call(() => request(`/vault/${d._id}`, { method: 'DELETE', headers: H }));
          load();
        },
      },
    ]);

  if (!pass) {
    return (
      <Screen title="Document Vault" back>
        <Panel title="Vault is locked">
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            <Lock color={C.black} size={36} />
          </View>
          <Text style={S.body}>
            Documents are stored encrypted. Get a one-time code on your verified WhatsApp number (or
            email) to open the vault for 10 minutes.
          </Text>
          <View style={{ height: 12 }} />
          {!sent ? (
            <Btn label="Send code" busy={busy} onPress={sendCode} />
          ) : (
            <>
              <Text style={S.label}>Code sent by {sent}. Valid 10 minutes.</Text>
              <Input
                label="Code"
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={v => setOtp(v.replace(/\D/g, ''))}
              />
              <Btn label="Unlock" busy={busy} disabled={otp.length !== 6} onPress={unlock} />
              <View style={{ height: 8 }} />
              <Btn light small label="Resend code" disabled={busy} onPress={sendCode} />
            </>
          )}
        </Panel>
      </Screen>
    );
  }

  return (
    <Screen title="Document Vault" back>
      <View style={[S.rowBetween, { marginBottom: 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ShieldCheck color={C.success} size={18} />
          <Text style={S.body}>
            Unlocked · {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} left
          </Text>
        </View>
        <Btn small light label="Lock now" onPress={() => lock()} />
      </View>

      <Panel title="Add document">
        <Select
          label="For"
          value={forKind}
          onChange={v => {
            setForKind(v);
            setWho('');
          }}
          options={[
            { value: 'gym', label: 'Gym (licence, GST, agreements…)' },
            { value: 'member', label: 'Member' },
            { value: 'trainer', label: 'Trainer' },
            { value: 'staff', label: 'Staff' },
          ]}
        />
        {forKind !== 'gym' && (
          <Select label={titleCase(forKind)} placeholder={`Select ${forKind}…`} value={who} onChange={setWho} options={options} />
        )}
        <Input label="Title" placeholder="e.g. Aadhaar card" value={title} onChangeText={setTitle} />
        <Select label="Category" value={upCat} onChange={setUpCat} options={CATS} />
        <Btn label="Choose photo & upload" icon={<Upload color={C.white} />} busy={busy} onPress={add} />
        <Text style={[S.label, { marginTop: 8 }]}>
          Photos up to 10 MB are encrypted before they are saved. Upload PDFs from the web app.
        </Text>
      </Panel>

      <Select label="Category filter" value={cat} allowEmpty placeholder="All categories" onChange={setCat} options={CATS} />

      <Panel title={`Documents (${docs.length})`}>
        {docs.length === 0 ? (
          <Empty text="Nothing stored yet" />
        ) : (
          docs.map(d => (
            <RCard key={d._id} style={brut({ padding: 12, marginBottom: 8 })}>
              <Text style={S.body} numberOfLines={1}>{d.title}</Text>
              <Text style={S.label}>
                {titleCase(d.category)} · {kb(d.size)} · {fmtDate(d.createdAt)}
                {d.memberId?.name
                  ? ` · Member: ${d.memberId.name}`
                  : d.userId?.name
                  ? ` · ${titleCase(d.userId.role)}: ${d.userId.name}`
                  : ' · Gym'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <Btn small light label="Open" icon={<Eye color={C.black} />} onPress={() => view(d)} />
                <Btn small danger label="Delete" icon={<Trash2 color={C.white} />} onPress={() => del(d)} />
              </View>
            </RCard>
          ))
        )}
      </Panel>

      <Sheet visible={!!preview} title={preview?.title || 'Document'} onClose={() => setPreview(null)}>
        {!!preview && (
          <TouchableOpacity activeOpacity={1}>
            <Image source={{ uri: preview.uri }} style={{ width: '100%', height: 420 }} resizeMode="contain" />
          </TouchableOpacity>
        )}
      </Sheet>
    </Screen>
  );
}
