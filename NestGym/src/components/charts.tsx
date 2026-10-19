import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { C, FONT, S } from '../theme';

type Pt = { label: string; value: number };

/** Brutalist bar chart: black-bordered bars, no chart lib. Scrolls horizontally when there are many points. */
export function BarChart({
  data,
  color = C.primary,
  height = 140,
  fmt = (n: number) => String(n),
}: {
  data: Pt[];
  color?: string;
  height?: number;
  fmt?: (n: number) => string;
}) {
  if (!data.length) return <Text style={S.small}>No data</Text>;
  const max = Math.max(1, ...data.map(d => d.value));
  const peak = data.reduce((a, b) => (b.value > a.value ? b : a));
  return (
    <View>
      <Text style={[S.small, { marginBottom: 6 }]}>Peak: {fmt(peak.value)} ({peak.label})</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: height + 18, gap: 4, borderBottomWidth: 2, borderBottomColor: C.black }}>
          {data.map((d, i) => (
            <View key={i} style={{ alignItems: 'center', width: 18 }}>
              <View style={{ width: 16, height: Math.max(2, (d.value / max) * height), backgroundColor: color, borderWidth: 2, borderColor: C.black }} />
              <Text style={{ fontFamily: FONT.bold, fontSize: 8, color: C.black, height: 14 }}>{d.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/** Horizontal labelled bars (reports). */
export function HBars({
  rows,
  color = C.primary,
  fmt = (n: number) => String(n),
}: {
  rows: Pt[];
  color?: string;
  fmt?: (n: number) => string;
}) {
  if (!rows.length) return <Text style={S.small}>No data</Text>;
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <View style={{ gap: 8 }}>
      {rows.map(r => (
        <View key={r.label}>
          <View style={S.rowBetween}>
            <Text style={[S.body, { fontSize: 12 }]}>{r.label}</Text>
            <Text style={[S.body, { fontSize: 12, fontFamily: FONT.bold }]}>{fmt(r.value)}</Text>
          </View>
          <View style={{ height: 12, borderWidth: 2, borderColor: C.black, backgroundColor: C.white }}>
            <View style={{ height: '100%', width: `${(r.value / max) * 100}%`, backgroundColor: color }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Weight-trend sparkline drawn with plain Views (no svg dependency). */
export function Spark({ points, color = C.primary }: { points: number[]; color?: string }) {
  if (points.length < 2) return <Text style={S.small}>Log 2+ check-ins to see a trend</Text>;
  const min = Math.min(...points);
  const span = Math.max(...points) - min || 1;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 70, gap: 6 }}>
      {points.map((p, i) => (
        <View key={i} style={{ flex: 1, height: 10 + ((p - min) / span) * 58, backgroundColor: color, borderWidth: 2, borderColor: C.black }} />
      ))}
    </View>
  );
}
