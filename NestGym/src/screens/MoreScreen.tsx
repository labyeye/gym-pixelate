import React, { useState } from 'react';
import { Alert, Dimensions, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LogOut, Search, Settings, X } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { navGroupsForRole } from '../navigation/navConfig';
import { C, FONT } from '../theme';
import { Screen } from '../components/ui';

const DESC: Record<string, string> = {
  Members: 'Profiles, plans & dues',
  Plans: 'Fees & membership plans',
  Lockers: 'Assign & track lockers',
  Classes: 'Group class schedule',
  PersonalTraining: 'PT packages & sessions',
  WorkoutDiet: 'Workout & diet plans',
  Measurements: 'Body progress tracking',
  Trainers: 'Trainer team & clients',
  Invoices: 'Bills, payments & refunds',
  Pos: 'Sell products at the desk',
  Coupons: 'Offers & discount codes',
  Reports: 'Revenue, dues & renewals',
  Expenses: 'Track gym spending',
  Staff: 'Staff, salary & payroll',
  Equipment: 'Machines & service due',
  Announcements: 'Notices for members',
  Subscription: 'Your NestGym plan',
  Credits: 'WhatsApp balance & usage',
  Security: 'Password, 2FA & devices',
  Settings: 'Gym & app configuration',
};
const TILE_W = (Dimensions.get('window').width - 32 - 12) / 2;
const COLORS = [C.primary, C.secondary, '#00C48C', '#A855F7', '#14B8A6', '#000000'];

export default function MoreScreen() {
  const nav = useNavigation<any>();
  const { user, tenant, modules, logout } = useAuth();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const sections = navGroupsForRole(user!.role, modules)
    .filter(g => g.label !== 'Overview')
    .map(g => ({ ...g, items: g.items.filter(i => !q || i.title.toLowerCase().includes(q) || (DESC[i.route] || '').toLowerCase().includes(q)) }))
    .filter(g => g.items.length);

  const confirmLogout = () =>
    Alert.alert('Logout', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => logout() },
    ]);

  return (
    <Screen title="More">
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.avatar}>
            {user?.avatar ? <Image source={{ uri: user.avatar }} style={{ width: '100%', height: '100%' }} /> : <Text style={styles.avatarText}>{(user?.name || 'U')[0].toUpperCase()}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{user?.name || 'User'}</Text>
            <Text style={styles.email} numberOfLines={1}>{user?.email || tenant?.name || 'NestGym'}</Text>
            <View style={styles.rolePill}>
              <Text style={styles.roleText}>{(user?.role || '').replace(/_/g, ' ').toUpperCase()}</Text>
            </View>
          </View>
        </View>
        <View style={styles.heroBtns}>
          <TouchableOpacity style={[styles.heroBtn, { backgroundColor: '#eff6ff' }]} onPress={() => nav.navigate('Settings')}>
            <Settings size={15} color={C.primary} />
            <Text style={[styles.heroBtnText, { color: C.primary }]}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.heroBtn, { backgroundColor: '#fef2f2' }]} onPress={confirmLogout}>
            <LogOut size={15} color={C.danger} />
            <Text style={[styles.heroBtnText, { color: C.danger }]}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchBox}>
        <Search size={16} color="#000" />
        <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search features..." placeholderTextColor="#64748b" autoCapitalize="none" autoCorrect={false} />
        {!!query && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
            <X size={16} color="#000" />
          </TouchableOpacity>
        )}
      </View>

      {sections.map((g, gi) => {
        const color = COLORS[gi % COLORS.length];
        return (
          <View key={g.label} style={{ marginBottom: 18 }}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{g.label.toUpperCase()}</Text>
              <View style={styles.sectionLine} />
            </View>
            <View style={styles.grid}>
              {g.items.map(it => (
                <TouchableOpacity key={it.route} style={styles.tile} activeOpacity={0.8} onPress={() => nav.navigate(it.route)}>
                  <View style={[styles.tileIcon, { backgroundColor: color + '1A', borderColor: color }]}>
                    <it.icon size={22} color={color} />
                  </View>
                  <Text style={styles.tileLabel} numberOfLines={1}>{it.title}</Text>
                  <Text style={styles.tileSub} numberOfLines={2}>{DESC[it.route] || ''}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      })}

      {sections.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
          <Search size={36} color="#cbd5e1" />
          <Text style={{ fontFamily: FONT.bold, fontSize: 14, color: '#64748b' }}>No features match "{query}"</Text>
        </View>
      )}
      <Text style={styles.version}>NestGym v1.0.0</Text>
    </Screen>
  );
}

const box = {
  borderWidth: 2,
  borderRadius: 8,
  borderRightWidth: 5,
  borderBottomWidth: 5,
  borderRightColor: '#0A0A0A',
  borderBottomColor: '#0A0A0A',
  borderColor: '#000',
} as const;

const styles = StyleSheet.create({
  hero: { ...box, backgroundColor: '#fff', padding: 14, gap: 14, marginBottom: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 64, height: 64, backgroundColor: C.primary, borderWidth: 2, borderRightWidth: 4, borderBottomWidth: 4, borderRightColor: '#0A0A0A', borderBottomColor: '#0A0A0A', borderRadius: 8, borderColor: '#000', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { color: '#fff', fontSize: 26, fontFamily: FONT.bold },
  name: { fontSize: 18, fontFamily: FONT.bold, color: '#000' },
  email: { fontSize: 12, color: '#64748b', fontFamily: FONT.semiBold, marginTop: 2 },
  rolePill: { alignSelf: 'flex-start', marginTop: 8, backgroundColor: '#FFDE00', borderWidth: 2, borderColor: '#000', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  roleText: { fontSize: 10, fontFamily: FONT.bold, color: '#000' },
  heroBtns: { flexDirection: 'row', gap: 10 },
  heroBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderWidth: 2, borderColor: '#000', borderRadius: 8 },
  heroBtnText: { fontSize: 13, fontFamily: FONT.bold },
  searchBox: { ...box, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, backgroundColor: '#fff', marginBottom: 18 },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: '#000', fontFamily: FONT.semiBold },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionTitle: { fontSize: 11, fontFamily: FONT.bold, color: '#000', letterSpacing: 1 },
  sectionLine: { flex: 1, height: 2, backgroundColor: '#000', marginLeft: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { ...box, width: TILE_W, backgroundColor: '#fff', padding: 12, gap: 6, minHeight: 124 },
  tileIcon: { width: 44, height: 44, borderWidth: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  tileLabel: { fontSize: 14, fontFamily: FONT.bold, color: '#000' },
  tileSub: { fontSize: 11, color: '#64748b', fontFamily: FONT.medium, lineHeight: 15 },
  version: { textAlign: 'center', fontSize: 11, color: C.textLight, fontFamily: FONT.medium },
});
