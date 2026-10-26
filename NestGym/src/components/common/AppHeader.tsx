import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Menu, Search, Bell, Hand, Coins } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { fmtCredits, useCreditBalance } from '../../hooks/useCreditBalance';
import { C } from '../../theme';

interface Props {
  name?: string;
  avatar?: string;
  title: string;
  unread?: number;
  onMenu?: () => void;
  onSearch?: () => void;
  onBell?: () => void;
  onAvatar?: () => void;
}

/** Shared top bar (same as NestLeads): menu · search · bell(dot) · avatar, then greeting + page title. */
export default function AppHeader({
  name,
  avatar,
  title,
  unread = 0,
  onMenu,
  onSearch,
  onBell,
  onAvatar,
}: Props) {
  const h = new Date().getHours();
  const greeting =
    h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
  const first = (name || 'User').split(' ')[0];
  const navigation = useNavigation<any>();
  const { credits } = useCreditBalance();
  return (
    <View style={s.wrap}>
      <View style={s.row}>
        <TouchableOpacity onPress={onMenu} hitSlop={10}>
          <Menu size={26} color={C.black} />
        </TouchableOpacity>
        <View style={s.right}>
          <TouchableOpacity onPress={onSearch} hitSlop={10}>
            <Search size={24} color={C.black} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onBell} hitSlop={10}>
            <Bell size={24} color={C.black} />
            {unread > 0 && <View style={s.dot} />}
          </TouchableOpacity>
          {credits?.metered && (
            <TouchableOpacity
              onPress={() => navigation.navigate('Credits')}
              activeOpacity={0.8}
              style={[
                s.pill,
                credits.zero ? s.pillZero : credits.low ? s.pillLow : null,
              ]}
            >
              <Coins size={13} color={C.white} />
              <Text style={s.pillText}>{fmtCredits(credits.total)}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onAvatar} activeOpacity={0.8}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, s.avatarFb]}>
                <Text style={s.avatarText}>
                  {(name || 'U')[0].toUpperCase()}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
      <Text style={s.greet}>
        {greeting}, {first}{' '}
        <Hand size={14} color="#475569" style={{ marginLeft: 4 }} />
      </Text>
      <Text style={s.title}>{title}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 0,
    backgroundColor: C.white,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  dot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#2563eb',
    borderWidth: 1.5,
    borderColor: C.white,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#00A878',
    borderWidth: 2,
    borderColor: C.black,
  },
  pillLow: { backgroundColor: C.secondary },
  pillZero: { backgroundColor: C.danger },
  pillText: { color: C.white, fontSize: 12, fontWeight: '800' },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  avatarFb: {
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: C.white, fontSize: 16, fontWeight: '700' },
  greet: { marginTop: 14, fontSize: 13, color: '#475569', fontWeight: '500' },
  title: { fontSize: 28, fontWeight: '700', color: C.black, marginTop: 2 },
});
