import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Check, ChevronDown, Search, X } from 'lucide-react-native';
import { C, FONT, S } from '../theme';
import { titleCase } from '../utils/format';
import { iconFor, plain } from '../utils/fieldIcons';
import FadeInUp from './motion/FadeInUp';
import Pop from './motion/Pop';
import AnimatedValue from './motion/AnimatedValue';
import AnimatedNumber from './motion/AnimatedNumber';
import { useReduceMotion } from './motion/useReduceMotion';

// stagger cards that mount together: the n-th card mounted within the same burst waits n * 55ms
let burstN = 0;
let burstAt = 0;
const burstDelay = () => {
  const now = Date.now();
  if (now - burstAt > 250) burstN = 0;
  burstAt = now;
  return Math.min(burstN++, 10) * 55;
};

/** Rises in on mount; pass the row index to stagger lists, or leave it and mount order staggers them. */
export function Rise({
  index,
  children,
  style,
}: {
  index?: number;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const autoRef = useRef<number | null>(null);
  if (autoRef.current === null) autoRef.current = burstDelay(); // once per mount, not per render
  const auto = autoRef.current;
  return (
    <FadeInUp delay={index === undefined ? auto : Math.min(index, 10) * 55} distance={14} duration={520} style={style}>
      {children}
    </FadeInUp>
  );
}

const SHADOW = '#0A0A0A';
/** The NestHR/NestLeads "brutalist" frame: black border, thick bottom-right edge. */
export const brut = (extra: ViewStyle = {}): ViewStyle => ({
  borderWidth: 2,
  borderRadius: 8,
  borderColor: C.black,
  borderRightWidth: 5,
  borderBottomWidth: 5,
  borderRightColor: SHADOW,
  borderBottomColor: SHADOW,
  ...extra,
});

/* ------------------------------------------------------------------ toast */

type ToastMsg = { id: number; kind: 'ok' | 'err'; title: string; text?: string };
const toastSubs = new Set<(t: ToastMsg) => void>();
const emitToast = (t: ToastMsg) => toastSubs.forEach(f => f(t));
let toastId = 0;
export const notify = {
  success: (title: string, text?: string) =>
    emitToast({ id: ++toastId, kind: 'ok', title, text }),
  error: (title: string, text?: string) =>
    emitToast({ id: ++toastId, kind: 'err', title, text }),
};

export function ToastHost() {
  const [t, setT] = useState<ToastMsg | null>(null);
  const op = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    toastSubs.add(setT);
    return () => {
      toastSubs.delete(setT);
    };
  }, []);
  useEffect(() => {
    if (!t) return;
    op.setValue(0);
    Animated.sequence([
      Animated.timing(op, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(t.kind === 'err' ? 3800 : 2200),
      Animated.timing(op, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => finished && setT(null));
  }, [t, op]);
  if (!t) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        brut({ backgroundColor: t.kind === 'ok' ? C.success : C.danger }),
        { opacity: op },
      ]}
    >
      <Text style={styles.toastTitle}>{t.title}</Text>
      {!!t.text && <Text style={styles.toastText}>{t.text}</Text>}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ screen */

interface ScreenProps {
  title: string;
  children: React.ReactNode;
  back?: boolean;
  right?: React.ReactNode;
  /** false for screens that manage their own FlatList/scroll */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: React.ReactNode;
}

export function Screen({
  title,
  children,
  back,
  right,
  scroll = true,
  refreshing,
  onRefresh,
  footer,
}: ScreenProps) {
  const nav = useNavigation<any>();
  const goBack = () => (nav.canGoBack() ? nav.goBack() : nav.navigate('Dashboard'));
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={goBack} hitSlop={10} style={{ marginRight: 10 }} accessibilityLabel="Back">
            <ArrowLeft size={24} color={C.black} />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {!!right && (
          <BareCtx.Provider value>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>{right}</View>
          </BareCtx.Provider>
        )}
      </View>
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={!!refreshing}
                onRefresh={onRefresh}
                tintColor={C.primary}
              />
            ) : undefined
          }
        >
          <FadeInUp distance={10} duration={380}>
            {children}
          </FadeInUp>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

/** A bordered card that rises in on mount - use for rows/cards in lists. */
export function RCard({ style, children, ...rest }: { style?: any; children?: React.ReactNode } & Record<string, any>) {
  const delayRef = useRef<number | null>(null);
  if (delayRef.current === null) delayRef.current = burstDelay();
  const delay = delayRef.current;
  return (
    <FadeInUp delay={delay} distance={14} duration={520}>
      <View style={style} {...rest}>
        {children}
      </View>
    </FadeInUp>
  );
}

