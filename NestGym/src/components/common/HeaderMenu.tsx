import React, { createContext, useContext, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ellipsis } from 'lucide-react-native';
import { C } from '../../theme';
import HeaderIconBtn from './HeaderIconBtn';

type Run = (fn: () => unknown) => void;
const MenuCtx = createContext<Run | null>(null);

/** Non-null when rendered inside a HeaderMenu: call it with the action to close the menu and run it. */
export const useHeaderMenu = () => useContext(MenuCtx);

interface ItemProps {
  /** A lucide icon component, or a ready element (e.g. a logo image). */
  icon: React.ComponentType<any> | React.ReactElement;
  label: string;
  onPress: () => unknown;
}

/** One row of a HeaderMenu. */
export function MenuItem({ icon, label, onPress }: ItemProps) {
  const run = useHeaderMenu();
  const Icon = icon as React.ComponentType<any>;
  return (
    <TouchableOpacity
      style={s.item}
      onPress={() => (run ? run(onPress) : onPress())}
      accessibilityRole="button"
    >
      <View style={s.itemIcon}>
        {React.isValidElement(icon) ? icon : <Icon size={18} color={C.black} />}
      </View>
      <Text style={s.itemText}>{label}</Text>
    </TouchableOpacity>
  );
}

interface Props {
  children: React.ReactNode;
  /** Small dot on the icon, e.g. while a mode from the menu is on. */
  dot?: boolean;
}

/**
 * "⋯" header action that opens a small menu under itself. Keeps a header to
 * search · filter · more · add; put MenuItem, ExportButton and ImportButton inside.
 */
export default function HeaderMenu({ children, dot }: Props) {
  const anchor = useRef<any>(null);
  const win = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState({ top: 96, right: 12 });

  if (!React.Children.toArray(children).length) return null;

  const show = () => {
    const el = anchor.current;
    if (!el) return setOpen(true);
    el.measureInWindow((x: number, y: number, w: number, h: number) => {
      if (h > 0)
        setPos({ top: y + h + 4, right: Math.max(8, win.width - (x + w)) });
      setOpen(true);
    });
  };

  const run: Run = fn => {
    setOpen(false);
    // iOS cannot present a picker / share sheet / alert while this modal is still closing
    setTimeout(
      async () => {
        setBusy(true);
        try {
          await fn();
        } finally {
          setBusy(false);
        }
      },
      Platform.OS === 'ios' ? 350 : 0,
    );
  };

  return (
    <View ref={anchor} collapsable={false}>
      <HeaderIconBtn
        label="More actions"
        disabled={busy}
        dot={dot}
        icon={
          busy ? (
            <ActivityIndicator size="small" color={C.black} />
          ) : (
            <Ellipsis size={24} color={C.black} />
          )
        }
        onPress={show}
      />
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          style={s.overlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View style={[s.sheet, pos]}>
            <MenuCtx.Provider value={run}>{children}</MenuCtx.Provider>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: {
    position: 'absolute',
    minWidth: 230,
    borderWidth: 2,
    borderRadius: 8,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderColor: C.black,
    backgroundColor: C.white,
    paddingVertical: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  itemIcon: { width: 22, alignItems: 'center' },
  itemText: { fontSize: 14, color: C.black },
});
