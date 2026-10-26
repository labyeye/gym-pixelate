import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AlertTriangle, BadgeCheck, CalendarX2, FileText, IndianRupee, Plus, RefreshCw, TrendingUp, Wallet } from 'lucide-react-native';
import { gym } from '../api/gym';
import { isManager, useAuth } from '../contexts/AuthContext';
import { useDebounced, useFetch } from '../hooks/useFetch';
import { C, FONT, S } from '../theme';
import { daysFromNow, fmtDate, inr } from '../utils/format';
import { Avatar } from '../components/PhotoPicker';
import { PaymentSheet, SellMembershipSheet } from '../components/gymSheets';
import { Btn, Empty, IconBtn, Loader, MiniStat, MiniStatRow, Pager, Pill, RCard, Screen, SearchBox, Tabs } from '../components/ui';
import ExportSheet, { ExportSpec } from '../components/ExportSheet';
import { Download as ExportIcon } from 'lucide-react-native';

const STATUS_TABS = ['active', 'upcoming', 'frozen', 'expired', 'cancelled'];

/** Membership status: who holds which plan, until when, and what is still unpaid. */
export default function MembershipsScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const canSell = user?.role === 'gym_owner' || isManager(user) || user?.role === 'receptionist';
  const [search, setSearch] = useState('');
  const dsearch = useDebounced(search);
  const [status, setStatus] = useState('');
  const [only, setOnly] = useState<'' | 'expiring' | 'dues'>('');
  const [page, setPage] = useState(1);
  const [collect, setCollect] = useState<any>(null);
  const [exp, setExp] = useState<ExportSpec | null>(null);
  const [sell, setSell] = useState<{ mode: 'sell' | 'renew' | 'upgrade'; membership?: any } | null>(null);

  const params = useMemo(
    () => ({
      page,
      limit: 25,
      search: dsearch,
      status,
      ...(only === 'expiring' ? { expiringInDays: 7, sort: 'endDate' } : {}),
      ...(only === 'dues' ? { dues: 'true' } : {}),
    }),
    [page, dsearch, status, only],
  );
  const { data, loading, reload } = useFetch(() => gym.memberships.list(params), [params]);
  const rows: any[] = data?.data || [];
  const c = data?.counts || {};
  const exportMemberships = () =>
    setExp({
      name: 'Memberships',
      cols: [
        { header: 'Member ID', value: (m: any) => m.memberId?.memberCode },
        { header: 'Member', value: (m: any) => m.memberId?.name },
        { header: 'Phone', value: (m: any) => m.memberId?.phone },
        { header: 'Plan', value: (m: any) => m.planName },
        { header: 'Start', value: (m: any) => fmtDate(m.startDate) },
        { header: 'End', value: (m: any) => fmtDate(m.endDate) },
        { header: 'Total', value: (m: any) => m.totalAmount },
        { header: 'Paid', value: (m: any) => m.paidAmount },
        { header: 'Due', value: (m: any) => Math.max(0, (m.totalAmount || 0) - (m.paidAmount || 0)) },
        { header: 'Status', value: (m: any) => m.status },
      ],
      rows: async () => (await gym.memberships.list({ ...params, page: 1, limit: 1000 })).data || [],
    });
  const pick = (s: string, o: '' | 'expiring' | 'dues' = '') => { setStatus(s); setOnly(o); setPage(1); };

  return (
    <Screen
      title="Memberships"
      refreshing={loading && !!data}
      onRefresh={reload}
      right={<><Btn small label="Export" icon={<ExportIcon />} onPress={exportMemberships} />{canSell && <Btn small label="Sell" icon={<Plus />} onPress={() => setSell({ mode: 'sell' })} />}</>}
    >
      <MiniStatRow>
        <MiniStat label="Active" value={c.active ?? 0} icon={BadgeCheck} color={C.success} onPress={() => pick('active')} />
        <MiniStat label="Expiring 7d" value={c.expiring ?? 0} icon={AlertTriangle} color={C.secondary} onPress={() => pick('', 'expiring')} />
        <MiniStat label="Expired" value={c.expired ?? 0} icon={CalendarX2} color={C.danger} onPress={() => pick('expired')} />
        <MiniStat label="Dues" value={c.dues ?? 0} icon={IndianRupee} color="#A855F7" onPress={() => pick('', 'dues')} />
      </MiniStatRow>

      <SearchBox value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Member name, phone or code…" />
      <Tabs
        value={only || status}
        onChange={v => (v === 'expiring' || v === 'dues' ? pick('', v) : pick(v))}
        tabs={[
          { id: '', label: 'All' },
          ...STATUS_TABS.map(x => ({ id: x, label: x })),
          { id: 'expiring', label: 'Expiring' },
          { id: 'dues', label: 'Dues' },
        ]}
      />

      {loading && !data ? <Loader /> : rows.length === 0 ? <Empty text="No memberships found" /> : rows.map(m => {
        const left = daysFromNow(m.endDate);
        const due = Math.max(0, (m.totalAmount || 0) - (m.paidAmount || 0));
        const live = ['active', 'frozen', 'upcoming'].includes(m.status);
        const span = Math.max(1, daysFromNow(m.endDate) - daysFromNow(m.startDate));
        const pct = live ? Math.max(0, Math.min(100, (1 - Math.max(0, left) / span) * 100)) : 100;
        const tone = !live ? C.black : left < 0 ? C.danger : left <= 7 ? '#C2410C' : '#15803D';
        return (
          <RCard key={m._id} style={[S.card, { padding: 12 }]}>
            <TouchableOpacity activeOpacity={0.85} onPress={() => m.memberId?._id && nav.navigate('MemberProfile', { id: m.memberId._id })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar uri={m.memberId?.photo} name={m.memberId?.name || '?'} size={46} round />
                <View style={{ flex: 1 }}>
                  <Text style={S.h3} numberOfLines={1}>{m.memberId?.name}</Text>
                  <Text style={S.small} numberOfLines={1}>{m.memberId?.memberCode} · {m.memberId?.phone}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Pill value={m.status} />
                  <Pill value={due <= 0.005 ? 'paid' : (m.paidAmount || 0) > 0 ? 'partial' : 'pending'} />
                </View>
              </View>
              <View style={[S.rowBetween, { marginTop: 10 }]}>
                <Text style={[S.body, { fontFamily: FONT.bold, flex: 1 }]} numberOfLines={1}>{m.planName || m.planId?.name}</Text>
                <Text style={[S.body, { fontFamily: FONT.bold, color: tone }]}>
                  {!live ? '—' : left < 0 ? `${-left}d overdue` : `${left}d left`}
                </Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: '#E5E7EB', marginTop: 6, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${pct}%`, backgroundColor: tone === C.black ? '#9CA3AF' : tone }} />
              </View>
              <View style={[S.rowBetween, { marginTop: 6 }]}>
                <Text style={S.small}>{fmtDate(m.startDate)} → {fmtDate(m.endDate)}</Text>
                <Text style={S.small}>
                  {inr(m.paidAmount)} / {inr(m.totalAmount)}
                  {due > 0 ? <Text style={{ color: C.danger, fontFamily: FONT.bold }}> · due {inr(due)}</Text> : null}
                </Text>
              </View>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 }}>
              {due > 0.005 && m.invoiceId && canSell && <IconBtn icon={Wallet} label="Collect fee" color={C.primary} onPress={() => setCollect({ _id: m.invoiceId, invoiceNumber: m.invoiceNumber, totalAmount: m.totalAmount, paidAmount: m.paidAmount })} />}
              {!!m.invoiceId && <IconBtn icon={FileText} label="Receipt and payment history" onPress={() => nav.navigate('InvoiceDetail', { id: m.invoiceId })} />}
              {canSell && m.status === 'active' && <IconBtn icon={TrendingUp} label="Change plan" onPress={() => setSell({ mode: 'upgrade', membership: m })} />}
              {canSell && (live || m.status === 'expired') && <IconBtn icon={RefreshCw} label="Renew" color={C.primary} onPress={() => setSell({ mode: 'renew', membership: m })} />}
            </View>
          </RCard>
        );
      })}
      <Pager page={page} pages={data?.pages || 1} onPage={setPage} />

      <PaymentSheet invoice={collect} mode="pay" onClose={() => { setCollect(null); reload(); }} />
      <SellMembershipSheet open={!!sell} mode={sell?.mode} membership={sell?.membership} onClose={() => { setSell(null); reload(); }} />
      <ExportSheet spec={exp} onClose={() => setExp(null)} />
    </Screen>
  );
}
