import React, { useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { Ban, PackageCheck, Paperclip, Plus, Trash2 } from 'lucide-react-native';
import { gym } from '../../api/gym';
import { request } from '../../api/api';
import { useDebounced, useFetch } from '../../hooks/useFetch';
import { C, S } from '../../theme';
import { fmtDate, fmtDateTime, inr } from '../../utils/format';
import { Thumb } from '../../components/PhotoPicker';
import {
  brut,
  Btn,
  Empty,
  Input,
  Loader,
  Pager,
  Pill,
  RCard,
  SearchBox,
  Select,
  Sheet,
  notify,
} from '../../components/ui';

const line = () => ({ productId: '', quantity: '1', unitCost: '', gstPercent: '' });
const blank = {
  vendor: '',
  vendorPhone: '',
  billNumber: '',
  billDate: '',
  billFile: '',
  paidAmount: '',
  notes: '',
};

/** pick a bill photo and upload it; resolves to the stored URL ('' = cancelled) */
async function pickBill(): Promise<string> {
  const r = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
  const a = r.assets?.[0];
  if (!a?.uri) return '';
  const fd = new FormData();
  fd.append('file', {
    uri: a.uri,
    name: a.fileName || `bill-${Date.now()}.jpg`,
    type: a.type || 'image/jpeg',
  } as any);
  return (await request<{ url: string }>('/upload/bill', { method: 'POST', body: fd })).url;
}

const statusPill = (s: string) =>
  s === 'ordered' ? 'pending' : s === 'received' ? 'completed' : 'cancelled';

export function PurchasesTab({ products, canWrite }: { products: any[]; canWrite: boolean }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [status, setStatus] = useState('');
  const [vendorF, setVendorF] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>(blank);
  const [lines, setLines] = useState([line()]);
  const [busy, setBusy] = useState(false);

  const { data, loading, reload } = useFetch(
    () => gym.purchases.list({ page, limit: 25, q: dq, status, vendor: vendorF }),
    [page, dq, status, vendorF],
  );
  const rows: any[] = data?.data || [];
  const set = (k: string) => (v: string) => setF((x: any) => ({ ...x, [k]: v }));
  const setLine = (i: number, k: string, v: string) =>
    setLines(ls => ls.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const total = lines.reduce((s, l) => {
    const base = (Number(l.quantity) || 0) * (Number(l.unitCost) || 0);
    return s + base * (1 + (Number(l.gstPercent) || 0) / 100);
  }, 0);

  const attach = async (p?: any) => {
    try {
      const url = await pickBill();
      if (!url) return;
      if (p) {
        await gym.purchases.setBill(p._id, { billFile: url });
        notify.success('Bill attached');
        reload();
      } else set('billFile')(url);
    } catch (e: any) {
      notify.error('Upload failed', e.message);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await gym.purchases.create({
        ...f,
        billDate: f.billDate || undefined,
        paidAmount: Number(f.paidAmount) || 0,
        items: lines
          .filter(l => l.productId)
          .map(l => ({
            productId: l.productId,
            quantity: Number(l.quantity),
            unitCost: Number(l.unitCost),
            gstPercent: Number(l.gstPercent) || 0,
          })),
      });
      notify.success('Purchase order saved');
      setOpen(false);
      setLines([line()]);
      setF(blank);
      reload();
    } catch (e: any) {
      notify.error('Could not save', e.message);
    }
    setBusy(false);
  };

  const act = async (fn: () => Promise<any>, ok: string) => {
    try {
      await fn();
      notify.success(ok);
      reload();
    } catch (e: any) {
      notify.error('Failed', e.message);
    }
  };

  return (
    <>
      <SearchBox
        value={q}
        onChange={v => {
          setQ(v);
          setPage(1);
        }}
        placeholder="PO, GRN, vendor or bill no…"
      />
      <Select
        label="Status"
        value={status}
        allowEmpty
        placeholder="All"
        onChange={v => {
          setStatus(v);
          setPage(1);
        }}
        options={['ordered', 'received', 'cancelled']}
      />
      {!!data?.vendors?.length && (
        <Select
          label="Vendor"
          value={vendorF}
          allowEmpty
          placeholder="All"
          onChange={v => {
            setVendorF(v);
            setPage(1);
          }}
          options={data.vendors}
        />
      )}
      {canWrite && (
        <Btn label="New purchase" icon={<Plus color={C.white} />} onPress={() => setOpen(true)} />
      )}
      <View style={{ height: 12 }} />

      {loading && !data ? (
        <Loader />
      ) : rows.length === 0 ? (
        <Empty text="No purchases yet" />
      ) : (
        rows.map(p => (
          <RCard key={p._id} style={brut({ padding: 14, marginBottom: 10 })}>
            <View style={S.rowBetween}>
              <Text style={S.label}>
                {p.poNumber}
                {p.grnNumber ? ` · ${p.grnNumber}` : ''}
              </Text>
              <Pill value={statusPill(p.status)} />
            </View>
            <Text style={S.body}>{p.vendor}</Text>
            <Text style={S.label}>
              {fmtDate(p.createdAt)} · Bill {p.billNumber || '—'}
            </Text>
            <Text style={S.label} numberOfLines={2}>
              {(p.items || []).map((i: any) => `${i.name} ×${i.quantity}`).join(', ')}
            </Text>
            <View style={[S.rowBetween, { marginTop: 6 }]}>
              <Text style={S.body}>{inr(p.total, 2)}</Text>
              <Text style={S.label}>Paid {inr(p.paidAmount, 2)}</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {!!p.billFile && (
                <Btn small light label="View bill" onPress={() => Linking.openURL(p.billFile)} />
              )}
              <Btn
                small
                light
                label={p.billFile ? 'Replace bill' : 'Attach bill'}
                icon={<Paperclip color={C.black} />}
                onPress={() => attach(p)}
              />
              {p.status === 'ordered' && canWrite && (
                <>
                  <Btn
                    small
                    label="Receive"
                    icon={<PackageCheck color={C.white} />}
                    onPress={() => act(() => gym.purchases.receive(p._id), 'Received — stock added')}
                  />
                  <Btn
                    small
                    danger
                    label="Cancel"
                    icon={<Ban color={C.white} />}
                    onPress={() =>
                      Alert.alert(`Cancel ${p.poNumber}?`, undefined, [
                        { text: 'Keep' },
                        {
                          text: 'Cancel order',
                          style: 'destructive',
                          onPress: () => act(() => gym.purchases.cancel(p._id), 'Order cancelled'),
                        },
                      ])
                    }
                  />
                </>
              )}
            </View>
          </RCard>
        ))
      )}
      <Pager page={page} pages={data?.pages || 1} onPage={setPage} />

      <Sheet
        visible={open}
        title="New purchase"
        subtitle="Receiving it issues a GRN and adds stock."
        onClose={() => setOpen(false)}
        footer={
          <Btn
            label={`Save order · ${inr(total, 2)}`}
            busy={busy}
            disabled={!f.vendor.trim() || !lines.some(l => l.productId)}
            onPress={save}
          />
        }
      >
        <Input label="Vendor" required value={f.vendor} onChangeText={set('vendor')} />
        <Input label="Vendor phone" keyboardType="phone-pad" value={f.vendorPhone} onChangeText={set('vendorPhone')} />
        <Input label="Bill number" value={f.billNumber} onChangeText={set('billNumber')} />
        <Input label="Bill date" placeholder="YYYY-MM-DD" value={f.billDate} onChangeText={set('billDate')} />
        <Btn
          light
          label={f.billFile ? 'Bill attached — replace' : 'Upload bill photo'}
          icon={<Paperclip color={C.black} />}
          onPress={() => attach()}
        />
        <Text style={[S.label, { marginTop: 12 }]}>PRODUCTS</Text>
        {lines.map((l, i) => (
          <View key={i} style={brut({ padding: 10, marginTop: 8 })}>
            <Select
              label="Product"
              placeholder="Select product"
              value={l.productId}
              options={products.map(p => ({
                value: p._id,
                label: `${p.name}${p.sku ? ' · ' + p.sku : ''}`,
              }))}
              onChange={v => {
                const p = products.find(x => x._id === v);
                setLines(ls =>
                  ls.map((x, j) =>
                    j === i
                      ? {
                          ...x,
                          productId: v,
                          unitCost: x.unitCost || String(p?.costPrice || ''),
                          gstPercent: x.gstPercent || String(p?.gstPercent ?? ''),
                        }
                      : x,
                  ),
                );
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Input label="Qty" keyboardType="numeric" value={l.quantity} onChangeText={v => setLine(i, 'quantity', v)} />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="Unit cost" keyboardType="numeric" value={l.unitCost} onChangeText={v => setLine(i, 'unitCost', v)} />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="GST %" keyboardType="numeric" value={l.gstPercent} onChangeText={v => setLine(i, 'gstPercent', v)} />
              </View>
            </View>
            {lines.length > 1 && (
              <Btn
                small
                danger
                label="Remove"
                icon={<Trash2 color={C.white} />}
                onPress={() => setLines(ls => ls.filter((_, j) => j !== i))}
              />
            )}
          </View>
        ))}
        <View style={{ height: 8 }} />
        <Btn light label="Add product" icon={<Plus color={C.black} />} onPress={() => setLines(ls => [...ls, line()])} />
        <Input
          label="Paid to vendor (₹)"
          keyboardType="numeric"
          value={f.paidAmount}
          onChangeText={set('paidAmount')}
          hint="Booked as an expense when received"
        />
        <Input label="Notes" multiline value={f.notes} onChangeText={set('notes')} />
      </Sheet>
    </>
  );
}

export function SalesTab() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading } = useFetch(
    () => gym.products.sales({ page, limit: 25, q: dq, from, to }),
    [page, dq, from, to],
  );
  const rows: any[] = data?.data || [];
  const prodLines = (v: any) => (v.items || []).filter((i: any) => i.kind === 'product');
  return (
    <>
      <SearchBox
        value={q}
        onChange={v => {
          setQ(v);
          setPage(1);
        }}
        placeholder="Invoice number…"
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Input label="From" placeholder="YYYY-MM-DD" value={from} onChangeText={v => { setFrom(v); setPage(1); }} />
        </View>
        <View style={{ flex: 1 }}>
          <Input label="To" placeholder="YYYY-MM-DD" value={to} onChangeText={v => { setTo(v); setPage(1); }} />
        </View>
      </View>
      {loading && !data ? (
        <Loader />
      ) : rows.length === 0 ? (
        <Empty text="No sales yet" />
      ) : (
        rows.map(v => (
          <RCard key={v._id} style={brut({ padding: 14, marginBottom: 10 })}>
            <View style={S.rowBetween}>
              <Text style={S.label}>{v.invoiceNumber}</Text>
              <Pill value={v.status} />
            </View>
            <Text style={S.label}>{fmtDateTime(v.issuedAt)}</Text>
            {v.memberId ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6 }}>
                <Thumb uri={v.memberId.photo} name={v.memberId.name} />
                <Text style={S.label}>{v.memberId.memberCode}</Text>
              </View>
            ) : (
              <Text style={[S.label, { marginVertical: 4 }]}>Walk-in</Text>
            )}
            <Text style={S.body}>
              {prodLines(v).map((l: any) => `${l.description} ×${l.quantity}`).join(', ')}
            </Text>
            <View style={[S.rowBetween, { marginTop: 6 }]}>
              <Text style={S.body}>{inr(v.totalAmount, 2)}</Text>
              <Text style={S.label}>
                Paid {inr(v.paidAmount, 2)} · {v.createdBy?.name || '—'}
              </Text>
            </View>
          </RCard>
        ))
      )}
      <Pager page={page} pages={data?.pages || 1} onPage={setPage} />
    </>
  );
}
