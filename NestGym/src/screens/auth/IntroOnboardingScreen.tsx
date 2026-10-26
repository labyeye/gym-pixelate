import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, FONT } from '../../theme';
const illustration1 = require('../../assets/images/Onboarding/1.png');
const illustration2 = require('../../assets/images/Onboarding/2.png');
const illustration3 = require('../../assets/images/Onboarding/3.png');
const nestgymlogo = require("../../assets/logo_long.png")
const { width } = Dimensions.get('window');
const ONBOARDING_KEY = '@nestgym/onboarding-complete';

const slides = [
  {
    number: '01',
    title: 'Your whole gym, in one place',
    body: 'Manage members, memberships, trainers, classes and billing from one simple workspace.',
    color: '#EAF2FF',
    image: illustration1,
  },
  {
    number: '02',
    title: 'Keep members coming back',
    body: 'Track renewals and dues, send payment links on WhatsApp and keep every member informed.',
    color: '#FFF1E8',
    image: illustration2,
  },
  {
    number: '03',
    title: 'Grow with clear numbers',
    body: 'See revenue, collections and member trends in clear reports, so you can run a stronger gym.',
    color: '#E9F9F3',
    image: illustration3,
  },
];

export default function IntroOnboardingScreen({ navigation }: any) {
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then(value => {
        if (value === 'true') navigation.replace('Login');
      })
      .catch(error => {
        console.warn('Unable to read NestGym onboarding state', error);
      });
  }, [navigation]);

  const finish = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    } catch (error) {
      console.warn('Unable to save NestGym onboarding state', error);
    }
    navigation.replace('Login');
  };

  const next = () => {
    if (current === slides.length - 1) {
      finish();
      return;
    }
    scrollRef.current?.scrollTo({ x: width * (current + 1), animated: true });
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setCurrent(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Image source={nestgymlogo} style={styles.nestlogostyle} />
        <TouchableOpacity onPress={finish} accessibilityRole="button">
          <Text style={styles.skip}>Skip</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.slides}
      >
        {slides.map(slide => (
          <View style={styles.slide} key={slide.number}>
            <View style={[styles.illustration, { backgroundColor: slide.color }]}>
              <Image
                source={slide.image}
                style={styles.illustrationImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.body}>{slide.body}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((slide, index) => (
            <View
              key={slide.number}
              style={[styles.dot, index === current && styles.activeDot]}
            />
          ))}
        </View>
        <TouchableOpacity
          style={styles.button}
          onPress={next}
          accessibilityRole="button"
          accessibilityLabel={current === slides.length - 1 ? 'Get started' : 'Next'}
        >
          <Text style={styles.buttonText}>
            {current === slides.length - 1 ? 'Get started' : 'Next'}
          </Text>
          <Text style={styles.buttonArrow}>→</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.white },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  logo: { fontFamily: FONT.bold, fontSize: 26, color: C.primary },
  logoAccent: { color: C.secondary },
  skip: { fontFamily: FONT.bold, color: C.textMuted, fontSize: 14 },
  slides: { flex: 1 },
  slide: { width, paddingHorizontal: 24, paddingTop: 28 },
  illustration: {
    height: 300,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 36,
    overflow: 'hidden',
  },
  illustrationImage: { width: '100%', height: '100%' },
  slideNumber: {
    position: 'absolute',
    top: 20,
    left: 22,
    fontFamily: FONT.bold,
    color: C.primary,
    fontSize: 16,
  },
  nestlogostyle: {
      width: 138,
      height: 56,
      resizeMode: 'contain',
    },
  illustrationCard: {
    width: '68%',
    height: 145,
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 24,
    justifyContent: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
  },
  illustrationLineLong: {
    width: '75%',
    height: 12,
    borderRadius: 6,
    backgroundColor: C.primary,
  },
  illustrationLineShort: {
    width: '48%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#B9C8DC',
  },
  illustrationRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  illustrationDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.secondary,
  },
  illustrationLineMedium: {
    width: '55%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#B9C8DC',
  },
  title: {
    fontFamily: FONT.bold,
    fontSize: 30,
    lineHeight: 36,
    color: C.black,
    marginBottom: 14,
  },
  body: {
    fontFamily: FONT.medium,
    fontSize: 16,
    lineHeight: 25,
    color: C.textMuted,
  },
  footer: { padding: 24, gap: 24 },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D6DEE8' },
  activeDot: { width: 28, backgroundColor: C.primary },
  button: {
    minHeight: 54,
    borderRadius: 8,
    backgroundColor: C.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  buttonText: { fontFamily: FONT.bold, color: C.white, fontSize: 16 },
  buttonArrow: { color: C.white, fontSize: 22 },
});
