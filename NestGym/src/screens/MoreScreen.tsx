import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronRight } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { navGroupsForRole } from '../navigation/navConfig';
import { C, FONT, S } from '../theme';
import { Screen, brut, RCard } from '../components/ui';

export default function MoreScreen() {
  const nav = useNavigation<any>();
  const { user, tenant, modules } = useAuth();
  const groups = navGroupsForRole(user!.role, modules);
  return (
    <Screen title="More">
      <View style={{ alignItems: 'center', marginBottom: 14 }}>
        <Image source={require('../assets/logo_long.png')} style={{ width: 190, height: 64 }} resizeMode="contain" />
      </View>
      <RCard style={brut({ backgroundColor: C.primary, padding: 14, marginBottom: 16 })}>
        <Text style={{ fontFamily: FONT.bold, fontSize: 18, color: '#fff' }}>{tenant?.name || 'NestGym'}</Text>
        <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: '#DBEAFE' }}>
          {user?.name} · {user?.role.replace(/_/g, ' ')}
        </Text>
      </RCard>
      {groups.map(g => (
        <View key={g.label} style={{ marginBottom: 14 }}>
          <Text style={[S.label, { marginBottom: 8 }]}>{g.label}</Text>
          <View style={brut({ backgroundColor: C.white })}>
            {g.items.map((it, i) => (
              <TouchableOpacity
                key={it.route}
                onPress={() => nav.navigate(it.route)}
                style={[S.rowBetween, { padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: '#E5E7EB' }]}
              >
                <View style={[S.rowCenter, { gap: 12 }]}>
                  <it.icon size={20} color={C.primary} />
                  <Text style={S.body}>{it.title}</Text>
                </View>
                <ChevronRight size={18} color={C.black} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}
