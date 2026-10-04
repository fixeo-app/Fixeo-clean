import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, findNodeHandle, Keyboard, Modal, Platform,
  Pressable, StyleSheet, View, useWindowDimensions,
} from 'react-native';
import { router, useFocusEffect, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut } from '@/lib/auth';
import { FixeoText } from '@/ui/FixeoText';
import { ShellControl, ShellIcon } from '@/ui/ShellControl';
import { activeShellKey, getShellDestinations, navigateShell, type ShellIcon as IconName, type ShellPath, type ShellUniverse } from '@/ui/shellContract';
import { getScreenMetrics } from '@/ui/screenMetrics';
import { resolveMotion } from '@/ui/motionContract';
import { motionEasing } from '@/ui/motionEasing';
import { useReducedMotion } from '@/ui/useReducedMotion';
import { interaction, semanticColors, space } from '@/ui/tokens';
import { PremiumDrawer } from './PremiumDrawer';

export type MobileShellProps = {
  universe: ShellUniverse; activeKey: string; statusLabel?: string;
  rightActionLabel?: string; onRightAction?: () => void;
  rightActionIcon?: IconName; rightDestination?: ShellPath; rightNavigation?: 'switch' | 'detail';
  orbMode?: 'idle' | 'listening' | 'working' | 'success';
};

