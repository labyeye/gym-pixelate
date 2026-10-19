import React, { useState } from 'react';
import { FlatList, Image, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronDown, X } from 'lucide-react-native';
import { C, FONT, S } from '../theme';
import { COUNTRIES, countryOf, joinPhone, splitPhone } from '../utils/countries';
import { Field, SearchBox } from './ui';

// Emoji flags are unreliable on some devices, so use real flag images.
function Flag({ iso, size = 22 }: { iso: string; size?: number }) {
  const [bad, setBad] = useState(false);
  if (bad) return <Text style={{ fontFamily: FONT.bold, fontSize: 10, color: C.black }}>{iso}</Text>;
  return (
    <Image
      source={{ uri: `https://flagcdn.com/w40/${iso.toLowerCase()}.png` }}
      onError={() => setBad(true)}
      style={{ width: size, height: Math.round(size * 0.73), borderWidth: 1, borderColor: 'rgba(0,0,0,0.3)' }}
      resizeMode="cover"
    />
  );
}

/** Country-code picker + number box. Emits the stored format (see utils/countries.ts). */
export function PhoneInput({
  label,
  required,
  hint,
  value,
  onChange,
  editable = true,
}: {
  label?: string;
  required?: boolean;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  editable?: boolean;
}) {
  const [iso, setIso] = useState(splitPhone(value).iso);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const s = splitPhone(value);
  // follow an external reset (opening another record) but keep the user's pick for shared dial codes (US/CA)
  const shown = value && countryOf(s.iso).dial !== countryOf(iso).dial ? s.iso : iso;
  const country = countryOf(shown);
  const list = COUNTRIES.filter(c => `${c.name} ${c.iso} ${c.dial}`.toLowerCase().includes(q.trim().toLowerCase().replace('+', '')));

  return (
    <Field label={label} required={required} hint={hint}>
      <View style={{ flexDirection: 'row' }}>
        <TouchableOpacity
          disabled={!editable}
          onPress={() => setOpen(true)}
          style={[
            S.input,
            // rounded on the left only; the shared edge with the number box is a single line
            { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 2, borderRightColor: C.black },
          ]}
        >
          <Flag iso={country.iso} />
          <Text style={{ fontFamily: FONT.bold, fontSize: 14, color: C.black }}>+{country.dial}</Text>
          <ChevronDown size={14} color={C.black} />
        </TouchableOpacity>
        <TextInput
          editable={editable}
          keyboardType="phone-pad"
          maxLength={shown === 'IN' ? 10 : 12}
          value={s.national}
          placeholder={shown === 'IN' ? '98765 43210' : 'Phone number'}
          placeholderTextColor="#9CA3AF"
          onChangeText={v => onChange(joinPhone(shown, v))}
          style={[S.input, { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeftWidth: 0 }]}
        />
      </View>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
          <View style={[S.rowBetween, { padding: 16, borderBottomWidth: 2, borderBottomColor: C.black }]}>
            <Text style={S.h2}>Select country</Text>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}>
              <X size={22} color={C.black} />
            </TouchableOpacity>
          </View>
          <View style={{ padding: 16, paddingBottom: 0 }}>
            <SearchBox value={q} onChange={setQ} placeholder="Search country or code…" />
          </View>
          <FlatList
            data={list}
            keyExtractor={c => c.iso}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: c }) => (
              <TouchableOpacity
                onPress={() => {
                  setIso(c.iso);
                  onChange(joinPhone(c.iso, s.national));
                  setOpen(false);
                  setQ('');
                }}
                style={[S.rowBetween, { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: c.iso === shown ? '#EFF6FF' : C.white }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Flag iso={c.iso} />
                  <Text style={[S.body, { flex: 1 }]} numberOfLines={1}>{c.name}</Text>
                </View>
                <Text style={S.label}>+{c.dial}</Text>
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </Field>
  );
}
