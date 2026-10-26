import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { C, FONT } from '../../theme';
import FadeInUp from '../motion/FadeInUp';
import AnimatedBarChart from './AnimatedBarChart';

export interface Point {
  /** yyyy-mm-dd for daily points, "Oct 26" style label for monthly points */
  key: string;
  value: number;
}

const RANGES = [
  { m: 1, label: '1M' },
  { m: 3, label: '3M' },
  { m: 6, label: '6M' },
];

/**
 * Dashboard graph card with 1M / 3M / 6M buttons top right. Default is the last 7 days (daily bars);
 * 1M = the last 30 days (daily), 3M / 6M = monthly bars. Tap the active button again to go back to 7 days.
 */
export default function RangeChart({
  title,
  color,
  daily,
  monthly,
  format = (n: number) => String(n),
  delay = 0,
}: {
  title: string;
  color: string;
  /** oldest first, 30 entries */
  daily: Point[];
  /** oldest first, 12 entries */
  monthly: Point[];
  format?: (n: number) => string;
  delay?: number;
}) {
  const [range, setRange] = useState<number | null>(null);
  const weekday = (k: string) => new Date(k).toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2);
  let points: { label: string; value: number }[];
  let caption: string;
  if (range === null) {
    points = daily.slice(-7).map(p => ({ label: weekday(p.key), value: p.value }));
    caption = 'last 7 days';
  } else if (range === 1) {
    points = daily.map((p, i) => ({ label: i % 5 === daily.length % 5 ? String(Number(p.key.slice(8))) : '', value: p.value }));
    caption = 'last 30 days';
  } else {
    points = monthly.slice(-range).map(p => ({ label: p.key.split(' ')[0], value: p.value }));
    caption = `last ${range} months`;
  }
  const total = points.reduce((s, p) => s + p.value, 0);
  return (
    <FadeInUp delay={delay} style={s.card}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          <Text style={s.sub}>{format(Math.round(total))} · {caption}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {RANGES.map(r => (
            <TouchableOpacity key={r.m} onPress={() => setRange(range === r.m ? null : r.m)} style={[s.pill, range === r.m && { backgroundColor: C.primary }]} accessibilityRole="button">
              <Text style={[s.pillText, range === r.m && { color: C.white }]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <AnimatedBarChart series={[{ key: 'v', label: title, color }]} data={points.map(p => ({ label: p.label, values: { v: p.value } }))} format={format} />
    </FadeInUp>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.white, borderWidth: 2, borderRadius: 8, borderRightWidth: 5, borderBottomWidth: 5, borderRightColor: '#0A0A0A', borderBottomColor: '#0A0A0A', borderColor: C.black, padding: 12, marginTop: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  title: { fontFamily: FONT.bold, fontSize: 13, color: C.black, textTransform: 'uppercase', letterSpacing: 0.4 },
  sub: { fontFamily: FONT.medium, fontSize: 11, color: C.black, marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 2, borderColor: C.black, backgroundColor: C.white },
  pillText: { fontFamily: FONT.bold, fontSize: 11, color: C.black },
});