export const Loader = () => (
  <View style={{ padding: 40, alignItems: 'center' }}>
    <ActivityIndicator size="large" color={C.primary} />
  </View>
);

export const Empty = ({ text = 'Nothing here yet' }: { text?: string }) => (
  <View style={S.emptyState}>
    <Text style={S.emptyText}>{text}</Text>
  </View>
);

export function Panel({
  title,
  right,
  children,
  style,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <FadeInUp distance={12} duration={480}>
    <View style={[S.card, style]}>
      {(title || right) && (
        <View style={[S.rowBetween, { marginBottom: 10 }]}>
          <Text style={S.h3}>{title}</Text>
          {right}
        </View>
      )}
      {children}
    </View>
    </FadeInUp>
  );
}

/* ------------------------------------------------------------------ buttons / pills */

/** Inside a screen header, buttons render as bare icons (no background / border). */
const BareCtx = React.createContext(false);

/** Icon-only action: no background, no border. */
export function IconBtn({ icon: Icon, onPress, color = C.black, size = 20, label }: { icon: any; onPress?: () => void; color?: string; size?: number; label?: string }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={8} style={{ padding: 6 }} accessibilityRole="button" accessibilityLabel={label}>
      <Icon size={size} color={color} />
    </TouchableOpacity>
  );
}