export function MobileShell({ universe, activeKey, statusLabel, rightActionLabel, onRightAction,
  rightActionIcon, rightDestination, rightNavigation = 'switch', orbMode = 'idle' }: MobileShellProps) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const phase = useRef<'closed' | 'open' | 'closing'>('closed');
  const afterClose = useRef<(() => void) | undefined>(undefined);
  const logoutBusy = useRef(false);
  const navigating = useRef(false);
  const progress = useRef(new Animated.Value(0)).current;
  const menuRef = useRef<View>(null);
  const closeRef = useRef<View>(null);
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const safe = getScreenMetrics(insets, { padded: false });
  const drawerWidth = Math.min(width - space.lg, 390);
  const currentKey = activeShellKey(universe, pathname, activeKey);
  const destination = getShellDestinations(universe).find(item => item.path === rightDestination);
  const rightIcon = rightActionIcon ?? destination?.icon;
  const rightLabel = rightActionLabel ?? destination?.label;
  const hasAction = !!rightLabel && (!!onRightAction || !!rightDestination);

  function focus(ref: typeof menuRef) {
    if (Platform.OS === 'web') { ref.current?.focus?.(); return; }
    const handle = findNodeHandle(ref.current);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }

  useFocusEffect(useCallback(() => {
    navigating.current = false;
    return () => {
      // A notification/deep link may change route while the menu is open.
      phase.current = 'closed';
      afterClose.current = undefined;
      progress.stopAnimation();
      setOpen(false);
      setMounted(false);
    };
  }, [progress]));

  useEffect(() => {
    if (!mounted) return;
    const transition = resolveMotion(open ? 'transition' : 'control', reduceMotion);
    const complete = () => {
      if (open || phase.current !== 'closing') return;
      phase.current = 'closed';
      setMounted(false);
      const after = afterClose.current;
      afterClose.current = undefined;
      after?.();
      if (!navigating.current && Platform.OS !== 'ios') focus(menuRef);
    };
    if (!transition.duration) {
      progress.setValue(open ? 1 : 0);
      complete();
      return;
    }
    const animation = Animated.timing(progress, { toValue: open ? 1 : 0, duration: transition.duration,
      easing: motionEasing[transition.easing], useNativeDriver: true });
    animation.start(({ finished }) => { if (finished) complete(); });
    return () => animation.stop();
  }, [mounted, open, progress, reduceMotion]);

  function openDrawer() {
    if (phase.current !== 'closed') return;
    Keyboard.dismiss();
    phase.current = 'open';
    progress.setValue(reduceMotion ? 1 : 0);
    setMounted(true);
    setOpen(true);
  }

  function close(after?: () => void) {
    if (phase.current !== 'open') return;
    phase.current = 'closing';
    afterClose.current = after;
    setOpen(false);
  }

  async function logout() {
    if (logoutBusy.current) return;
    logoutBusy.current = true;
    setSigningOut(true);
    try { await signOut(); }
    finally {
      logoutBusy.current = false;
      setSigningOut(false);
      phase.current = 'closed';
      setMounted(false);
      setOpen(false);
      router.replace('/sign-in');
    }
  }

  return <>
    <View style={styles.topbar}>
      <View style={[styles.side, hasAction && !rightIcon && styles.legacySide]}>
        <ShellControl ref={menuRef} accessibilityLabel="Ouvrir le menu FIXEO"
          accessibilityState={{ expanded: mounted }} onPress={openDrawer} style={styles.menu}>
          <ShellIcon name="menu-outline" />
        </ShellControl>
      </View>
      <View style={styles.brandWrap} accessible accessibilityLabel={`FIXEO, espace ${universe}`}>
        <FixeoText variant="bodyLarge" style={styles.brand}>FIXEO</FixeoText>
        <FixeoText variant="caption" tone="secondary">{universe === 'client' ? 'Client' : 'Artisan'}</FixeoText>
      </View>
      <View style={[styles.side, styles.right, hasAction && !rightIcon && styles.legacySide]}>
        {hasAction && <ShellControl accessibilityLabel={rightLabel} onPress={() => {
          if (rightDestination) {
            if (navigating.current) return;
            navigating.current = navigateShell(router, pathname, rightDestination, rightNavigation);
          } else onRightAction?.();
        }} style={styles.rightAction}>
          {rightIcon ? <ShellIcon name={rightIcon} /> : <FixeoText variant="supporting" style={styles.actionLabel}>{rightLabel}</FixeoText>}
        </ShellControl>}
      </View>
    </View>
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent navigationBarTranslucent
      onShow={() => focus(closeRef)} onDismiss={() => { if (!navigating.current) focus(menuRef); }}
      onRequestClose={() => close()}>
      <View style={styles.modalRoot}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessible={false}
            importantForAccessibility="no" tabIndex={-1} />
        </Animated.View>
        <Animated.View style={[styles.drawer, { width: drawerWidth, paddingTop: safe.paddingTop,
          paddingBottom: safe.paddingBottom, paddingLeft: insets.left,
          transform: [{ translateX: reduceMotion ? 0 : progress.interpolate({ inputRange: [0, 1], outputRange: [-drawerWidth, 0] }) }] }]}>
          {mounted && <PremiumDrawer universe={universe} activeKey={currentKey} statusLabel={statusLabel}
            orbMode={orbMode} signingOut={signingOut} closeRef={closeRef} onClose={() => close()}
            onNavigate={item => {
              if (signingOut) return;
              close(() => { navigating.current = navigateShell(router, pathname, item.path); });
            }} onLogout={() => void logout()} />}
        </Animated.View>
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  topbar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  side: { width: interaction.minTarget, minWidth: interaction.minTarget, alignItems: 'flex-start' },
  legacySide: { flex: 1 },
  right: { alignItems: 'flex-end' },
  menu: { width: interaction.minTarget, backgroundColor: semanticColors.background.surface },
  brandWrap: { alignItems: 'center', flex: 1, minWidth: 0, paddingVertical: space.xxs },
  brand: { fontWeight: '600', letterSpacing: 2.4, maxWidth: '100%', textAlign: 'center' },
  rightAction: { paddingHorizontal: space.xxs, width: '100%' },
  actionLabel: { textAlign: 'center', width: '100%' },
  modalRoot: { flex: 1, flexDirection: 'row' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.42)' },
  drawer: { height: '100%', backgroundColor: semanticColors.background.inverse },
});
