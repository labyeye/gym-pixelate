import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { gym } from '../../api/gym';
import { isManager, useAuth } from '../../contexts/AuthContext';
import { useDebounced, useFetch } from '../../hooks/useFetch';
import { C, S } from '../../theme';
import { inr, titleCase } from '../../utils/format';
import { MemberPicker } from '../../components/pickers';
import { brut, Btn, CheckField, Empty, Input, Loader, Pill, Row, Screen, SearchBox, Select, Sheet, StatCard, StatGrid, Tabs, Totals, notify, RCard } from '../../components/ui';

const CATS = ['supplement', 'beverage', 'snack', 'apparel', 'accessory', 'other'];
const blank = { name: '', sku: '', category: 'supplement', price: '', costPrice: '', gstPercent: '18', stock: '0', reorderLevel: '5', isActive: true };

export default function PosScreen() {
  const { user } = useAuth();
  const canWrite = user?.role === 'gym_owner' || isManager(user);
  const [tab, setTab] = useState('sell');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [member, setMember] = useState<any>(null);
  const [method, setMethod] = useState('cash');
  const [discount, setDiscount] = useState('');
  const [busy, setBusy] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState<any>(blank);
  const [stockFor, setStockFor] = useState<any>(null);
  const [delta, setDelta] = useState('');

  const { data, loading, reload } = useFetch(() => gym.products.list({ q: dq, limit: 100 }), [dq]);
  const products: any[] = data?.data || [];
  const lines = products.filter(p => cart[p._id]);
  const count = Object.values(cart).reduce((s, n) => s + n, 0);

  const totals = useMemo(() => {
    const sub = lines.reduce((s, p) => s + p.price * cart[p._id], 0);
    const disc = Math.min(sub, Number(discount) || 0);
    const gst = lines.reduce((s, p) => s + p.price * cart[p._id] * (1 - (sub ? disc / sub : 0)) * (p.gstPercent / 100), 0);
    return { sub, disc, gst, total: Math.round((sub - disc + gst) * 100) / 100 };
  }, [lines, cart, discount]);

  const add = (p: any, n = 1) =>
    setCart(c => {
      const v = (c[p._id] || 0) + n;
      const next = { ...c };
      if (v <= 0) delete next[p._id];
      else next[p._id] = Math.min(v, p.stock);
      return next;
    });

  const checkout = async () => {
    try {
      setBusy(true);
      const r = await gym.products.sell({ lines: lines.map(p => ({ productId: p._id, quantity: cart[p._id] })), memberId: member?._id, method, discount: Number(discount) || 0 });
      notify.success('Sale complete', `${r.data.invoiceNumber} · ${inr(r.data.totalAmount, 2)}`);
      setCart({}); setMember(null); setDiscount(''); setCartOpen(false); reload();
    } catch (e: any) { notify.error('Sale failed', e.message); } finally { setBusy(false); }
  };
  const save = async () => {
    const body = { ...form, price: Number(form.price), costPrice: Number(form.costPrice) || 0, gstPercent: Number(form.gstPercent), stock: Number(form.stock), reorderLevel: Number(form.reorderLevel) };
    try {
      if (edit === 'new') await gym.products.create(body); else await gym.products.update(edit._id, body);
      notify.success('Product saved'); setEdit(null); reload();
    } catch (e: any) { notify.error('Save failed', e.message); }
  };
  const adjust = async () => {
    try { await gym.products.stock(stockFor._id, { delta: Number(delta), reason: 'manual adjustment' }); notify.success('Stock updated'); setStockFor(null); setDelta(''); reload(); } catch (e: any) { notify.error('Failed', e.message); }
  };

  const low = products.filter(p => p.isActive && p.stock <= p.reorderLevel);
  const value = products.reduce((s, p) => s + p.stock * (p.costPrice || 0), 0);
  const set = (k: string) => (v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <Screen
      title="Shop / POS"
      refreshing={loading && !!data}
      onRefresh={reload}
      right={tab === 'stock' && canWrite ? <Btn small label="Add" icon={<Plus size={14} color="#fff" />} onPress={() => { setForm(blank); setEdit('new'); }} /> : undefined}
      footer={tab === 'sell' && count > 0 ? (
        <View style={{ padding: 12, borderTopWidth: 2, borderTopColor: C.black, backgroundColor: C.white }}>
          <Btn color="#00A070" label={`View cart · ${count} item${count > 1 ? 's' : ''} · ${inr(totals.total, 2)}`} onPress={() => setCartOpen(true)} />
        </View>
      ) : undefined}
    >
      <StatGrid>
        <StatCard label="Products" value={data?.total ?? 0} color="#024BAB" />
        <StatCard label="Low stock" value={low.length} color={low.length ? '#EF4444' : '#14B8A6'} />
        <StatCard label="Stock value (cost)" value={inr(value)} color="#A855F7" />
        <StatCard label="In cart" value={count} color="#FA731C" />
      </StatGrid>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'sell', label: 'Sell' }, { id: 'stock', label: 'Inventory' }]} />
      <SearchBox value={q} onChange={setQ} placeholder="Search products…" />

      {loading && !data ? <Loader /> : products.length === 0 ? <Empty text="No products yet — add some in Inventory" /> : tab === 'sell' ? (
        products.filter(p => p.isActive).map(p => (
          <TouchableOpacity key={p._id} disabled={p.stock <= 0} activeOpacity={0.85} onPress={() => add(p)} style={[brut({ backgroundColor: cart[p._id] ? '#EFF6FF' : C.white, padding: 12, marginBottom: 12, opacity: p.stock <= 0 ? 0.4 : 1 })]}>
            <View style={S.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={S.h3}>{p.name}</Text>
                <Text style={S.small}>{titleCase(p.category)} · {p.gstPercent}% GST</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={S.h2}>{inr(p.price)}</Text>
                <Text style={[S.small, { color: p.stock <= p.reorderLevel ? C.danger : C.black }]}>{p.stock} in stock</Text>
              </View>
            </View>
            {!!cart[p._id] && <Text style={[S.label, { color: C.secondary, marginTop: 6 }]}>× {cart[p._id]} in cart</Text>}
          </TouchableOpacity>
        ))
      ) : (
        products.map(p => (
          <RCard key={p._id} style={S.card}>
            <View style={S.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={S.h3}>{p.name}</Text>
                <Text style={S.small}>{p.sku ? `${p.sku} · ` : ''}{titleCase(p.category)}</Text>
              </View>
              <Pill value={p.isActive ? (p.stock <= p.reorderLevel ? 'low stock' : 'active') : 'inactive'} tone={p.stock <= p.reorderLevel ? 'red' : undefined} />
            </View>
            <Row k="Price" v={inr(p.price)} />
            <Row k="Cost" v={p.costPrice ? inr(p.costPrice) : '—'} />
            <Row k="Stock" v={`${p.stock} (reorder at ${p.reorderLevel})`} bold />
            {canWrite && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Btn small light label="Adjust stock" onPress={() => { setStockFor(p); setDelta(''); }} />
                <Btn small light label="Edit" onPress={() => { setForm({ ...blank, ...p, price: String(p.price), costPrice: String(p.costPrice ?? ''), gstPercent: String(p.gstPercent), stock: String(p.stock), reorderLevel: String(p.reorderLevel) }); setEdit(p); }} />
              </View>
            )}
          </RCard>
        ))
      )}

      <Sheet visible={cartOpen} title="Cart" onClose={() => setCartOpen(false)} footer={<Btn color="#00A070" label={`Charge ${inr(totals.total, 2)}`} busy={busy} disabled={!lines.length} onPress={checkout} />}>
        {lines.map(p => (
          <View key={p._id} style={[S.rowBetween, { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }]}>
            <Text style={[S.body, { flex: 1 }]} numberOfLines={1}>{p.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Btn small light label="" icon={<Minus size={14} color={C.black} />} onPress={() => add(p, -1)} />
              <Text style={S.h3}>{cart[p._id]}</Text>
              <Btn small light label="" icon={<Plus size={14} color={C.black} />} onPress={() => add(p, 1)} />
            </View>
            <Text style={[S.h3, { width: 80, textAlign: 'right' }]}>{inr(p.price * cart[p._id])}</Text>
          </View>
        ))}
        <View style={{ height: 14 }} />
        <MemberPicker label="Member (optional)" value={member} onChange={setMember} />
        <Select label="Method" options={['cash', 'upi', 'card']} value={method} onChange={setMethod} />
        <Input label="Discount (₹)" keyboardType="decimal-pad" value={discount} onChangeText={setDiscount} />
        <Totals rows={[['Subtotal', inr(totals.sub, 2)], ['GST', inr(totals.gst, 2)], ['Total', inr(totals.total, 2), 'bold']]} />
      </Sheet>

      <Sheet visible={!!edit} title={edit === 'new' ? 'Add product' : 'Edit product'} onClose={() => setEdit(null)} footer={<><Btn light label="Cancel" onPress={() => setEdit(null)} /><Btn label="Save" disabled={!form.name || !form.price} onPress={save} /></>}>
        <Input label="Name" required value={form.name} onChangeText={set('name')} />
        <Input label="SKU" value={form.sku} onChangeText={set('sku')} />
        <Select label="Category" options={CATS} value={form.category} onChange={set('category')} />
        <Input label="Price (₹)" required keyboardType="decimal-pad" value={form.price} onChangeText={set('price')} />
        <Input label="Cost price (₹)" keyboardType="decimal-pad" value={form.costPrice} onChangeText={set('costPrice')} />
        <Input label="GST %" keyboardType="decimal-pad" value={form.gstPercent} onChangeText={set('gstPercent')} />
        <Input label="Stock" keyboardType="number-pad" value={form.stock} onChangeText={set('stock')} />
        <Input label="Reorder level" keyboardType="number-pad" value={form.reorderLevel} onChangeText={set('reorderLevel')} />
        <CheckField hint="Active (can be sold)" value={form.isActive} onChange={set('isActive')} />
      </Sheet>

      <Sheet visible={!!stockFor} title={`Stock — ${stockFor?.name || ''}`} subtitle={`Currently ${stockFor?.stock}`} onClose={() => setStockFor(null)} footer={<><Btn light label="Cancel" onPress={() => setStockFor(null)} /><Btn label="Apply" disabled={!delta || Number(delta) === 0} onPress={adjust} /></>}>
        <Input label="Add / remove units" hint="Use a negative number to remove, e.g. -3" keyboardType="numbers-and-punctuation" value={delta} onChangeText={setDelta} />
      </Sheet>
    </Screen>
  );
}
