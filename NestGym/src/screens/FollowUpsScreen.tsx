import React, { useState } from 'react';
import { Linking, Switch, Text, View } from 'react-native';
import { gym } from '../api/gym';
import { useFetch } from '../hooks/useFetch';
import { C, S } from '../theme';
import { fmtDate, inr, titleCase, waLink } from '../utils/format';
import { Btn, Empty, Input, Loader, Panel, Pill, Row, Screen, Select, Sheet, StatCard, StatGrid, Tabs, notify, RCard } from '../components/ui';

const TABS = [
  { id: 'all', label: 'Everything' }, { id: 'renewal', label: 'Expiring' }, { id: 'lapsed', label: 'Lapsed' }, { id: 'dues', label: 'Dues' },
  { id: 'at_risk', label: 'At risk' }, { id: 'trial', label: 'Trials' }, { id: 'pt_renewal', label: 'PT renewals' }, { id: 'funnel', label: 'Lead funnel' },
];
const OUTCOMES = ['contacted', 'interested', 'no_answer', 'unavailable', 'returning', 'renewed', 'not_interested'];
const REMINDER: Record<string, (n: string, t: string) => string> = {
  renewal: (n, t) => `Hi ${n}, ${t}. Renew today to keep your streak going!`,
  lapsed: n => `Hi ${n}, we miss you at the gym! Renew this week and get back on track.`,
  dues: (n, t) => `Hi ${n}, a gentle reminder: ${t}. Please clear it at the front desk or online.`,
  at_risk: n => `Hi ${n}, we haven't seen you in a while. Everything okay? Your trainer is happy to help you restart.`,
  trial: n => `Hi ${n}, thanks for trying us out! Would you like to join? We have a plan that fits you.`,
  pt_renewal: (n, t) => `Hi ${n}, ${t}. Want to renew your personal-training package?`,
};

export default function FollowUpsScreen() {
  const [tab, setTab] = useState('all');
  const [snoozed, setSnoozed] = useState(false);
  const [target, setTarget] = useState<any>(null);
  const [outcome, setOutcome] = useState('contacted');
  const [note, setNote] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useFetch(() => gym.retention.opportunities({ includeSnoozed: snoozed }), [snoozed], tab !== 'funnel');
  const funnel = useFetch(() => gym.retention.conversion(), [], tab === 'funnel');
  const summary = list.data?.summary;
  const rows: any[] = (list.data?.data || []).filter((r: any) => tab === 'all' || r.type === tab);
  const count = (t: string) => summary?.byType?.[t];

  const save = async () => {
    try {
      setBusy(true);
      await gym.retention.addFollowUp({ memberId: target.member?._id, enquiryId: target.enquiry?._id, kind: target.type, outcome, note: note || undefined, nextFollowUpAt: next || undefined });
      notify.success('Follow-up saved');
      setTarget(null); setNote(''); setNext(''); setOutcome('contacted');
      list.reload();
    } catch (e: any) {
      notify.error('Could not save', e.message);
    } finally {
      setBusy(false);
    }
  };

  const d = funnel.data?.data;
  return (
    <Screen title="Follow-ups" refreshing={list.loading && !!list.data} onRefresh={tab === 'funnel' ? funnel.reload : list.reload}>
      <StatGrid>
        <StatCard label="To chase today" value={summary?.open ?? '—'} sub={summary ? `${summary.snoozed} resting` : undefined} color="#024BAB" />
        <StatCard label="Unpaid (invoiced)" value={summary ? inr(summary.pendingAmount) : '—'} sub="billed, not collected" color="#EF4444" />
        <StatCard label="Renewal potential" value={summary ? inr(summary.projectedAmount) : '—'} sub="projected — not revenue" color="#14B8A6" />
        <StatCard label="At-risk members" value={count('at_risk') ?? 0} sub="paying but not visiting" color="#FA731C" />
      </StatGrid>
      <Tabs value={tab} onChange={setTab} tabs={TABS.map(t => ({ ...t, count: t.id === 'all' ? summary?.open : t.id === 'funnel' ? undefined : count(t.id) ?? 0 }))} />

      {tab === 'funnel' ? (
        funnel.loading && !d ? <Loader /> : funnel.error ? <Text style={[S.body, { color: C.danger }]}>Lead funnel is available to owners, managers and accountants.</Text> : d && (
          <>
            <StatGrid>
              <StatCard label="Follow-ups overdue" value={d.followUpsOverdue} sub="open enquiries past their date" color={d.followUpsOverdue ? '#EF4444' : '#14B8A6'} />
              <StatCard label="Period" value={`${fmtDate(d.from)} – ${fmtDate(d.to)}`} sub="last 90 days" color="#024BAB" />
            </StatGrid>
            {([['By source', 'source', d.bySource], ['By staff', 'staff', d.byStaff]] as const).map(([title, key, rs]) => (
              <Panel key={title} title={title}>
                {(rs || []).length === 0 ? <Empty text="No data" /> : rs.map((r: any) => (
                  <Row key={r[key]} k={titleCase(r[key])} v={`${r.total} leads · ${r.converted} joined · ${r.rate}%`} />
                ))}
              </Panel>
            ))}
          </>
        )
      ) : (
        <>
          <View style={[S.rowBetween, { marginBottom: 12 }]}>
            <Text style={S.body}>Show resting / closed</Text>
            <Switch value={snoozed} onValueChange={setSnoozed} trackColor={{ true: C.primary }} />
          </View>
          {list.loading && !list.data ? <Loader /> : rows.length === 0 ? <Empty text="Nothing to chase" /> : rows.map(r => {
            const who = r.member || r.enquiry;
            const link = waLink(who?.phone, (REMINDER[r.type] || (() => ''))(who?.name, r.title.charAt(0).toLowerCase() + r.title.slice(1)));
            return (
              <RCard key={r.key} style={S.card}>
                <View style={S.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={S.h3}>{who?.name}</Text>
                    <Text style={S.small}>{who?.memberCode || who?.phone}</Text>
                  </View>
                  <Pill value={r.type} tone="blue" />
                </View>
                <Text style={[S.body, { marginTop: 6 }]}>{r.title}{r.overdue ? ' ⚠' : ''}</Text>
                {r.pending ? <Row k="Value" v={`${inr(r.pending)} due`} color={C.danger} bold /> : r.projected ? <Row k="Value" v={`≈ ${inr(r.projected)}`} /> : null}
                {r.lastFollowUp && <Row k="Last contact" v={`${titleCase(r.lastFollowUp.outcome)} · ${fmtDate(r.lastFollowUp.at)}`} />}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  {link && who?.whatsappOptIn !== false && <Btn small color="#25D366" label="WhatsApp" onPress={() => Linking.openURL(link)} />}
                  <Btn small label="Log" onPress={() => setTarget(r)} />
                </View>
              </RCard>
            );
          })}
        </>
      )}

      <Sheet
        visible={!!target}
        title="Log follow-up"
        subtitle={(target?.member || target?.enquiry)?.name}
        onClose={() => setTarget(null)}
        footer={<><Btn light label="Cancel" onPress={() => setTarget(null)} /><Btn label="Save" busy={busy} onPress={save} /></>}
      >
        <Select label="Outcome" options={OUTCOMES} value={outcome} onChange={setOutcome} />
        <Input label="Note" value={note} onChangeText={setNote} multiline />
        <Input label="Next follow-up" value={next} onChangeText={setNext} placeholder="YYYY-MM-DD" />
      </Sheet>
    </Screen>
  );
}
