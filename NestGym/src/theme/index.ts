import { StyleSheet } from 'react-native';

export const FONT = {
  regular: 'DMSans-Regular',
  medium: 'DMSans-Medium',
  semiBold: 'DMSans-SemiBold',
  bold: 'DMSans-Bold',
};

export const C = {
  primary: '#024BAB',
  secondary: '#FA731C',
  success: '#00C48C',
  warning: '#F59E0B',
  danger: '#EF4444',
  black: '#000000',
  white: '#ffffff',
  bg: '#ffffff',
  card: '#ffffff',
  border: '#000000',
  textMuted: '#000000',
  textLight: '#000000',
};

export const S = StyleSheet.create({
  // Layout
  flex1: { flex: 1 },
  row: { flexDirection: 'row' },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1, backgroundColor: C.bg },

  // Card
  card: {
    backgroundColor: C.white,
    borderWidth: 2,
    borderRadius: 8,
    borderRightWidth: 5,
    borderBottomWidth: 5,
    borderRightColor: '#0A0A0A',
    borderBottomColor: '#0A0A0A',
    borderColor: C.black,
    padding: 16,
    marginBottom: 12,
  },

  // Typography
  h1: {
    fontFamily: FONT.bold,
    fontSize: 22,
    fontWeight: '700',
    color: C.black,
  },
  h2: {
    fontFamily: FONT.bold,
    fontSize: 18,
    fontWeight: '700',
    color: C.black,
  },
  h3: {
    fontFamily: FONT.bold,
    fontSize: 15,
    fontWeight: '700',
    color: C.black,
  },
  label: {
    fontFamily: FONT.bold,
    fontSize: 12,
    fontWeight: '700',
    color: C.black,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  body: {
    fontFamily: FONT.medium,
    fontSize: 14,
    fontWeight: '500',
    color: C.black,
  },
  small: {
    fontFamily: FONT.medium,
    fontSize: 12,
    fontWeight: '500',
    color: C.textMuted,
  },
  mono: { fontFamily: 'monospace', fontSize: 12 },

  // Buttons
  btnPrimary: {
    backgroundColor: C.primary,
    borderWidth: 2,
    borderRadius: 8,
    borderRightWidth: 5,
    borderBottomWidth: 5,
    borderRightColor: '#0A0A0A',
    borderBottomColor: '#0A0A0A',
    borderColor: C.black,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnPrimaryText: {
    fontFamily: FONT.bold,
    color: C.white,
    fontWeight: '700',
    fontSize: 13,
    textTransform: 'uppercase',
  },
  btnSecondary: {
    backgroundColor: C.white,
    borderWidth: 2,
    borderRadius: 8,
    borderRightWidth: 5,
    borderBottomWidth: 5,
    borderRightColor: '#0A0A0A',
    borderBottomColor: '#0A0A0A',
    borderColor: C.black,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnSecondaryText: {
    fontFamily: FONT.bold,
    color: C.black,
    fontWeight: '700',
    fontSize: 13,
    textTransform: 'uppercase',
  },
  btnDanger: {
    backgroundColor: '#FEF2F2',
    borderWidth: 2,
    borderRadius: 8,
    borderColor: C.danger,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  // Input
  input: {
    fontFamily: FONT.medium,
    borderWidth: 2,
    borderRadius: 8,
    borderRightWidth: 5,
    borderBottomWidth: 5,
    borderRightColor: '#0A0A0A',
    borderBottomColor: '#0A0A0A',
    borderColor: C.black,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '500',
    color: C.black,
    backgroundColor: C.white,
  },

  // Badge
  badgeSuccess: {
    backgroundColor: '#DCFCE7',
    borderWidth: 2,
    borderRadius: 8,
    borderColor: C.success,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeDanger: {
    backgroundColor: '#FEF2F2',
    borderWidth: 2,
    borderRadius: 8,
    borderColor: C.danger,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeWarning: {
    backgroundColor: '#FFF7ED',
    borderWidth: 2,
    borderRadius: 8,
    borderColor: C.warning,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgePrimary: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderRadius: 8,
    borderColor: C.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeGray: {
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderRadius: 8,
    borderColor: '#9CA3AF',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: FONT.bold,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  // Divider
  divider: { height: 2, backgroundColor: C.black, marginVertical: 12 },
  dividerLight: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },

  // Page header
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.white,
    borderBottomWidth: 2,
    borderBottomColor: C.black,
  },

  // Empty state
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: {
    fontFamily: FONT.bold,
    fontSize: 14,
    fontWeight: '700',
    color: C.textMuted,
    textAlign: 'center',
    marginTop: 12,
  },
});
