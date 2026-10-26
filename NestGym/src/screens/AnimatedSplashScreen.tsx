import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Users, Dumbbell, IndianRupee } from 'lucide-react-native';

const { height } = Dimensions.get('window');

const ICON_SLIDE = 40;
const ICON_DURATION = 400;
const STAGGER = 280;
const FADE_OUT_DELAY = 1000;
const FADE_OUT_DURATION = 350;
const LOGO_DURATION = 500;
const HOLD_BEFORE_EXIT = 900;

interface Props {
  onDone: () => void;
}

export default function AnimatedSplashScreen({ onDone }: Props) {
  // Each icon: opacity + translateY
  const icon1Opacity = useRef(new Animated.Value(0)).current;
  const icon1Y = useRef(new Animated.Value(ICON_SLIDE)).current;
  const icon2Opacity = useRef(new Animated.Value(0)).current;
  const icon2Y = useRef(new Animated.Value(ICON_SLIDE)).current;
  const icon3Opacity = useRef(new Animated.Value(0)).current;
  const icon3Y = useRef(new Animated.Value(ICON_SLIDE)).current;

  // Icons group fade out
  const iconsGroupOpacity = useRef(new Animated.Value(1)).current;

  // Logo
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoY = useRef(new Animated.Value(ICON_SLIDE)).current;

  useEffect(() => {
    function iconIn(opacity: Animated.Value, y: Animated.Value) {
      return Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: ICON_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(y, {
          toValue: 0,
          duration: ICON_DURATION,
          useNativeDriver: true,
        }),
      ]);
    }

    Animated.sequence([
      // Icons slide in one by one
      Animated.stagger(STAGGER, [
        iconIn(icon1Opacity, icon1Y),
        iconIn(icon2Opacity, icon2Y),
        iconIn(icon3Opacity, icon3Y),
      ]),

      // Hold a moment
      Animated.delay(FADE_OUT_DELAY),

      // All icons fade out together
      Animated.timing(iconsGroupOpacity, {
        toValue: 0,
        duration: FADE_OUT_DURATION,
        useNativeDriver: true,
      }),

    ]).start(() => onDone());
  }, []);

  return (
    <View style={styles.container}>
      {/* Three icons */}
      <Animated.View style={[styles.iconsRow, { opacity: iconsGroupOpacity }]}>
        <Animated.View
          style={[
            styles.iconWrap,
            { opacity: icon1Opacity, transform: [{ translateY: icon1Y }] },
          ]}
        >
          <View style={styles.iconCircle}>
            <Users size={32} color="#ffffff" strokeWidth={2} />
          </View>
          <Text style={styles.iconLabel}>Members</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.iconWrap,
            { opacity: icon2Opacity, transform: [{ translateY: icon2Y }] },
          ]}
        >
          <View style={styles.iconCircle}>
            <Dumbbell size={32} color="#ffffff" strokeWidth={2} />
          </View>
          <Text style={styles.iconLabel}>Trainers</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.iconWrap,
            { opacity: icon3Opacity, transform: [{ translateY: icon3Y }] },
          ]}
        >
          <View style={styles.iconCircle}>
            <IndianRupee size={32} color="#ffffff" strokeWidth={2} />
          </View>
          <Text style={styles.iconLabel}>Billing</Text>
        </Animated.View>
      </Animated.View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconsRow: {
    flexDirection: 'row',
    gap: 28,
    position: 'absolute',
  },
  iconWrap: {
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#024bab',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLabel: {
    color: '#024bab',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  logoWrap: {
    borderRadius: 100,
    alignItems: 'center',
    position: 'absolute',
    gap: 16,
  },
  logoCard: {
    backgroundColor: '#ffffff',
    padding: 20,
  },
  logoImage: {
    width: 160,
    height: 160,
  },
  logoTagline: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
