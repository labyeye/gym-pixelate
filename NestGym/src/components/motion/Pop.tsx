import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';
import { useReduceMotion } from './useReduceMotion';

/** Springs in from small + slightly rotated (the web `nb-pop`): icon chips, pills, badges. */
export default function Pop({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return;
    }
    Animated.timing(v, {
      toValue: 1,
      duration: 520,
      delay,
      easing: Easing.out(Easing.back(2)),
      useNativeDriver: true,
    }).start();
  }, [reduce, delay, v]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
          transform: [
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
            { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '0deg'] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
