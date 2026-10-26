import React, { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import { Api } from '../api/gym';
import { useAuth, isManager } from '../contexts/AuthContext';
import { useDebounced, useFetch } from '../hooks/useFetch';
import { C, S } from '../theme';
import { fmtDate, idOf, titleCase, toInputDate } from '../utils/format';
import { PhoneInput } from './PhoneInput';
import { MemberPicker, useClasses, usePlans, useTrainers } from './pickers';
import {
  Btn,
  CheckField,
  Empty,
  IconBtn,
  Input,
  Loader,
  Pair,
  Pager,
  Pill,
  Screen,
  SearchBox,
  Select,
  Sheet,
  Tabs,
  notify, RCard,
} from './ui';
import ExportSheet, { ExportSpec } from './ExportSheet';
import { Download as ExportIcon } from 'lucide-react-native';

export interface FieldDef {
  key: string;
  label: string;
  type?:
    | 'text'
    | 'number'
    | 'date'
    | 'datetime'
    | 'email'
    | 'tel'
    | 'select'
    | 'textarea'
    | 'checkbox'
    | 'member'
    | 'trainer'
    | 'plan'
    | 'class';
  options?: (string | { value: string; label: string })[];
  required?: boolean;
  hint?: string;
  default?: any;
  placeholder?: string;
  createOnly?: boolean;
}

export interface CardInfo {
  title: string;
  subtitle?: string;
  pill?: string;
  /** big right-hand value, e.g. an amount */
  value?: string;
  lines?: [string, React.ReactNode][];
}
export interface RowAction {
  label: string;
  /** icon-only button when set; otherwise a bare text button */
  icon?: any;
  onPress: () => void;
  tone?: 'primary' | 'danger' | 'light';
  hidden?: boolean;
}

interface Props {
  title: string;
  noun: string;
  api: Api;
  fields: FieldDef[];
  card: (row: any) => CardInfo;
  filters?: { key: string; label: string; options: string[] }[];
  stats?: (rows: any[], total: number) => React.ReactNode;
  rowActions?: (row: any, reload: () => void) => RowAction[];
  listParams?: Record<string, any>;
  searchable?: boolean;
  canDelete?: boolean;
  toForm?: (row: any) => Record<string, any>;
  toPayload?: (body: Record<string, any>) => Record<string, any>;
  after?: React.ReactNode;
  back?: boolean;
  /** replace the default card; `actions` is the ready-made icon row */
  renderCard?: (row: any, actions: React.ReactNode) => React.ReactNode;
  /** pull the raw list result (some endpoints use a different param name for search) */
  searchParam?: string;
}

// two short fields share a row; textareas and member pickers stay full width
const wide = (f: FieldDef) => f.type === 'textarea' || f.type === 'member';
const pairUp = (fields: FieldDef[]) => {
  const out: FieldDef[][] = [];
  for (const f of fields) {
    const last = out[out.length - 1];
    if (!wide(f) && last && last.length === 1 && !wide(last[0])) last.push(f);
    else out.push([f]);
  }
  return out;
};

const getPath = (o: any, p: string) =>
  p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o: any, p: string, v: any) => {
  const ks = p.split('.');
  let cur = o;
  ks.slice(0, -1).forEach(k => {
    cur[k] = cur[k] || {};
    cur = cur[k];
  });
  cur[ks[ks.length - 1]] = v;
};
const blank = (fields: FieldDef[]) =>
  Object.fromEntries(
    fields.map(f => [f.key, f.default ?? (f.type === 'checkbox' ? false : '')]),
  );
