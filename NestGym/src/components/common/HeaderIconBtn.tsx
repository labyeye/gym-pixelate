import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface Props {
  icon: React.ReactNode;
  onPress: () => void;
  label: string;
  /** Small dot on the icon (e.g. an active filter). */
  dot?: boolean;
  disabled?: boolean;
}

/** Icon-only header action: no border, no background, so the header row keeps its space. */
export default function HeaderIconBtn({
  icon,
  onPress,
  label,
  dot,
  disabled,
}: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={s.btn}
    >
      {icon}
      {dot && <View style={s.dot} />}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: { padding: 4 },
  dot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 9,
    height: 9,
    borderRadius: 4,
    backgroundColor: '#FA731C',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
});
