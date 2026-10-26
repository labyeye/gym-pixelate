import React, { useEffect, useState } from 'react';
import { Alert, Switch, Text, TouchableOpacity, View } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { authAPI, request, settingsAPI, usersAPI } from '../api/api';
import { isManager, useAuth } from '../contexts/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { C, S } from '../theme';
import { titleCase } from '../utils/format';
import { PhoneInput } from '../components/PhoneInput';
import InvoiceDesigner from '../components/InvoiceDesigner';
import { MODULES, moduleOn } from '../config/modules';
import { PhotoPicker } from '../components/PhotoPicker';
import { Btn, CheckField, Empty, Input, Loader, Panel, Pill, Row, Screen, Select, Sheet, Tabs, brut, notify, RCard, Rise, Pair } from '../components/ui';

const STAFF_ROLES = ['branch_manager', 'receptionist', 'trainer', 'accountant'];
const PROFILE0: any = { companyName: '', companyAddress: '', companyPhone: '', companyEmail: '', companyGST: '', companyPAN: '', invoicePrefix: 'INV', invoiceFooter: '', companyWebsite: '', companyState: '', companyStateCode: '', bankName: '', bankAccountName: '', bankAccountNumber: '', bankIFSC: '', bankBranch: '', bankAccountType: '', invoiceTerms: [], gymTiming: { open: '06:00', close: '22:00' }, onlinePaymentsEnabled: false, razorpayKeyId: '', razorpayKeySecret: '' };

