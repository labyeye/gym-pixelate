import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleProp, Text, TextStyle } from 'react-native';
import { useReduceMotion } from './useReduceMotion';

// "₹1,23,456" / "12" / "4.5 h" -> prefix, number, suffix. Anything else is left alone.
const SPLIT = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(\D*)$/;

function Counting({
  prefix,
  num,
  suffix,
  decimals,
  grouped,
  style,
}: {
  prefix: string;
  num: number;
  suffix: string;
  decimals: number;
  grouped: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const reduce = useReduceMotion();
  const anim = useRef(new Animated.Value(reduce ? num : 0)).current;
  const [v, setV] = useState(reduce ? num : 0);
  useEffect(() => {
    if (reduce) {
      setV(num);
      return;
    }
    const id = anim.addListener(({ value }) => setV(value));
    Animated.timing(anim, { toValue: num, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => anim.removeListener(id);
  }, [num, reduce, anim]);
  const shown = grouped
    ? v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : v.toFixed(decimals);
  return (
    <Text style={style} numberOfLines={1} adjustsFontSizeToFit>
      {prefix}
      {shown}
      {suffix}
    </Text>
  );
}

/**
 * Counts up numeric card values (12, "₹4,500", "3 days"). Non-numeric content renders unchanged,
 * so it is safe to wrap any StatCard value.
 */
export default function AnimatedValue({ value, style }: { value: React.ReactNode; style?: StyleProp<TextStyle> }) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return <Counting prefix="" num={value} suffix="" decimals={Number.isInteger(value) ? 0 : 1} grouped style={style} />;
  }
  if (typeof value === 'string') {
    const m = SPLIT.exec(value.trim());
    if (m) {
      const n = Number(m[2].replace(/,/g, ''));
      if (Number.isFinite(n)) {
        const dot = m[2].split('.')[1];
        return <Counting prefix={m[1]} num={n} suffix={m[3]} decimals={dot ? dot.length : 0} grouped={m[2].includes(',')} style={style} />;
      }
    }
  }
  return (
    <Text style={style} numberOfLines={1} adjustsFontSizeToFit>
      {value}
    </Text>
  );
}
