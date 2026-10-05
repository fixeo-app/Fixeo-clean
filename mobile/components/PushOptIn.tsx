import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  isCurrentDevicePushEnabled,
  registerCurrentDeviceForPush,
  type PushRegistrationResult,
} from '@/lib/push';
import { triggerFixeoFeedback } from '@/lib/feedback';
import { colors, radius, spacing } from '@/ui/tokens';

const MESSAGES: Record<string, string> = {
  unsupported_platform: 'Les alertes push sont disponibles sur iOS et Android.',
  physical_device_required: 'Les alertes push nécessitent un appareil physique.',
  permission_denied: 'Notifications non autorisées sur cet appareil.',
  eas_project_id_missing: 'Le build Staging doit encore être lié à EAS.',
  token_unavailable: 'Impossible d’obtenir le token push pour le moment.',
  registry_failed: 'Impossible d’enregistrer cet appareil pour le moment.',
  timeout: 'Le réseau met trop de temps. Réessayez quand vous le souhaitez.',
};

export function PushOptIn({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void isCurrentDevicePushEnabled().then(enabled => {
      if (!active || !enabled) return;
      setState('done');
      setMessage('✓ Alertes FIXEO activées');
    });
    return () => {
      active = false;
    };
  }, []);

  async function enable() {
    setState('loading');
    setMessage('');

    const result = await Promise.race<PushRegistrationResult>([
      registerCurrentDeviceForPush(),
      new Promise<PushRegistrationResult>(resolve => {
        setTimeout(() => resolve({ ok: false, reason: 'timeout' }), 16_000);
      }),
    ]);

    if (result.ok) {
      triggerFixeoFeedback('success');
      setState('done');
      setMessage('✓ Alertes FIXEO activées');
      return;
    }

    triggerFixeoFeedback(result.reason === 'permission_denied' ? 'warning' : 'selection');
    setState('idle');
    setMessage(MESSAGES[result.reason] || 'Activation impossible pour le moment.');
  }

  return (
    <View style={styles.wrap}>
      {state !== 'done' && (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            compact && styles.compact,
            pressed && styles.pressed,
            state === 'loading' && styles.disabled,
          ]}
          onPress={() => void enable()}
          disabled={state === 'loading'}
        >
          <View style={styles.iconShell}>
            <Text style={styles.icon}>•</Text>
          </View>
          <View style={styles.copy}>
            <Text style={styles.title}>
              {state === 'loading' ? 'Activation…' : 'Activer les alertes FIXEO'}
            </Text>
            <Text style={styles.subtitle}>
              Missions, arrivée et étapes importantes seulement.
            </Text>
          </View>
          <Text style={styles.arrow}>→</Text>
        </Pressable>
      )}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  button: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  compact: {
    minHeight: 60,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.55,
  },
  iconShell: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  icon: {
    color: colors.inverse,
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '900',
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  arrow: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
  },
  message: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '700',
  },
});