const toLocalDT = (v: any) => {
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function ResourceScreen(p: Props) {
  const { user } = useAuth();
  const owner = user?.role === 'gym_owner';
  const canWrite = owner || isManager(user);
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<any>(null); // row | 'new'
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [exp, setExp] = useState<ExportSpec | null>(null);
  const trainers = useTrainers();
  const plans = usePlans(false);
  const classes = useClasses();

  const params = useMemo(
    () => ({
      page,
      limit: 25,
      [p.searchParam || 'q']: dq,
      ...filter,
      ...(p.listParams || {}),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, dq, filter, JSON.stringify(p.listParams)],
  );
  const { data, loading, reload } = useFetch(() => p.api.list(params), [params]);
  const rows: any[] = data?.data || [];

  // every field of the form becomes a column; all pages of the current search / filters are exported
  const cell = (row: any, f: FieldDef) => {
    const v = getPath(row, f.key);
    if (v === undefined || v === null || v === '') return '';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'object') return v.name || v.title || v.label || '';
    if (f.type === 'date' || f.type === 'datetime') return fmtDate(v);
    if (f.type === 'select') return titleCase(String(v));
    return String(v);
  };
  const openExport = () =>
    setExp({
      name: p.title,
      cols: p.fields.map(f => ({ header: f.label, value: (r: any) => cell(r, f) })),
      rows: async () => (await p.api.list({ ...params, page: 1, limit: 1000 })).data || [],
    });

  const openNew = () => {
    setForm(blank(p.fields));
    setEditing('new');
  };
  const openEdit = (row: any) => {
    const base = blank(p.fields);
    const src = p.toForm ? p.toForm(row) : row;
    for (const f of p.fields) {
      const v = getPath(src, f.key);
      if (v === undefined || v === null) continue;
      base[f.key] =
        f.type === 'date'
          ? toInputDate(v)
          : f.type === 'datetime'
          ? toLocalDT(v)
          : f.type === 'number'
          ? String(v)
          : v;
    }
    setForm(base);
    setEditing(row);
  };

  const submit = async () => {
    const body: Record<string, any> = {};
    for (const f of p.fields) {
      if (f.createOnly && editing !== 'new') continue;
      let v = form[f.key];
      if (f.required && f.type !== 'checkbox' && (v === '' || v == null)) {
        return notify.error('Missing field', `${f.label} is required`);
      }
      if (f.type === 'member') {
        setPath(body, f.key, idOf(v) || undefined);
        continue;
      }
      if (f.type === 'number') v = v === '' || v == null ? undefined : Number(v);
      if (f.type === 'date') v = v ? new Date(v).toISOString() : undefined;
      if (f.type === 'datetime')
        v = v ? new Date(String(v).replace(' ', 'T')).toISOString() : undefined;
      if (v === '' && f.type !== 'checkbox') v = undefined;
      setPath(body, f.key, v);
    }
    try {
      setSaving(true);
      const payload = p.toPayload ? p.toPayload(body) : body;
      if (editing === 'new') await p.api.create(payload);
      else await p.api.update(editing._id, payload);
      notify.success(editing === 'new' ? `${p.noun} added` : `${p.noun} updated`);
      setEditing(null);
      reload();
    } catch (e: any) {
      notify.error('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = (row: any) =>
    Alert.alert(`Delete this ${p.noun}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await p.api.remove(row._id);
            notify.success(`${p.noun} deleted`);
            reload();
          } catch (e: any) {
            notify.error('Delete failed', e.message);
          }
        },
      },
    ]);

  const set = (k: string) => (v: any) => setForm(f => ({ ...f, [k]: v }));
  const renderField = (f: FieldDef) => {
    if (f.createOnly && editing !== 'new') return null;
    const v = form[f.key];
    switch (f.type) {
      case 'select':
        return <Select key={f.key} label={f.label} required={f.required} hint={f.hint} options={f.options || []} value={v} onChange={set(f.key)} allowEmpty={!f.required} />;
      case 'trainer':
        return <Select key={f.key} label={f.label} required={f.required} options={trainers} value={idOf(v)} onChange={set(f.key)} allowEmpty />;
      case 'plan':
        return <Select key={f.key} label={f.label} required={f.required} options={plans.map((x: any) => ({ value: x._id, label: x.name }))} value={idOf(v)} onChange={set(f.key)} allowEmpty />;
      case 'class':
        return <Select key={f.key} label={f.label} required={f.required} options={classes} value={idOf(v)} onChange={set(f.key)} allowEmpty />;
      case 'member':
        return <MemberPicker key={f.key} label={f.label} required={f.required} value={typeof v === 'object' ? v : null} onChange={set(f.key)} />;
      case 'tel':
        return <PhoneInput key={f.key} label={f.label} required={f.required} hint={f.hint} value={v == null ? '' : String(v)} onChange={set(f.key)} />;
      case 'checkbox':
        return <CheckField key={f.key} label={f.label} hint={f.hint} value={!!v} onChange={set(f.key)} />;
      default:
        return (
          <Input
            key={f.key}
            label={f.label}
            required={f.required}
            hint={f.hint}
            multiline={f.type === 'textarea'}
            keyboardType={f.type === 'number' ? 'decimal-pad' : f.type === 'email' ? 'email-address' : 'default'}
            autoCapitalize={f.type === 'email' ? 'none' : undefined}
            placeholder={f.placeholder || (f.type === 'date' ? 'YYYY-MM-DD' : f.type === 'datetime' ? 'YYYY-MM-DD HH:mm' : undefined)}
            value={v == null ? '' : String(v)}
            onChangeText={set(f.key)}
          />
        );
    }
  };

  return (
    <Screen
      title={p.title}
      back={p.back}
      refreshing={loading && !!data}
      onRefresh={reload}
      right={<><Btn small label="Export" icon={<ExportIcon />} onPress={openExport} />{canWrite && <Btn small label="Add" icon={<Plus size={14} color="#fff" />} onPress={openNew} />}</>}
    >
      {p.stats?.(rows, data?.total ?? rows.length)}
      {p.searchable !== false && (
        <SearchBox value={q} onChange={v => { setQ(v); setPage(1); }} placeholder={`Search ${p.noun}s…`} />
      )}
      {p.filters?.map(f => (
        <Tabs
          key={f.key}
          value={filter[f.key] || ''}
          onChange={v => { setFilter(s => ({ ...s, [f.key]: v })); setPage(1); }}
          tabs={[{ id: '', label: `All ${f.label}` }, ...f.options.map(o => ({ id: o, label: o.replace(/_/g, ' ') }))]}
        />
      ))}

      {loading && !data ? (
        <Loader />
      ) : rows.length === 0 ? (
        <Empty text={`No ${p.noun}s yet`} />
      ) : (
        rows.map(r => {
          const c = p.card(r);
          const acts = [
            ...(p.rowActions?.(r, reload) || []),
            ...(canWrite ? [{ label: 'Edit', icon: Pencil, onPress: () => openEdit(r) } as RowAction] : []),
            ...(owner && p.canDelete !== false ? [{ label: 'Delete', icon: Trash2, tone: 'danger', onPress: () => remove(r) } as RowAction] : []),
          ].filter(a => !a.hidden);
          const actions = acts.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {acts.map(a =>
                a.icon ? (
                  <IconBtn key={a.label} icon={a.icon} label={a.label} color={a.tone === 'danger' ? C.danger : a.tone === 'primary' ? C.primary : C.black} onPress={a.onPress} />
                ) : (
                  <Btn key={a.label} small label={a.label} light={a.tone !== 'primary' && a.tone !== 'danger'} danger={a.tone === 'danger'} onPress={a.onPress} />
                ),
              )}
            </View>
          );
          if (p.renderCard) return <RCard key={r._id} style={S.card}>{p.renderCard(r, actions)}</RCard>;
          return (
            <RCard key={r._id} style={S.card}>
              <View style={[S.rowBetween, { alignItems: 'flex-start' }]}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={S.h3}>{c.title}</Text>
                  {!!c.subtitle && <Text style={S.small}>{c.subtitle}</Text>}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  {!!c.value && <Text style={S.h3}>{c.value}</Text>}
                  <Pill value={c.pill} />
                </View>
              </View>
              {c.lines?.map(([k, v]) => (
                <View key={k} style={[S.rowBetween, { marginTop: 4 }]}>
                  <Text style={S.small}>{k}</Text>
                  <Text style={[S.body, { fontSize: 13, flexShrink: 1, textAlign: 'right' }]}>{v ?? '—'}</Text>
                </View>
              ))}
              {!!actions && <View style={{ alignItems: 'flex-end', marginTop: 8 }}>{actions}</View>}
            </RCard>
          );
        })
      )}
      <Pager page={page} pages={data?.pages || 1} onPage={setPage} />
      {p.after}

      <Sheet
        visible={!!editing}
        title={editing === 'new' ? `Add ${p.noun}` : `Edit ${p.noun}`}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Btn light label="Cancel" onPress={() => setEditing(null)} />
            <Btn label="Save" busy={saving} onPress={submit} />
          </>
        }
      >
        {pairUp(p.fields.filter(f => !(f.createOnly && editing !== 'new'))).map((g, i) =>
          g.length === 2 ? <Pair key={i}>{g.map(renderField)}</Pair> : renderField(g[0]),
        )}
      </Sheet>
      <ExportSheet spec={exp} onClose={() => setExp(null)} />
    </Screen>
  );
}
