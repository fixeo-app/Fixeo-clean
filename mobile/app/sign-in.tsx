import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { getStableSession, resolveRole, signIn, type FixeoRole } from '@/lib/auth';
import { mobileEntryRouteForRole, signInErrorMessage } from '@/lib/authEntry';
import {
  consumePendingNotificationIntent,
  notificationDestinationForRole,
} from '@/lib/notificationIntent';
import { triggerFixeoFeedback } from '@/lib/feedback';
import { EntryStage } from '@/components/EntryStage';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { colors, radius, spacing, type } from '@/ui/tokens';

type EntryState = 'checking' | 'idle' | 'signing_in' | 'opening';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [entryState, setEntryState] = useState<EntryState>('checking');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const busy = entryState === 'signing_in' || entryState === 'opening';

  async function openResolvedUniverse(role: FixeoRole, feedback = false) {
    const pending = await consumePendingNotificationIntent().catch(() => null);
    const destination = pending ? notificationDestinationForRole(pending, role) : null;

    if (feedback) triggerFixeoFeedback('success');

    if (destination) {
      router.replace({
        pathname: destination.pathname,
        params: destination.params,
      } as any);
      return;
    }

    const route = mobileEntryRouteForRole(role);
    if (!route) throw new Error('UNSUPPORTED_MOBILE_ROLE');
    router.replace(route);
  }

  useEffect(() => {
    let active = true;

    async function resumeSession() {
      try {
        const session = await getStableSession();
        if (!active) return;

        if (!session) {
          setEntryState('idle');
          return;
        }

        setEntryState('opening');
        const role = await resolveRole(session.user.id);
        if (!active) return;

        const route = mobileEntryRouteForRole(role);
        if (!route) {
          setError('Cet espace n’est pas disponible dans l’application mobile.');
          setEntryState('idle');
          return;
        }

        await openResolvedUniverse(role);
      } catch {
        if (active) setEntryState('idle');
      }
    }

    void resumeSession();
    return () => {
      active = false;
    };
  }, []);

  async function go() {
    if (busy || !email.trim() || !password) return;

    setEntryState('signing_in');
    setError('');

    try {
      const data = await signIn(email.trim(), password);
      const userId = data.user?.id;
      if (!userId) throw new Error('AUTH_REQUIRED');

      setEntryState('opening');
      const role = await resolveRole(userId);
      await openResolvedUniverse(role, true);
    } catch (reason) {
      setError(signInErrorMessage(reason));
      setEntryState('idle');
    }
  }

  if (entryState === 'checking' || entryState === 'opening') {
    return (
      <FixeoScreen padded={false}>
        <View style={styles.bootRoot}>
          <EntryStage
            eyebrow="RAFI · ACCÈS FIXEO"
            title={entryState === 'opening' ? 'Votre espace est prêt.' : 'Bienvenue chez FIXEO.'}
            subtitle={
              entryState === 'opening'
                ? 'RAFI ouvre automatiquement le bon univers.'
                : 'Vérification sécurisée de votre session.'
            }
            status={entryState === 'opening' ? 'Ouverture de votre univers…' : 'Connexion sécurisée…'}
            mode="working"
          />
        </View>
      </FixeoScreen>
    );
  }

  return (
    <FixeoScreen padded={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardRoot}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <EntryStage
            eyebrow="RAFI · ACCÈS FIXEO"
            title="Entrez dans votre univers."
            subtitle="Client ou artisan, FIXEO vous reconnaît automatiquement. Aucun choix de rôle à faire."
            status={busy ? 'Connexion sécurisée…' : 'Votre session restera active'}
            mode={busy ? 'working' : 'idle'}
            compact
          />

          <FixeoCard style={styles.formCard}>
            <View style={styles.formIntro}>
              <Text style={styles.formKicker}>CONNEXION</Text>
              <Text style={styles.formTitle}>Vos accès FIXEO</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                value={email}
                onChangeText={setEmail}
                editable={!busy}
                placeholder="vous@exemple.ma"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Mot de passe</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  disabled={busy}
                  onPress={() => setShowPassword(value => !value)}
                >
                  <Text style={styles.visibilityAction}>{showPassword ? 'Masquer' : 'Afficher'}</Text>
                </Pressable>
              </View>

              <TextInput
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                value={password}
                onChangeText={setPassword}
                editable={!busy}
                placeholder="Votre mot de passe"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                returnKeyType="done"
                onSubmitEditing={() => void go()}
              />
            </View>

            <FixeoAction
              label={
                entryState === 'signing_in'
                  ? 'RAFI vérifie vos accès…'
                  : 'Continuer avec FIXEO'
              }
              disabled={busy || !email.trim() || !password}
              onPress={() => void go()}
            />

            <View style={styles.trustRow}>
              <View style={styles.trustDot} />
              <Text style={styles.trustText}>
                Connexion sécurisée · votre univers est détecté automatiquement
              </Text>
            </View>
          </FixeoCard>

          {!!error && (
            <FixeoCard tone="muted" style={styles.errorCard}>
              <Text accessibilityLiveRegion="polite" style={styles.error}>
                {error}
              </Text>
            </FixeoCard>
          )}

          <Text style={styles.footer}>
            FIXEO · RAFI vous accompagne ensuite dans toute l’application.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </FixeoScreen>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  bootRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.lg,
  },
  formCard: {
    gap: spacing.md,
  },
  formIntro: {
    gap: 3,
    paddingBottom: spacing.xs,
  },
  formKicker: {
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
    color: colors.text,
  },
  field: {
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  label: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  visibilityAction: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
  },
  input: {
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: type.body,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  trustDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  trustText: {
    flexShrink: 1,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorCard: {
    paddingVertical: spacing.md,
  },
  error: {
    textAlign: 'center',
    color: colors.danger,
    fontWeight: '800',
    lineHeight: 20,
  },
  footer: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
});
