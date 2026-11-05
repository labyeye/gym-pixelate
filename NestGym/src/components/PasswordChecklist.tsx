import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { PASSWORD_RULES } from '../utils/passwordRules';

// One row: the circle springs into a green tick the moment its rule is met.
function Row({ label, ok }: { label: string; ok: boolean }) {
  const a = useRef(new Animated.Value(ok ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(a, {
      toValue: ok ? 1 : 0,
      friction: 5,
      tension: 160,
      useNativeDriver: false,
    }).start();
  }, [ok, a]);
  const bg = a.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FFFFFF', '#00C48C'],
  });
  const border = a.interpolate({
    inputRange: [0, 1],
    outputRange: ['#9CA3AF', '#00C48C'],
  });
  const scale = a.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  return (
    <View style={s.row}>
      <Animated.View
        style={[
          s.dot,
          { backgroundColor: bg, borderColor: border, transform: [{ scale }] },
        ]}
      >
        <Animated.Text
          style={[s.tick, { opacity: a, transform: [{ scale: a }] }]}
        >
          ✓
        </Animated.Text>
      </Animated.View>
      <Text style={[s.label, ok && s.labelOk]}>{label}</Text>
    </View>
  );
}

/** Live checklist under a "new password" field. */
export default function PasswordChecklist({ password }: { password: string }) {
  const done = PASSWORD_RULES.filter(r => r.test(password)).length;
  const pct = password ? done / PASSWORD_RULES.length : 0;
  const w = useRef(new Animated.Value(pct)).current;
  useEffect(() => {
    Animated.timing(w, {
      toValue: pct,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [pct, w]);
  const color = w.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['#EF4444', '#F59E0B', '#00C48C'],
  });
  return (
    <View style={s.box}>
      <View style={s.track}>
        <Animated.View
          style={[
            s.fill,
            {
              backgroundColor: color,
              width: w.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
      {PASSWORD_RULES.map(r => (
        <Row key={r.id} label={r.label} ok={!!password && r.test(password)} />
      ))}
      <Text style={s.hint}>
        Easy patterns like 1234 are on every hacker's list. You also can't reuse
        any of your last 5 passwords.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
    marginTop: -6,
    marginBottom: 16,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: 10,
  },
  fill: { height: '100%', borderRadius: 3 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: { color: '#fff', fontSize: 11, fontWeight: '400', lineHeight: 13 },
  label: { flex: 1, fontSize: 12, color: '#6B7280', fontWeight: '400' },
  labelOk: { color: '#15803D' },
  hint: { fontSize: 11, color: '#6B7280', marginTop: 8, lineHeight: 15 },
});
