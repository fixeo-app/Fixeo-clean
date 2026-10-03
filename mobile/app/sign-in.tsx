import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { signIn, resolveRole } from '@/lib/auth';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { RafiOrb } from '@/ui/RafiOrb';
import { colors, radius, spacing, type } from '@/ui/tokens';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    if (busy) return;
    setBusy(true);
    try {
      setError('');
      await signIn(email.trim(), password);
      const role = await resolveRole();
      router.replace(role === 'artisan' ? '/artisan' : '/');
    } catch {
      setError('Connexion impossible. Vérifiez vos identifiants.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FixeoScreen padded={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <View style={styles.hero}>
          <Text style={styles.brand}>FIXEO</Text>
          <RafiOrb size={78} mode={busy ? 'working' : 'idle'} />
          <Text style={styles.eyebrow}>VOTRE ESPACE</Text>
          <Text style={styles.title}>Bienvenue chez FIXEO.</Text>
          <Text style={styles.subtitle}>
            Une connexion, puis l’application ouvre automatiquement votre univers.
          </Text>
        </View>

        <FixeoCard style={styles.form}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <TextInput
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="Mot de passe"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            onSubmitEditing={() => void go()}
          />
          <FixeoAction
            label={busy ? 'Connexion…' : 'Continuer'}
            disabled={busy || !email.trim() || !password}
            onPress={() => void go()}
          />
        </FixeoCard>

        {!!error && (
          <FixeoCard tone="muted">
            <Text style={styles.error}>{error}</Text>
          </FixeoCard>
        )}
      </KeyboardAvoidingView>
    </FixeoScreen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  brand: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 4,
    color: colors.text,
  },
  eyebrow: {
    marginTop: spacing.xs,
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.6,
    color: colors.textMuted,
  },
  title: {
    fontSize: 35,
    lineHeight: 39,
    fontWeight: '900',
    letterSpacing: -1.1,
    textAlign: 'center',
    color: colors.text,
  },
  subtitle: {
    maxWidth: 330,
    textAlign: 'center',
    color: colors.textMuted,
    lineHeight: 22,
  },
  form: {
    gap: spacing.md,
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
  error: {
    textAlign: 'center',
    color: colors.danger,
    fontWeight: '800',
  },
});
