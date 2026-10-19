import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

/** Springs its child up and slightly larger when the tab becomes focused. Ported from NestLeads. */
export default function TabBounce({
  focused,
  children,
}: {
  focused: boolean;
  children: React.ReactNode;
}) {
  const v = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(v, {
      toValue: focused ? 1 : 0,
      friction: 6,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [focused, v]);

  return (
    <Animated.View
      style={{
        transform: [
          {
            translateY: v.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -3],
            }),
          },
          {
            scale: v.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.15],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
