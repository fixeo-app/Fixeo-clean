import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { registerCurrentDeviceForPush } from '@/lib/push';

const MESSAGES: Record<string, string> = {
  unsupported_platform: 'Les alertes push sont disponibles sur iOS et Android.',
  physical_device_required: 'Les alertes push nécessitent un appareil physique.',
  permission_denied: 'Notifications non autorisées sur cet appareil.',
  eas_project_id_missing: 'Le build Staging doit encore être lié à EAS.',
  token_unavailable: 'Impossible d’obtenir le token push pour le moment.',
  registry_failed: 'Impossible d’enregistrer cet appareil pour le moment.',
};

export function PushOptIn({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [message, setMessage] = useState('');

  async function enable() {
    setState('loading');
    const result = await registerCurrentDeviceForPush();
    if (result.ok) {
      setState('done');
      setMessage('✓ Alertes FIXEO activées');
      return;
    }
    setState('idle');
    setMessage(MESSAGES[result.reason] || 'Activation impossible pour le moment.');
  }

  return (
    <View style={styles.wrap}>
      {state !== 'done' && (
        <Pressable style={[styles.button, compact && styles.compact]} onPress={() => void enable()} disabled={state === 'loading'}>
          <Text style={styles.text}>{state === 'loading' ? 'Activation…' : '🔔 Activer les alertes'}</Text>
        </Pressable>
      )}
      {!!message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  button: { borderWidth: 1, borderColor: '#ddd', borderRadius: 14, padding: 12, alignItems: 'center' },
  compact: { paddingVertical: 9 },
  text: { fontWeight: '700' },
  message: { textAlign: 'center', fontSize: 12, opacity: 0.7 },
});