export function Btn({
  label,
  onPress,
  color = C.primary,
  light,
  danger,
  busy,
  disabled,
  icon,
  small,
  style,
}: {
  label: string;
  onPress?: () => void;
  color?: string;
  light?: boolean;
  danger?: boolean;
  busy?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  small?: boolean;
  style?: ViewStyle;
}) {
  const inHeader = React.useContext(BareCtx);
  const bg = light ? C.white : danger ? C.danger : color;
  const fg = light ? C.black : C.white;
  const scale = useRef(new Animated.Value(1)).current;
  const reduce = useReduceMotion();
  const press = (to: number) =>
    !reduce && Animated.spring(scale, { toValue: to, friction: 5, tension: 220, useNativeDriver: true }).start();
  // small / header buttons are bare: no background, no border (icon only in the header)
  if (small || inHeader) {
    const tone = danger ? C.danger : light ? C.black : color;
    return (
      <TouchableOpacity disabled={disabled || busy} onPress={onPress} hitSlop={8} activeOpacity={0.6} style={{ padding: inHeader ? 6 : 4, opacity: disabled ? 0.45 : 1, flexDirection: 'row', alignItems: 'center', gap: 5 }} accessibilityRole="button" accessibilityLabel={label}>
        {busy ? <ActivityIndicator size="small" color={tone} /> : icon ? React.cloneElement(icon as React.ReactElement<any>, { color: tone, size: inHeader ? 22 : 15 }) : null}
        {(!inHeader || !icon) && <Text style={{ fontFamily: FONT.bold, fontSize: 12, color: tone, textTransform: 'uppercase' }}>{label}</Text>}
      </TouchableOpacity>
    );
  }
  return (
    <Pressable
      disabled={disabled || busy}
      onPress={onPress}
      onPressIn={() => press(0.95)}
      onPressOut={() => press(1)}
    >
    <Animated.View
      style={[
        brut({
          backgroundColor: bg,
          paddingHorizontal: small ? 10 : 16,
          paddingVertical: small ? 6 : 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          opacity: disabled ? 0.45 : 1,
        }),
        { transform: [{ scale }] },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon}
      <Text
        style={{
          fontFamily: FONT.bold,
          fontSize: small ? 11 : 13,
          color: fg,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </Animated.View>
    </Pressable>
  );
}

const PILL: Record<string, [string, string]> = {
  green: ['#DCFCE7', '#15803D'],
  orange: ['#FFEDD5', '#C2410C'],
  blue: ['#DBEAFE', '#1D4ED8'],
  teal: ['#CCFBF1', '#0F766E'],
  purple: ['#F3E8FF', '#7E22CE'],
  red: ['#FEE2E2', '#B91C1C'],
  white: ['#FFFFFF', '#000000'],
};
const PILL_OF: Record<string, string> = {
  active: 'green', paid: 'green', completed: 'green', converted: 'green', available: 'green', working: 'green', attended: 'green', booked: 'green', present: 'green',
  partial: 'orange', pending: 'orange', negotiating: 'orange', waitlisted: 'orange', under_maintenance: 'orange', maintenance: 'orange',
  upcoming: 'blue', scheduled: 'blue', contacted: 'blue', assigned: 'blue',
  frozen: 'teal', trial_booked: 'teal', trial_done: 'teal',
  new: 'purple', upgraded: 'purple',
  expired: 'red', cancelled: 'red', lost: 'red', refunded: 'red', missed: 'red', no_show: 'red', out_of_order: 'red', blacklisted: 'red', absent: 'red',
};
export function Pill({ value, tone }: { value?: string; tone?: string }) {
  if (!value) return null;
  const [bg, fg] = PILL[tone || PILL_OF[value] || 'white'];
  return (
    <Pop style={{ alignSelf: 'flex-start' }}>
    <View
      style={{
        backgroundColor: bg,
        borderWidth: 2,
        borderColor: C.black,
        borderRadius: 8,
        paddingHorizontal: 7,
        paddingVertical: 1,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          fontFamily: FONT.bold,
          fontSize: 10,
          color: fg,
          textTransform: 'uppercase',
        }}
      >
        {value.replace(/_/g, ' ')}
      </Text>
    </View>
    </Pop>
  );
}

/* ------------------------------------------------------------------ stats */

/** Summary card (older call sites). Same look as the Dashboard cards: see MiniStat. */
export function StatCard({
  label,
  value,
  sub,
  color = C.primary,
  icon,
  onPress,
  index = 0,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  color?: string;
  icon?: React.ReactNode;
  onPress?: () => void;
  index?: number;
}) {
  const v = typeof value === 'number' || typeof value === 'string' ? value : '';
  return <MiniStat label={label} value={v} sub={sub} color={color} icon={icon} onPress={onPress} index={index} />;
}

// each card in a grid gets its own index, so they rise one after another
export const StatGrid = ({ children }: { children: React.ReactNode }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
    {React.Children.toArray(children).map((c, i) =>
      React.isValidElement(c) && (c.props as any).index === undefined ? React.cloneElement(c as any, { index: i }) : c,
    )}
  </View>
);

/** Compact KPI card, same look as the dashboard summary cards. Up to four share a row, more wrap. */
export function MiniStat({ label, value, sub, icon, color = C.primary, onPress, index = 0 }: { label: string; value: number | string; sub?: string; icon?: any; color?: string; onPress?: () => void; index?: number }) {
  const Icon = icon;
  const glyph = !Icon ? null : React.isValidElement(Icon) ? React.cloneElement(Icon as React.ReactElement<any>, { size: 14, color }) : <Icon size={14} color={color} />;
  return (
    <FadeInUp delay={Math.min(index, 10) * 70} style={{ flexGrow: 1, flexBasis: '22%', minWidth: 0 }}>
      <TouchableOpacity
        activeOpacity={onPress ? 0.8 : 1}
        onPress={onPress}
        style={brut({ flex: 1, backgroundColor: C.white, padding: 10, alignItems: 'center', gap: 8 })}
      >
        <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderRadius: 14, borderColor: color, backgroundColor: color + '1A' }}>
          {glyph || <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />}
        </View>
        <View style={{ alignItems: 'center', minWidth: 0, width: '100%' }}>
          <Text style={{ fontFamily: FONT.bold, fontSize: 8, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'center' }} numberOfLines={2}>{label}</Text>
          {typeof value === 'number' ? (
            <AnimatedNumber style={{ fontFamily: FONT.bold, fontSize: 19, color: C.black }} value={value} />
          ) : (
            <Text style={{ fontFamily: FONT.bold, fontSize: 15, color: C.black, marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
          )}
          {!!sub && <Text style={{ fontFamily: FONT.medium, fontSize: 9, color: C.textMuted, marginTop: 1, textAlign: 'center' }} numberOfLines={1}>{sub}</Text>}
        </View>
      </TouchableOpacity>
    </FadeInUp>
  );
}
export const MiniStatRow = ({ children }: { children: React.ReactNode }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
    {React.Children.toArray(children).map((c, i) => (React.isValidElement(c) ? React.cloneElement(c as any, { index: i }) : c))}
  </View>
);

/** Two form fields side by side. */
export const Pair = ({ children }: { children: React.ReactNode }) => (
  <View style={{ flexDirection: 'row', gap: 10 }}>
    {React.Children.toArray(children).map((c, i) => (
      <View key={i} style={{ flex: 1, minWidth: 0 }}>{c}</View>
    ))}
  </View>
);

/* ------------------------------------------------------------------ form fields */

export function Field({
  label,
  required,
  hint,
  children,
}: {
  label?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      {!!label && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          {React.createElement(iconFor(label), { size: 13, color: C.primary })}
          <Text style={[S.label, { fontSize: 11 }]}>
            {label}
            {required && <Text style={{ color: C.danger }}> *</Text>}
          </Text>
        </View>
      )}
      {children}
      {!!hint && <Text style={[S.small, { marginTop: 4, color: '#6B7280' }]}>{hint}</Text>}
    </View>
  );
}

export function Input({
  label,
  required,
  hint,
  multiline,
  ...rest
}: TextInputProps & { label?: string; required?: boolean; hint?: string }) {
  return (
    <Field label={label} required={required} hint={hint}>
      <TextInput
        placeholderTextColor="#9CA3AF"
        placeholder={label ? `Enter ${plain(label)}` : undefined}
        multiline={multiline}
        {...rest}
        style={[S.input, multiline && { minHeight: 70, textAlignVertical: 'top' }, rest.style]}
      />
    </Field>
  );
}

type Opt = string | { value: string; label: string };
const optVal = (o: Opt) => (typeof o === 'string' ? o : o.value);
const optLabel = (o: Opt) => (typeof o === 'string' ? titleCase(o) : o.label);

export function Select({
  label,
  required,
  hint,
  options,
  value,
  onChange,
  placeholder,
  allowEmpty,
}: {
  label?: string;
  required?: boolean;
  hint?: string;
  options: Opt[];
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const cur = options.find(o => optVal(o) === value);
  return (
    <Field label={label} required={required} hint={hint}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setOpen(true)}
        style={[S.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
      >
        <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: cur ? C.black : '#9CA3AF', flex: 1 }} numberOfLines={1}>
          {cur ? optLabel(cur) : placeholder ?? (label ? `Select ${plain(label)}` : 'Select…')}
        </Text>
        <ChevronDown size={18} color={C.black} />
      </TouchableOpacity>
      <Sheet visible={open} title={label || 'Select'} onClose={() => setOpen(false)}>
        {allowEmpty && (
          <OptionRow
            label="— None —"
            selected={!value}
            onPress={() => {
              onChange('');
              setOpen(false);
            }}
          />
        )}
        {options.map(o => (
          <OptionRow
            key={optVal(o)}
            label={optLabel(o)}
            selected={optVal(o) === value}
            onPress={() => {
              onChange(optVal(o));
              setOpen(false);
            }}
          />
        ))}
      </Sheet>
    </Field>
  );
}

const OptionRow = ({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={[
      S.rowBetween,
      {
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        backgroundColor: selected ? '#EFF6FF' : C.white,
      },
    ]}
  >
    <Text style={[S.body, selected && { fontFamily: FONT.bold }]}>{label}</Text>
    {selected && <Check size={18} color={C.primary} />}
  </TouchableOpacity>
);

export function CheckField({
  label,
  hint,
  value,
  onChange,
}: {
  label?: string;
  hint?: string;
  value?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Field label={label}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => onChange(!value)}
        style={[S.input, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderWidth: 2,
            borderColor: C.black,
            borderRadius: 4,
            backgroundColor: value ? C.primary : C.white,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {value && <Check size={14} color="#fff" />}
        </View>
        <Text style={[S.body, { flex: 1 }]}>{hint || 'Yes'}</Text>
      </TouchableOpacity>
    </Field>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={[S.input, { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2, marginBottom: 12 }]}>
      <Search size={16} color={C.black} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        autoCapitalize="none"
        style={{ flex: 1, fontFamily: FONT.medium, fontSize: 14, color: C.black, paddingVertical: 8 }}
      />
      {!!value && (
        <TouchableOpacity onPress={() => onChange('')} hitSlop={8}>
          <X size={16} color={C.black} />
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ tabs */

export function Tabs({
  tabs,
  value,
  onChange,
  fill,
}: {
  tabs: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (id: string) => void;
  /** spread the tabs over the full width instead of scrolling */
  fill?: boolean;
}) {
  if (fill) {
    return (
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
        {tabs.map(t => {
          const on = t.id === value;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => onChange(t.id)}
              style={brut({
                flex: 1,
                backgroundColor: on ? C.secondary : C.white,
                paddingVertical: 8,
                alignItems: 'center',
                borderRightWidth: on ? 2 : 4,
                borderBottomWidth: on ? 2 : 4,
              })}
            >
              <Text numberOfLines={1} style={{ fontFamily: FONT.bold, fontSize: 10, textTransform: 'uppercase', color: on ? C.white : C.black }}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 14 }} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
      {tabs.map(t => {
        const on = t.id === value;
        return (
          <TouchableOpacity
            key={t.id}
            onPress={() => onChange(t.id)}
            style={brut({
              backgroundColor: on ? C.primary : C.white,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRightWidth: on ? 2 : 4,
              borderBottomWidth: on ? 2 : 4,
            })}
          >
            <Text style={{ fontFamily: FONT.bold, fontSize: 12, textTransform: 'uppercase', color: on ? C.white : C.black }}>
              {t.label}
              {t.count != null ? ` · ${t.count}` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ bottom sheet */

export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={[S.rowBetween, styles.sheetHead]}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 34, height: 34, borderWidth: 2, borderColor: C.black, borderRadius: 8, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
                {React.createElement(iconFor(title), { size: 16, color: '#fff' })}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.h2} numberOfLines={1}>{title}</Text>
                {!!subtitle && <Text style={S.small}>{subtitle}</Text>}
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <X size={22} color={C.black} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16 }}>
            {children}
          </ScrollView>
          {!!footer && <View style={styles.sheetFoot}>{footer}</View>}
        </View>
      </KeyboardAvoidingView>
      {visible && <ToastHost />}
    </Modal>
  );
}

/* ------------------------------------------------------------------ list helpers */

export const Row = ({
  k,
  v,
  bold,
  color,
}: {
  k: string;
  v: React.ReactNode;
  bold?: boolean;
  color?: string;
}) => (
  <View style={[S.rowBetween, { paddingVertical: 4, gap: 12, alignItems: 'flex-start' }]}>
    <Text style={[S.small, { flexShrink: 0 }]}>{k}</Text>
    <Text style={[S.body, { flex: 1, textAlign: 'right', color: color || C.black }, bold && { fontFamily: FONT.bold }]}>
      {v ?? '—'}
    </Text>
  </View>
);

export const Totals = ({ rows }: { rows: [string, string, ('bold' | 'green')?][] }) => (
  <View style={brut({ backgroundColor: '#EFF6FF', padding: 12, marginBottom: 14 })}>
    {rows.map(([k, v, t]) => (
      <View
        key={k}
        style={[
          S.rowBetween,
          { paddingVertical: 2 },
          t === 'bold' && { borderTopWidth: 2, borderTopColor: C.black, marginTop: 4, paddingTop: 6 },
        ]}
      >
        <Text style={[S.body, t === 'bold' && S.h3, t === 'green' && { color: '#15803D' }]}>{k}</Text>
        <Text style={[S.body, t === 'bold' && S.h3, t === 'green' && { color: '#15803D' }]}>{v}</Text>
      </View>
    ))}
  </View>
);

export const Pager = ({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}) =>
  pages > 1 ? (
    <View style={[S.rowBetween, { marginTop: 4, marginBottom: 12 }]}>
      <Btn small light label="Prev" disabled={page <= 1} onPress={() => onPage(page - 1)} />
      <Text style={S.label}>
        Page {page} / {pages}
      </Text>
      <Btn small light label="Next" disabled={page >= pages} onPress={() => onPage(page + 1)} />
    </View>
  ) : null;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.white,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  title: { fontFamily: FONT.bold, fontSize: 22, color: C.black, flexShrink: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.white,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: C.black,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    maxHeight: '88%',
  },
  sheetHead: { padding: 16, borderBottomWidth: 2, borderBottomColor: C.black },
  sheetFoot: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    padding: 12,
    borderTopWidth: 2,
    borderTopColor: C.black,
    backgroundColor: C.white,
  },
  toast: { position: 'absolute', top: 60, left: 16, right: 16, padding: 12, zIndex: 99 },
  toastTitle: { fontFamily: FONT.bold, color: C.white, fontSize: 14 },
  toastText: { fontFamily: FONT.medium, color: C.white, fontSize: 12, marginTop: 2 },
});
