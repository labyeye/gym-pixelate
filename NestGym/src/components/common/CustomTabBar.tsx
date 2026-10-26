import React from 'react';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { StyleSheet, View, Text, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BadgeCheck, LayoutDashboard, Menu, Receipt, Users, LucideIcon } from 'lucide-react-native';
import { C } from '../../theme';
import TabBounce from '../motion/TabBounce';

const TAB_ICONS: Record<string, LucideIcon> = {
  Dashboard: LayoutDashboard,
  Members: Users,
  Memberships: BadgeCheck,
  Invoices: Receipt,
  More: Menu,
};

const BAR_ROW = 60;
const FAB = 64;
const NOTCH_W = 60;
const NOTCH_DEPTH = 40;

// Same bar as NestHR: Memberships raised in the middle in a curved notch
// (only when all 5 tabs are present, i.e. for the gym owner).
export default function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = React.useState(0);
  const height = BAR_ROW + insets.bottom;
  const centerIndex = Math.floor(state.routes.length / 2);
  const hasCenter =
    state.routes.length === 5 &&
    state.routes[centerIndex].name === 'Memberships';
  const cx = width / 2;
  const path = hasCenter
    ? `M-2,0 L${cx - NOTCH_W},0 C${cx - NOTCH_W + 22},0 ${
        cx - 36
      },${NOTCH_DEPTH} ${cx},${NOTCH_DEPTH} C${cx + 36},${NOTCH_DEPTH} ${
        cx + NOTCH_W - 22
      },0 ${cx + NOTCH_W},0 L${width + 2},0 L${width + 2},${height + 2} L-2,${
        height + 2
      } Z`
    : `M-2,0 L${width + 2},0 L${width + 2},${height + 2} L-2,${height + 2} Z`;

  return (
    <View
      style={[styles.barWrap, { height }]}
      onLayout={(e: LayoutChangeEvent) =>
        setWidth(Math.floor(e.nativeEvent.layout.width))
      }
    >
      {width > 0 && (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Path
            d={path}
            fill={C.white}
            stroke={C.black}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        </Svg>
      )}
      <View style={[styles.barRow, { paddingBottom: insets.bottom }]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const raised = hasCenter && index === centerIndex;
          const color = focused ? C.primary : '#9CA3AF';
          const Icon = TAB_ICONS[route.name] || LayoutDashboard;
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options.title ?? route.name);
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name as never);
            }
          };
          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              onPress={onPress}
              activeOpacity={0.8}
              style={styles.tabItem}
            >
              {raised ? (
                <>
                  <View style={styles.fab}>
                    <Icon size={28} color={C.white} />
                  </View>
                  <View style={styles.iconWrap} />
                </>
              ) : (
                <TabBounce focused={focused}>
                  <View
                    style={[styles.iconWrap, focused && styles.iconWrapActive]}
                  >
                    <Icon size={20} color={color} />
                  </View>
                </TabBounce>
              )}
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[
                  styles.tabLabel,
                  raised && styles.tabLabelRaised,
                  { color },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  barWrap: { backgroundColor: 'transparent' },
  barRow: { flexDirection: 'row', flex: 1, paddingTop: 4 },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute',
    top: -(FAB / 2) - 2,
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    borderWidth: 2,
    borderColor: C.black,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    maxWidth: '100%',
  },
  tabLabelRaised: { marginTop: 5 },
  iconWrap: {
    width: 32,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {},
});
