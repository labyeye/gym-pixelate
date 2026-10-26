import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { C, FONT } from '../../theme';
import { useReduceMotion } from '../motion/useReduceMotion';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

export interface BarGroup {
  label: string;
  values: Record<string, number>;
}

interface Props {
  data: BarGroup[];
  series: BarSeries[];
  height?: number;
  format?: (n: number) => string;
  legend?: boolean;
  stacked?: boolean;
}

function niceMax(max: number) {
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Brutalist grouped bar chart: bars grow up from the baseline. */
export default function AnimatedBarChart({
  data,
  series,
  height = 190,
  format = n => String(n),
  legend = false,
  stacked = false,
}: Props) {
  const [w, setW] = useState(280);
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const key = data
    .map(d => series.map(s => d.values[s.key] || 0).join('.'))
    .join(',');

  useEffect(() => {
    progress.setValue(reduce ? 1 : 0);
    if (reduce) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [key, reduce, progress]);

  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.floor(e.nativeEvent.layout.width);
    if (next > 0 && next !== w) setW(next);
  };

  const padL = 30;
  const padR = 6;
  const padT = 12;
  const padB = 24;
  const plotW = w - padL - padR;
  const plotH = height - padT - padB;
  const max = Math.max(
    2,
    niceMax(
      Math.max(
        0,
        ...(stacked
          ? data.map(d =>
              series.reduce((a, s) => a + (d.values[s.key] || 0), 0),
            )
          : data.flatMap(d => series.map(s => d.values[s.key] || 0))),
      ),
    ),
  );
  const slot = plotW / Math.max(data.length, 1);
  const barW = stacked
    ? Math.min(26, slot * 0.6)
    : Math.min(18, (slot * 0.8) / series.length);
  const groupW = stacked ? barW : barW * series.length;

  return (
    <View onLayout={onLayout}>
      <Svg width={w} height={height}>
        {[0, 0.5, 1].map(t => {
          const y = padT + plotH * (1 - t);
          return (
            <React.Fragment key={t}>
              <Line
                x1={padL}
                x2={w - padR}
                y1={y}
                y2={y}
                stroke={C.black}
                strokeOpacity={0.15}
                strokeDasharray="3 3"
              />
              <SvgText
                x={padL - 5}
                y={y + 3}
                fontSize={10}
                fontFamily={FONT.bold}
                fill={C.black}
                textAnchor="end"
              >
                {format(Math.round(max * t))}
              </SvgText>
            </React.Fragment>
          );
        })}
        {data.map((d, i) => {
          const gx = padL + slot * i + (slot - groupW) / 2;
          return (
            <React.Fragment key={i}>
              {series.map((s, j) => {
                const full = ((d.values[s.key] || 0) / max) * plotH;
                // Stacked bars put the first series on top.
                const below = stacked
                  ? (series
                      .slice(j + 1)
                      .reduce((a, t) => a + (d.values[t.key] || 0), 0) /
                      max) *
                    plotH
                  : 0;
                const h = progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, full],
                });
                const y = progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [
                    padT + plotH - below,
                    padT + plotH - below - full,
                  ],
                });
                return (
                  <AnimatedRect
                    key={s.key}
                    x={stacked ? gx : gx + j * barW}
                    y={y}
                    width={barW}
                    height={h}
                    rx={5}
                    fill={s.color}
                    stroke={C.black}
                    strokeWidth={full > 0 ? 1.5 : 0}
                  />
                );
              })}
              <SvgText
                x={padL + slot * i + slot / 2}
                y={height - 8}
                fontSize={10}
                fontFamily={FONT.bold}
                fill={C.black}
                textAnchor="middle"
              >
                {d.label}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
      {legend && (
        <View style={styles.legend}>
          {series.map(s => (
            <View key={s.key} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: s.color }]} />
              <Text style={styles.legendText}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderWidth: 1.5, borderColor: C.black },
  legendText: { fontSize: 11, fontFamily: FONT.bold, color: C.black },
});
