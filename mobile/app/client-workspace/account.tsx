import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import {
  getClientProfile,
  updateClientProfile,
  type ClientProfile,
} from '@/lib/clientWorkspace';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { colors, radius, spacing, type } from '@/ui/tokens';

export default function ClientAccount() {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void getClientProfile()
      .then(value => {
        setProfile(value);
        setPhone(value.phone || '');
        setCity(value.city || '');
      })
      .catch(() => setMessage('Impossible de charger votre compte.'));
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const next = await updateClientProfile({ phone, city });
      setProfile(next);
      setMessage('✓ Coordonnées mises à jour.');
    } catch {
      setMessage('Impossible d’enregistrer ces modifications.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <FixeoScreen padded={false}>
      <View style={styles.content}>
        <Text style={styles.back} onPress={() => router.back()}>‹ Client OS</Text>
        <Text style={styles.kicker}>MON COMPTE</Text>
        <Text style={styles.title}>{profile?.full_name || 'Votre profil FIXEO'}</Text>
        <Text style={styles.email}>{profile?.email || ''}</Text>

        <FixeoCard style={styles.form}>
          <Text style={styles.label}>Téléphone</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="Votre numéro"
            style={styles.input}
          />

          <Text style={styles.label}>Ville</Text>
          <TextInput
            value={city}
            onChangeText={setCity}
            autoCapitalize="words"
            placeholder="Votre ville"
            style={styles.input}
          />

          <FixeoAction
            label={saving ? 'Enregistrement…' : 'Enregistrer'}
            disabled={saving}
            onPress={() => void save()}
          />
        </FixeoCard>

        {!!message && <Text style={styles.message}>{message}</Text>}
      </View>
    </FixeoScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  back: { color: colors.textMuted, fontWeight: '800' },
  kicker: {
    marginTop: spacing.sm,
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    color: colors.text,
  },
  email: { color: colors.textMuted },
  form: { gap: spacing.sm, marginTop: spacing.sm },
  label: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  input: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: type.body,
  },
  message: {
    textAlign: 'center',
    fontWeight: '800',
    color: colors.textMuted,
  },
});
