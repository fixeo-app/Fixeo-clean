import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import {
  getClientProfile,
  updateClientProfile,
  type ClientProfile,
} from '@/lib/clientWorkspace';
import { FixeoAction } from '@/ui/FixeoAction';
import { MobileShell } from '@/components/MobileShell';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { colors, radius, spacing, type } from '@/ui/tokens';
import { clientProfileTitle } from '@/lib/workspacePresentation';
import { isMobileUiTimeout, withMobileDeadline } from '@/lib/mobileResilience';
import { useForegroundRefresh } from '@/lib/useForegroundRefresh';

export default function ClientAccount() {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const value = await withMobileDeadline(getClientProfile());
      setProfile(value);
      setPhone(value.phone || '');
      setCity(value.city || '');
      setMessage('');
    } catch (reason) {
      setMessage(
        isMobileUiTimeout(reason)
          ? 'Le réseau met trop de temps. Votre profil reste intact : réessayez dans un instant.'
          : 'Impossible de charger votre compte.',
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useForegroundRefresh(load);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const next = await withMobileDeadline(updateClientProfile({ phone, city }));
      setProfile(next);
      setMessage('✓ Coordonnées mises à jour.');
    } catch (reason) {
      setMessage(
        isMobileUiTimeout(reason)
          ? 'Le réseau met trop de temps. Vérifiez vos coordonnées avant de réessayer.'
          : 'Impossible d’enregistrer ces modifications.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <FixeoScreen padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <MobileShell
          universe="client"
          activeKey="account"
          statusLabel="Votre profil FIXEO"
          rightActionLabel="Mon espace"
          onRightAction={() => router.replace('/client-workspace')}
        />
        <Text style={styles.kicker}>MON COMPTE</Text>
        <Text style={styles.title}>{clientProfileTitle(profile?.full_name)}</Text>
        <Text style={styles.email}>{profile?.email || ''}</Text>
        <Text style={styles.helper}>Gardez uniquement les coordonnées utiles à vos interventions.</Text>

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
      </ScrollView>
    </FixeoScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
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
  helper: { color: colors.textMuted, lineHeight: 20 },
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
