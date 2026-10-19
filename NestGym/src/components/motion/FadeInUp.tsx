import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';
import { useReduceMotion } from './useReduceMotion';

interface Props {
  children: React.ReactNode;
  /** Entrance delay in ms — use index * 60 to stagger lists. */
  delay?: number;
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

/** Fades + slides its children up on mount (native driver). Ported from NestLeads. */
export default function FadeInUp({
  children,
  delay = 0,
  distance = 18,
  duration = 700,
  style,
}: Props) {
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reduce, delay, duration, progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
