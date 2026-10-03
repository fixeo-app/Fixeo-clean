import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { signOut } from '@/lib/auth';
import { RafiOrb } from '@/ui/RafiOrb';
import { colors, radius, spacing, type } from '@/ui/tokens';

type Universe = 'client' | 'artisan';

type MenuItem = {
  key: string;
  label: string;
  meta?: string;
  path: string;
};

type Props = {
  universe: Universe;
  activeKey: string;
  statusLabel?: string;
  rightActionLabel?: string;
  onRightAction?: () => void;
  orbMode?: 'idle' | 'listening' | 'working' | 'success';
};

const CLIENT_ITEMS: MenuItem[] = [
  { key: 'rafi', label: 'RAFI', meta: 'Votre assistant FIXEO', path: '/' },
  { key: 'space', label: 'Mon espace', meta: 'Vue d’ensemble', path: '/client-workspace' },
  { key: 'history', label: 'Interventions', meta: 'Historique et suivi', path: '/client-workspace/history' },
  { key: 'alerts', label: 'Alertes', meta: 'Ce qui demande votre attention', path: '/client-workspace/notifications' },
  { key: 'account', label: 'Mon compte', meta: 'Coordonnées et préférences', path: '/client-workspace/account' },
];

const ARTISAN_ITEMS: MenuItem[] = [
  { key: 'cockpit', label: 'Cockpit', meta: 'Priorités et opportunités', path: '/artisan' },
  { key: 'workspace', label: 'Artisan OS', meta: 'Votre activité professionnelle', path: '/artisan-workspace' },
  { key: 'clients', label: 'Clients', meta: 'CRM personnel', path: '/artisan-workspace/clients' },
  { key: 'quotes', label: 'Devis', meta: 'Devis Studio', path: '/artisan-workspace/quotes' },
  { key: 'agenda', label: 'Agenda', meta: 'Interventions personnelles', path: '/artisan-workspace/agenda' },
  { key: 'finance', label: 'Finance', meta: 'Encaissements et dépenses', path: '/artisan-workspace/finance' },
];

