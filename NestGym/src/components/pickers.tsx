import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { gym } from '../api/gym';
import { C, FONT, S } from '../theme';
import { Empty, Field, Sheet, SearchBox } from './ui';
import { useDebounced } from '../hooks/useFetch';

/** Search-as-you-type member chooser (web: MemberPicker). */
export function MemberPicker({
  label = 'Member',
  value,
  onChange,
  required,
}: {
  label?: string;
  value: any | null;
  onChange: (m: any | null) => void;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    gym.members
      .list({ search: dq, limit: 20 })
      .then(r => live && setRows(r.data || []))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [open, dq]);

  return (
    <Field label={label} required={required}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setOpen(true)}
        style={[S.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
      >
        <Text style={{ fontFamily: FONT.medium, fontSize: 14, flex: 1, color: value ? C.black : '#9CA3AF' }} numberOfLines={1}>
          {value ? `${value.name} · ${value.memberCode || value.phone}` : 'Find member by name or phone…'}
        </Text>
        <ChevronDown size={18} color={C.black} />
      </TouchableOpacity>
      <Sheet visible={open} title="Find member" onClose={() => setOpen(false)}>
        <SearchBox value={q} onChange={setQ} placeholder="Name, phone or member code…" />
        {rows.length === 0 && <Empty text="No members found" />}
        {rows.map(m => (
          <TouchableOpacity
            key={m._id}
            onPress={() => {
              onChange(m);
              setOpen(false);
            }}
            style={{ paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}
          >
            <Text style={S.h3}>{m.name}</Text>
            <Text style={S.small}>
              {m.memberCode} · {m.phone}
            </Text>
          </TouchableOpacity>
        ))}
        {!!value && (
          <View style={{ marginTop: 10 }}>
            <TouchableOpacity
              onPress={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              <Text style={[S.label, { color: C.danger }]}>Clear selection</Text>
            </TouchableOpacity>
          </View>
        )}
      </Sheet>
    </Field>
  );
}

/** Option lists used by forms; each loads once per mount. */
function useList<T>(load: () => Promise<any>, map: (r: any) => T[]) {
  const [rows, setRows] = useState<T[]>([]);
  useEffect(() => {
    let live = true;
    load()
      .then(r => live && setRows(map(r)))
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return rows;
}
export const useTrainers = () =>
  useList<{ value: string; label: string }>(
    () => gym.users.list({ role: 'trainer' }),
    r => (r.data || []).map((u: any) => ({ value: u._id, label: u.name })),
  );
export const usePlans = (activeOnly = true) =>
  useList<any>(
    () => gym.plans.list({ limit: 100, ...(activeOnly ? { isActive: 'true' } : {}) }),
    r => r.data || [],
  );
export const useClasses = () =>
  useList<{ value: string; label: string }>(
    () => gym.classes.list({ limit: 100 }),
    r => (r.data || []).map((c: any) => ({ value: c._id, label: c.name })),
  );
