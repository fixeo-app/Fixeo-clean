import { RafiScrollView as ScrollView } from '@/ui/RafiScrollView';
import { useState, type PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View, useWindowDimensions, type TextInputProps } from 'react-native';
import { BackButton } from '@/ui/BackButton';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { FixeoAction } from '@/ui/FixeoAction';
import { RafiOrb } from '@/ui/RafiOrb';
import { colors, typography } from '@/ui/tokens';
import { authCopy, type AuthIssue } from '@/lib/authContract';

export function AuthFrame({ title, detail, children, back = '/entry', hero = false }: PropsWithChildren<{ title: string; detail: string; back?: string | false; hero?: boolean }>) {
  const { width, height } = useWindowDimensions();
  const compact = height < 760;
  const orbSize = hero ? Math.min(compact ? 108 : 140, (width - 48) * 0.38) : compact ? 84 : 108;
  return <FixeoScreen padded={false}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.scroll}>
      <View style={s.canvas}>
        <View style={[s.brandRow, compact && { minHeight: 48 }]}><View style={s.brandSide}>{back && <BackButton destination={back} label="Retour" iconOnly />}</View><Text style={s.brand}>FIXEO</Text><View style={s.brandSide} /></View>
        <View style={[hero ? s.hero : s.intro, compact && { gap: 6, paddingTop: 4, paddingBottom: 12 }]}>
          <View style={{ width: '100%', alignItems: 'center' }}><RafiOrb size={orbSize} mode="idle" subtle /></View>
          <Text style={s.kicker}>RAFI · À VOS CÔTÉS</Text>
          <Text accessibilityRole="header" style={[s.title, hero && s.heroTitle, compact && { fontSize: hero ? 30 : 24, lineHeight: hero ? 34 : 28 }]}>{title}</Text>
          <Text style={[s.detail, compact && { fontSize: 14, lineHeight: 20 }]}>{detail}</Text>
        </View>
        <View style={[s.form, compact && { gap: 12 }]} >{children}</View>
        <Text style={s.foot}>Vos informations restent dans votre espace. Vous choisissez ce que vous partagez.</Text>
      </View>
    </ScrollView>
  </KeyboardAvoidingView></FixeoScreen>;
}
export function AuthField({ label, secret = false, ...props }: TextInputProps & { label: string; secret?: boolean }) {
  const [show, setShow] = useState(false); const [focus, setFocus] = useState(false);
  return <View style={s.field}><Text style={s.label}>{label}</Text>
    <View style={s.inputRow}>
    <TextInput {...props} accessibilityLabel={label} autoCapitalize={props.autoCapitalize || 'none'} autoCorrect={false}
      secureTextEntry={secret && !show} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      placeholderTextColor={colors.textMuted} style={[s.input, { flex: 1, minWidth: 0 }, focus && s.focus, props.style]} />
    {secret && <FixeoAction label={show ? 'Masquer' : 'Afficher'} accessibilityLabel={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} variant="ghost" onPress={() => setShow(!show)} accessibilityState={{ expanded: show }} />}
    </View>
  </View>;
}
export function AuthError({ issue }: { issue: AuthIssue | null }) {
  if (!issue) return null;
  return <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}><Text style={s.errorTitle}>{authCopy[issue].title}</Text><Text style={s.detail}>{authCopy[issue].detail}</Text></View>;
}
const s = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 }, canvas: { width: '100%', maxWidth: 520, alignSelf: 'center', flexGrow: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 56, marginBottom: 4 },
  brandSide: { flex: 1, minWidth: 0 },
  brand: { color: colors.ink, fontSize: 26, fontWeight: '800', letterSpacing: 4.2, textAlign: 'center' }, intro: { alignItems: 'center', gap: 12, paddingTop: 8, paddingBottom: 24 },
  hero: { alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: 24 }, kicker: { ...typography.eyebrow, color: '#68686D', textAlign: 'center' },
  title: { ...typography.title, color: colors.ink, textAlign: 'center' }, heroTitle: { ...typography.display }, detail: { ...typography.body, color: '#55555B', textAlign: 'center' },
  form: { gap: 16 }, field: { gap: 4 }, inputRow: { flexDirection: 'row', alignItems: 'center', gap: 4 }, label: { ...typography.supporting, color: colors.ink, fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 2, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: colors.ink, backgroundColor: '#FFFFFF' },
  focus: { borderColor: '#365AC7' }, error: { borderLeftWidth: 3, borderLeftColor: colors.danger, padding: 14, gap: 6, backgroundColor: '#FCEFED' },
  errorTitle: { ...typography.body, fontWeight: '600', color: colors.danger }, foot: { ...typography.supporting, color: '#68686D', marginTop: 32, marginBottom: 12 },
});
export const authStyles = s;
