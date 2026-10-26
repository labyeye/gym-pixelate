import React, { useCallback, useState } from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { request } from '../api/api';
import { WEB_APP_URL } from '../config/env';
import { fmtCredits, useCreditBalance } from '../hooks/useCreditBalance';
import { C, S } from '../theme';
import { Btn, Loader, Panel, Screen, brut } from '../components/ui';

// Top-ups are web-only: the app does not sell anything, it just shows the balance.
const FILTERS = [
  { key: '', label: 'All' },
  { key: 'debit', label: 'Charged' },
  { key: 'skipped', label: 'Not sent' },
  { key: 'refund', label: 'Refunds' },
  { key: 'topup', label: 'Top-ups' },
];

const EVENT_LABEL: Record<string, string> = {
  payment_link: 'Fee payment link',
  expiring: 'Plan expiring reminder',
  expired: 'Plan expired reminder',
  birthday: 'Birthday wish',
};

const REASON: Record<string, string> = {
  low_balance: 'Not sent: no credits',
  daily_cap: 'Not sent: daily limit reached',
  send_failed: 'Refunded: could not send',
  delivery_failed: 'Refunded: not delivered',
};

export default function CreditsScreen() {
  const { credits, refresh } = useCreditBalance();
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: number, f: string) => {
    try {
      const res: any = await request(`/credits/ledger?page=${p}${f ? `&type=${f}` : ''}`);
      setRows(prev => (p === 1 ? res.data : [...prev, ...res.data]));
      setTotal(res.total);
      setPage(p);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(1, filter);
    }, [load, filter]),
  );

  const reload = () => {
    refresh();
    load(1, filter);
  };

  if (loading && !credits) {
    return (
      <Screen title="WhatsApp Credits" back>
        <Loader />
      </Screen>
    );
  }

  if (credits && !credits.metered) {
    return (
      <Screen title="WhatsApp Credits" back>
        <Panel title="Credits are not enabled">
          <Text style={S.body}>WhatsApp messages to your members are included in your plan, so there is nothing to top up.</Text>
        </Panel>
      </Screen>
    );
  }

  return (
    <Screen title="WhatsApp Credits" back refreshing={loading} onRefresh={reload}>
      <View style={brut({ backgroundColor: credits?.zero ? '#FEF2F2' : C.white, padding: 16, marginBottom: 14 })}>
        <Text style={S.label}>AVAILABLE CREDITS</Text>
        <Text style={{ fontSize: 44, fontWeight: '800', color: credits?.zero ? C.danger : C.black }}>{fmtCredits(credits?.total)}</Text>
        {!!credits?.bonus && (
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.success, marginTop: 4 }}>
            includes {fmtCredits(credits.bonus)} bonus
            {credits.bonusExpiresAt ? ` · till ${new Date(credits.bonusExpiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
          </Text>
        )}
        {credits?.zero ? (
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.danger, marginTop: 8 }}>Member WhatsApp messages are paused. Login OTPs still work.</Text>
        ) : credits?.low ? (
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.secondary, marginTop: 8 }}>Running low. Top up so reminders don't stop.</Text>
        ) : null}
        <Text style={[S.body, { marginTop: 8 }]}>
          {credits?.rates?.reminder ?? 0.2} credit per reminder or payment link, {credits?.rates?.birthday ?? 1} per birthday wish. OTPs are free.
        </Text>
        <View style={{ marginTop: 12 }}>
          <Btn label="Add credits on web" onPress={() => Linking.openURL(`${WEB_APP_URL}/credits`)} />
        </View>
      </View>

      <Text style={[S.h3, { marginBottom: 8 }]}>Usage</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderWidth: 2, borderColor: C.black, backgroundColor: filter === f.key ? C.black : C.white }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: filter === f.key ? C.white : C.black }}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {rows.length === 0 ? (
        <Text style={[S.body, { textAlign: 'center' }]}>Nothing here yet</Text>
      ) : (
        <View style={{ borderWidth: 2, borderColor: C.black, backgroundColor: C.white }}>
          {rows.map(r => (
            <View key={r._id} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.black }}>
                  {r.type === 'topup' ? 'Top-up' : r.type === 'bonus' ? 'Bonus credits' : EVENT_LABEL[r.event] || r.event || r.type}
                </Text>
                <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  {new Date(r.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                  {r.phone ? ` · ${r.phone}` : ''}
                </Text>
                {!!(REASON[r.note] || (r.type !== 'debit' && r.note)) && (
                  <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{REASON[r.note] || r.note}</Text>
                )}
              </View>
              <Text style={{ fontSize: 14, fontWeight: '800', color: r.credits > 0 ? C.success : r.credits === 0 ? '#94a3b8' : C.black }}>
                {r.credits > 0 ? '+' : ''}
                {fmtCredits(r.credits)}
              </Text>
            </View>
          ))}
        </View>
      )}
      {rows.length < total && (
        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <Btn label="Load more" light onPress={() => load(page + 1, filter)} />
        </View>
      )}
    </Screen>
  );
}