export default function SettingsScreen() {
  const { user, tenant, logout, setModules } = useAuth();
  const manager = isManager(user);
  const isOwner = user?.role === 'gym_owner';
  const [mods, setMods] = useState<Record<string, boolean>>({});
  const [savingMods, setSavingMods] = useState(false);
  const [tab, setTab] = useState(manager ? 'general' : 'account');
  const [profile, setProfile] = useState<any>(PROFILE0);
  const [saving, setSaving] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [branch, setBranch] = useState({ name: '', address: '', city: '', phone: '' });
  const [staffOpen, setStaffOpen] = useState(false);
  const [staff, setStaff] = useState({ name: '', email: '', password: '', role: 'receptionist' });
  const [pw, setPw] = useState({ current: '', next: '' });

  const settings = useFetch(() => settingsAPI.get(), [], manager);
  const branches = useFetch(() => request<any>('/branches'), [], manager);
  const users = useFetch(() => request<any>('/users'), [], manager);

  useEffect(() => {
    const d = (settings.data as any)?.data;
    if (d) {
      setProfile({ ...PROFILE0, ...d, gymTiming: { ...PROFILE0.gymTiming, ...(d.gymTiming || {}) } });
      setMods(d.modules || {});
    }
  }, [settings.data]);

  const saveGeneral = async () => {
    try {
      setSaving(true);
      if (profile.companyGST && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(profile.companyGST.trim().toUpperCase())) throw new Error('GSTIN looks wrong — it should be 15 characters, e.g. 27ABCDE1234F1Z5');
      const SERVER_ONLY = ['_id', 'tenantId', 'createdAt', 'updatedAt', '__v', 'permissions', 'modules', 'invoiceTemplate', 'razorpaySecretSaved', 'razorpayKeySecret'];
      const body: any = Object.fromEntries(Object.entries(profile).filter(([k]) => !SERVER_ONLY.includes(k)));
      if (profile.razorpayKeySecret) body.razorpayKeySecret = profile.razorpayKeySecret; // write-only; blank keeps the saved secret
      await settingsAPI.update({ ...body, companyGST: (body.companyGST || '').trim().toUpperCase() });
      notify.success('Settings saved');
    } catch (e: any) { notify.error('Save failed', e.message); } finally { setSaving(false); }
  };
  const addBranch = async () => {
    try {
      await request('/branches', { method: 'POST', body: JSON.stringify({ ...branch, isActive: true }) });
      notify.success('Branch added'); setBranchOpen(false); setBranch({ name: '', address: '', city: '', phone: '' }); branches.reload();
    } catch (e: any) { notify.error('Save failed', e.message); }
  };
  const addStaff = async () => {
    try {
      await usersAPI.create(staff);
      notify.success('Staff invited'); setStaffOpen(false); setStaff({ name: '', email: '', password: '', role: 'receptionist' }); users.reload();
    } catch (e: any) { notify.error('Save failed', e.message); }
  };
  const changePw = async () => {
    try { await authAPI.changePassword(pw.current, pw.next); notify.success('Password changed'); setPw({ current: '', next: '' }); } catch (e: any) { notify.error('Could not change password', e.message); }
  };
  const saveModules = async () => {
    try {
      setSavingMods(true);
      const res: any = await settingsAPI.update({ modules: mods });
      setModules(res.data?.modules || mods);
      notify.success('Modules saved', 'Menu updated for everyone.');
    } catch (e: any) { notify.error('Save failed', e.message); } finally { setSavingMods(false); }
  };
  const confirmLogout = () => Alert.alert('Sign out?', undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: logout }]);
  const p = (k: string) => (v: any) => setProfile((s: any) => ({ ...s, [k]: v }));

  const tabs = [{ id: 'account', label: 'Account' }, ...(manager ? [{ id: 'general', label: 'General' }, { id: 'branches', label: 'Branches' }, { id: 'staff', label: 'Users / Staff' }] : []), ...(isOwner ? [{ id: 'modules', label: 'Modules' }, { id: 'invoice', label: 'Invoice design' }] : [])];

  return (
    <Screen title="Settings">
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'account' && (
        <>
          <Panel title="You">
            <Row k="Name" v={user?.name} bold />
            <Row k="Email" v={user?.email} />
            <Row k="Role" v={titleCase(user?.role)} />
            <Row k="Gym" v={tenant?.name} />
            <Row k="Plan" v={titleCase(tenant?.plan)} />
          </Panel>
          <Panel title="Change password">
            <Pair>
              <Input label="Current password" secureTextEntry value={pw.current} onChangeText={v => setPw({ ...pw, current: v })} />
              <Input label="New password" secureTextEntry hint="Min 6 characters" value={pw.next} onChangeText={v => setPw({ ...pw, next: v })} />
            </Pair>
            <Btn label="Update password" disabled={!pw.current || pw.next.length < 6} onPress={changePw} />
          </Panel>
          <Btn danger label="Sign out" icon={<LogOut size={14} color="#fff" />} onPress={confirmLogout} />
        </>
      )}

      {tab === 'general' && manager && (settings.loading && !settings.data ? <Loader /> : (
        <>
          <Text style={[S.small, { marginBottom: 12 }]}>These details print on every GST invoice and receipt.</Text>
          <PhotoPicker label="Gym logo" name={profile.companyName || 'G'} value={profile.logoUrl ?? ''} onChange={p('logoUrl')} />
          <Pair>
            <Input label="Gym / business name" value={profile.companyName ?? ''} onChangeText={p('companyName')} />
            <PhoneInput label="Phone" value={profile.companyPhone ?? ''} onChange={p('companyPhone')} />
          </Pair>
          <Pair>
            <Input label="Email" keyboardType="email-address" autoCapitalize="none" value={profile.companyEmail ?? ''} onChangeText={p('companyEmail')} />
            <Input label="GSTIN" autoCapitalize="characters" value={profile.companyGST ?? ''} onChangeText={p('companyGST')} />
          </Pair>
          <Pair>
            <Input label="PAN" autoCapitalize="characters" value={profile.companyPAN ?? ''} onChangeText={p('companyPAN')} />
            <Input label="Invoice prefix" value={profile.invoicePrefix ?? ''} onChangeText={p('invoicePrefix')} />
          </Pair>
          <Input label="Address" multiline value={profile.companyAddress ?? ''} onChangeText={p('companyAddress')} />
          <Pair>
            <Input label="Website" autoCapitalize="none" value={profile.companyWebsite ?? ''} onChangeText={p('companyWebsite')} placeholder="www.mygym.com" />
            <Input label="State" value={profile.companyState ?? ''} onChangeText={p('companyState')} placeholder="Maharashtra" />
          </Pair>
          <Input label="State code" keyboardType="number-pad" maxLength={2} value={profile.companyStateCode ?? ''} onChangeText={p('companyStateCode')} placeholder="27" />
          <Panel title="Bank details (printed on invoices)">
            <Pair>
              <Input label="Bank name" value={profile.bankName ?? ''} onChangeText={p('bankName')} placeholder="HDFC Bank" />
              <Input label="Account holder name" value={profile.bankAccountName ?? ''} onChangeText={p('bankAccountName')} />
            </Pair>
            <Pair>
              <Input label="Account number" keyboardType="number-pad" value={profile.bankAccountNumber ?? ''} onChangeText={p('bankAccountNumber')} />
              <Input label="IFSC code" autoCapitalize="characters" value={profile.bankIFSC ?? ''} onChangeText={p('bankIFSC')} placeholder="HDFC0001234" />
            </Pair>
            <Pair>
              <Input label="Bank branch" value={profile.bankBranch ?? ''} onChangeText={p('bankBranch')} />
              <Input label="Account type" value={profile.bankAccountType ?? ''} onChangeText={p('bankAccountType')} placeholder="Current" />
            </Pair>
          </Panel>
          <Input label="Terms & conditions (one per line)" multiline value={(profile.invoiceTerms || []).join('\n')} onChangeText={v => p('invoiceTerms')(v.split('\n'))} placeholder="e.g. Fees once paid are non-refundable" />
          <Pair>
            <Input label="Opens at (HH:mm)" value={profile.gymTiming?.open ?? ''} onChangeText={v => p('gymTiming')({ ...profile.gymTiming, open: v })} />
            <Input label="Closes at (HH:mm)" value={profile.gymTiming?.close ?? ''} onChangeText={v => p('gymTiming')({ ...profile.gymTiming, close: v })} />
          </Pair>
          <Panel title="Member online payments (your own Razorpay)">
            <Text style={[S.small, { marginBottom: 10 }]}>Members pay dues from their portal; money goes straight to your Razorpay. Use your Razorpay Key ID and Key Secret.</Text>
            <CheckField hint="Allow members to pay online" value={!!profile.onlinePaymentsEnabled} onChange={p('onlinePaymentsEnabled')} />
            <Pair>
              <Input label="Key ID" autoCapitalize="none" placeholder="rzp_live_…" value={profile.razorpayKeyId ?? ''} onChangeText={p('razorpayKeyId')} />
              <Input label="Key Secret" secureTextEntry autoCapitalize="none" placeholder={profile.razorpaySecretSaved ? 'Secret saved — type to replace' : 'Key Secret'} value={profile.razorpayKeySecret ?? ''} onChangeText={p('razorpayKeySecret')} />
            </Pair>
          </Panel>
          <Btn label="Save settings" busy={saving} onPress={saveGeneral} />
        </>
      ))}

      {tab === 'modules' && isOwner && (
        <>
          <Text style={[S.small, { marginBottom: 12 }]}>Switch off what your gym does not use. It disappears from the menu for everyone. Your data is kept; switch it back on any time.</Text>
          {MODULES.map((m, i) => {
            const on = moduleOn(mods, m.key);
            return (
              <Rise key={m.key} index={i}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setMods({ ...mods, [m.key]: !on })}
                  style={[brut({ backgroundColor: C.white, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderRightWidth: 3, borderBottomWidth: 3 }), !on && { opacity: 0.6 }]}
                >
                  <View style={{ width: 38, height: 38, borderWidth: 2, borderColor: C.black, borderRadius: 8, backgroundColor: on ? C.primary : '#E5E7EB', alignItems: 'center', justifyContent: 'center' }}>
                    <m.icon size={18} color={on ? '#fff' : '#6B7280'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.h3}>{m.label}</Text>
                    <Text style={S.small}>{m.desc}</Text>
                  </View>
                  <Switch value={on} onValueChange={v => setMods({ ...mods, [m.key]: v })} trackColor={{ true: C.success, false: '#D1D5DB' }} thumbColor="#fff" />
                </TouchableOpacity>
              </Rise>
            );
          })}
          <Btn label="Save modules" busy={savingMods} onPress={saveModules} />
        </>
      )}

      {tab === 'invoice' && isOwner && (settings.loading && !settings.data ? <Loader /> : (
        <InvoiceDesigner initial={profile.invoiceTemplate} onSaved={t => setProfile((s: any) => ({ ...s, invoiceTemplate: t }))} />
      ))}

      {tab === 'branches' && manager && (
        <>
          <View style={{ marginBottom: 12 }}><Btn small label="Add branch" onPress={() => setBranchOpen(true)} /></View>
          {branches.loading && !branches.data ? <Loader /> : ((branches.data as any)?.data || []).length === 0 ? <Empty text="No branches" /> : ((branches.data as any)?.data || []).map((b: any) => (
            <RCard key={b._id} style={S.card}>
              <View style={S.rowBetween}><Text style={S.h3}>{b.name}</Text><Pill value={b.isActive === false ? 'inactive' : 'active'} /></View>
              <Text style={S.small}>{[b.address, b.city].filter(Boolean).join(', ') || '—'}</Text>
              {!!b.phone && <Text style={S.small}>{b.phone}</Text>}
            </RCard>
          ))}
        </>
      )}

      {tab === 'staff' && manager && (
        <>
          <View style={{ marginBottom: 12 }}><Btn small label="Invite staff" onPress={() => setStaffOpen(true)} /></View>
          {users.loading && !users.data ? <Loader /> : ((users.data as any)?.data || []).map((u: any) => (
            <RCard key={u._id} style={S.card}>
              <View style={S.rowBetween}><Text style={S.h3}>{u.name}</Text><Pill value={u.status || 'active'} /></View>
              <Text style={S.small}>{u.email}</Text>
              <Text style={[S.label, { marginTop: 4 }]}>{titleCase(u.role)}</Text>
            </RCard>
          ))}
        </>
      )}

      <Sheet visible={branchOpen} title="Add branch" onClose={() => setBranchOpen(false)} footer={<><Btn light label="Cancel" onPress={() => setBranchOpen(false)} /><Btn label="Save" disabled={!branch.name} onPress={addBranch} /></>}>
        <Pair>
          <Input label="Name" required value={branch.name} onChangeText={v => setBranch({ ...branch, name: v })} />
          <Input label="Address" value={branch.address} onChangeText={v => setBranch({ ...branch, address: v })} />
        </Pair>
        <Pair>
          <Input label="City" value={branch.city} onChangeText={v => setBranch({ ...branch, city: v })} />
          <PhoneInput label="Phone" value={branch.phone} onChange={v => setBranch({ ...branch, phone: v })} />
        </Pair>
      </Sheet>
      <Sheet visible={staffOpen} title="Invite staff" onClose={() => setStaffOpen(false)} footer={<><Btn light label="Cancel" onPress={() => setStaffOpen(false)} /><Btn label="Invite" disabled={!staff.name || !staff.email || staff.password.length < 6} onPress={addStaff} /></>}>
        <Pair>
          <Input label="Name" required value={staff.name} onChangeText={v => setStaff({ ...staff, name: v })} />
          <Input label="Email" required keyboardType="email-address" autoCapitalize="none" value={staff.email} onChangeText={v => setStaff({ ...staff, email: v })} />
        </Pair>
        <Pair>
          <Input label="Password" required secureTextEntry hint="Min 6 characters" value={staff.password} onChangeText={v => setStaff({ ...staff, password: v })} />
          <Select label="Role" options={STAFF_ROLES} value={staff.role} onChange={v => setStaff({ ...staff, role: v })} />
        </Pair>
      </Sheet>
    </Screen>
  );
}