export function MobileShell({
  universe,
  activeKey,
  statusLabel,
  rightActionLabel,
  onRightAction,
  orbMode = 'idle',
}: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const slide = useRef(new Animated.Value(-1)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.86, 390);
  const items = universe === 'client' ? CLIENT_ITEMS : ARTISAN_ITEMS;

  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [open]);

  function openDrawer() {
    setMounted(true);
    setOpen(true);
    slide.setValue(-1);
    fade.setValue(0);
    Animated.parallel([
      Animated.timing(slide, {
        toValue: 0,
        duration: 230,
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: 1,
        duration: 190,
        useNativeDriver: true,
      }),
    ]).start();
  }

  function close(after?: () => void) {
    setOpen(false);
    Animated.parallel([
      Animated.timing(slide, {
        toValue: -1,
        duration: 190,
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: 0,
        duration: 170,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setMounted(false);
      after?.();
    });
  }

  function navigate(path: string) {
    close(() => router.replace(path as any));
  }

  async function logout() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
      setMounted(false);
      setOpen(false);
      router.replace('/sign-in');
    }
  }

  return (
    <>
      <View style={styles.topbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ouvrir le menu FIXEO"
          onPress={openDrawer}
          style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
        >
          <View style={styles.menuGlyph}>
            <View style={styles.menuLine} />
            <View style={[styles.menuLine, styles.menuLineShort]} />
            <View style={styles.menuLine} />
          </View>
        </Pressable>

        <View style={styles.brandWrap}>
          <Text style={styles.brand}>FIXEO</Text>
          <Text style={styles.universe}>{universe === 'client' ? 'CLIENT' : 'ARTISAN'}</Text>
        </View>

        {rightActionLabel && onRightAction ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRightAction}
            style={({ pressed }) => [styles.rightAction, pressed && styles.pressed]}
          >
            <Text style={styles.rightActionText}>{rightActionLabel}</Text>
          </Pressable>
        ) : (
          <View style={styles.rightSpacer} />
        )}
      </View>

      <Modal
        visible={mounted}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => close()}
      >
        <View style={styles.modalRoot}>
          <Animated.View style={[styles.backdrop, { opacity: fade }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} />
          </Animated.View>

          <Animated.View
            style={[
              styles.drawer,
              {
                width: drawerWidth,
                transform: [{
                  translateX: slide.interpolate({
                    inputRange: [-1, 0],
                    outputRange: [-drawerWidth, 0],
                  }),
                }],
              },
            ]}
          >
            <View style={styles.drawerTop}>
              <View style={styles.identityRow}>
                <RafiOrb size={58} mode={orbMode} />
                <View style={styles.identityCopy}>
                  <Text style={styles.drawerBrand}>FIXEO</Text>
                  <Text style={styles.drawerUniverse}>
                    {universe === 'client' ? 'ESPACE CLIENT' : 'ESPACE ARTISAN'}
                  </Text>
                </View>
              </View>

              <View style={styles.statusPill}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>
                  {statusLabel || (universe === 'client' ? 'RAFI est prêt' : 'Cockpit connecté')}
                </Text>
              </View>
            </View>

            <View style={styles.nav}>
              {items.map(item => {
                const active = activeKey === item.key;
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    onPress={() => navigate(item.path)}
                    style={({ pressed }) => [
                      styles.navItem,
                      active && styles.navItemActive,
                      pressed && styles.navPressed,
                    ]}
                  >
                    <View style={styles.navCopy}>
                      <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                        {item.label}
                      </Text>
                      {!!item.meta && (
                        <Text style={[styles.navMeta, active && styles.navMetaActive]}>
                          {item.meta}
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.navArrow, active && styles.navArrowActive]}>→</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.drawerFooter}>
              <Text style={styles.footerMicro}>
                RAFI reste accessible dans tout votre univers FIXEO.
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={signingOut}
                onPress={() => void logout()}
                style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
              >
                <Text style={styles.logoutText}>
                  {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  topbar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  menuGlyph: {
    width: 18,
    gap: 4,
  },
  menuLine: {
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.ink,
  },
  menuLineShort: {
    width: 12,
  },
  brandWrap: {
    alignItems: 'center',
    gap: 1,
  },
  brand: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 3.4,
    color: colors.text,
  },
  universe: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.8,
    color: colors.textMuted,
  },
  rightAction: {
    minWidth: 86,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rightActionText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
  },
  rightSpacer: {
    width: 44,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
  modalRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  drawer: {
    height: '100%',
    paddingTop: 54,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.ink,
  },
  drawerTop: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  identityCopy: {
    flex: 1,
    gap: 4,
  },
  drawerBrand: {
    color: colors.inverse,
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: 3.8,
  },
  drawerUniverse: {
    color: '#99999F',
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  statusText: {
    color: '#D8D8DA',
    fontSize: 12,
    fontWeight: '800',
  },
  nav: {
    flex: 1,
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
  navItem: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  navItemActive: {
    backgroundColor: colors.inverse,
  },
  navPressed: {
    opacity: 0.74,
  },
  navCopy: {
    flex: 1,
    gap: 2,
  },
  navLabel: {
    color: colors.inverse,
    fontSize: 17,
    fontWeight: '900',
  },
  navLabelActive: {
    color: colors.ink,
  },
  navMeta: {
    color: '#8D8D93',
    fontSize: 11,
    lineHeight: 15,
  },
  navMetaActive: {
    color: colors.textMuted,
  },
  navArrow: {
    color: '#7B7B80',
    fontSize: 19,
    fontWeight: '900',
  },
  navArrowActive: {
    color: colors.ink,
  },
  drawerFooter: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  footerMicro: {
    color: '#85858B',
    fontSize: 11,
    lineHeight: 16,
  },
  logout: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  logoutText: {
    color: colors.inverse,
    fontWeight: '800',
  },
});
