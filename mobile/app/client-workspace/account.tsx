import { KeyboardInput } from '@/ui/KeyboardInput';
import { clientProfileErrors } from '@/lib/clientProfileValidation';
import { RafiOrb } from '@/ui/RafiOrb';
import { RafiScrollView as ScrollView } from '@/ui/RafiScrollView';
import { CityField } from '@/components/CityField';
import { BackButton } from '@/ui/BackButton';
import { useWorkspaceDock } from '@/components/useWorkspaceDock';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import {
  getClientProfile,
  updateClientProfile,
  type ClientProfile,
} from '@/lib/clientWorkspace';
import { FixeoAction } from '@/ui/FixeoAction';
import { MobileShell } from '@/components/MobileShell';
import { FixeoText } from '@/ui/FixeoText';
import { ClientPageIntro, ClientSection, clientStyles } from '@/components/ClientEditorial';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { semanticColors, space } from '@/ui/tokens';
import { clientProfileTitle } from '@/lib/workspacePresentation';
import { isMobileUiTimeout, withMobileDeadline } from '@/lib/mobileResilience';
import { useForegroundRefresh } from '@/lib/useForegroundRefresh';

export default function ClientAccount() {
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({ phone: '', city: '' });
  const editingRef = useRef(false), saveLock = useRef(false);
  const phoneRef = useRef<TextInput>(null);
  function cancelEdit() {
    setPhone(profile?.phone || ''); setCity(profile?.city || ''); setErrors({phone:'',city:''});
    editingRef.current = false; setEditing(false); setMessage('');
  }

  const load = useCallback(async () => {
    try {
      const value = await withMobileDeadline(getClientProfile());
      setProfile(value);
      if (!editingRef.current) { setPhone(value.phone || ''); setCity(value.city || ''); setMessage(''); }
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
    if (saveLock.current) return;
    const invalid = clientProfileErrors(phone, city); setErrors(invalid);
    if (invalid.phone || invalid.city) { if (invalid.phone) phoneRef.current?.focus(); return; }
    saveLock.current = true; setSaving(true);
    try {
      const next = await withMobileDeadline(updateClientProfile({ phone, city }));
      setProfile(next);
      editingRef.current = false; setEditing(false);
      setMessage('✓ Coordonnées mises à jour.');
    } catch (reason) {
      setMessage(
        isMobileUiTimeout(reason)
          ? 'Le réseau met trop de temps. Vérifiez vos coordonnées avant de réessayer.'
          : 'Impossible d’enregistrer ces modifications.',
      );
    } finally {
      saveLock.current = false; setSaving(false);
    }
  }

  const contextDock = useWorkspaceDock('client');
  return (
    <FixeoScreen transactional={editing} padded={false} contextDock={contextDock} header={
        <MobileShell
          universe="client"
          activeKey="account"
          statusLabel="Votre profil FIXEO"
          rightActionLabel="Mon espace"
          rightDestination="/client-workspace"
        />
      }>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >

        <BackButton destination="/client-workspace" disabled={saving} onPress={editing ? cancelEdit : undefined} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><RafiOrb size={48} /><FixeoText variant="supporting" tone="secondary" style={{ flex: 1 }}>RAFI · Vos informations, en confiance.</FixeoText></View>
        <ClientPageIntro eyebrow="MON COMPTE" title={clientProfileTitle(profile?.full_name)} detail="Vos coordonnées, simplement." />
        {!!profile?.email && <FixeoText variant="supporting" tone="secondary">{profile.email}</FixeoText>}
        {profile ? <ClientSection label="Pour vos interventions">
          {editing ? <View style={styles.form}>
            <FixeoText variant="supporting" tone="secondary">Téléphone · obligatoire</FixeoText>
            <KeyboardInput ref={phoneRef} accessibilityLabel="Votre téléphone obligatoire" value={phone} onChangeText={value => { setPhone(value); setErrors(old => ({...old,phone:''})); }} keyboardType="phone-pad"
              placeholder="Votre numéro" placeholderTextColor={semanticColors.text.tertiary} editable={!saving} style={clientStyles.input} />
            {!!errors.phone && <FixeoText accessibilityRole="alert">{errors.phone}</FixeoText>}
            <FixeoText tone="secondary">Ville du profil · obligatoire. La ville de chaque intervention reste indépendante.</FixeoText>
            <CityField value={city} onChange={value => { setCity(value); setErrors(old => ({...old,city:''})); }} disabled={saving} />
            {!!errors.city && <FixeoText accessibilityRole="alert">{errors.city}</FixeoText>}
            <FixeoAction label={saving ? 'Enregistrement…' : 'Enregistrer les coordonnées'} busy={saving}
              disabled={saving} onPress={() => void save()} />
            <FixeoAction label="Annuler" variant="ghost" disabled={saving} onPress={cancelEdit} />
          </View> : <>
            <View style={clientStyles.row}>
              <FixeoText variant="caption" tone="secondary">Téléphone</FixeoText>
              <FixeoText variant="bodyLarge">{profile.phone || 'À renseigner'}</FixeoText>
            </View>
            <View style={clientStyles.row}>
              <FixeoText variant="caption" tone="secondary">Ville</FixeoText>
              <FixeoText variant="bodyLarge">{profile.city || 'À renseigner'}</FixeoText>
            </View>
            <FixeoAction label="Modifier mes coordonnées" variant="ghost" onPress={() => { editingRef.current = true; setEditing(true); setMessage(''); }} />
          </>}
        </ClientSection> : !message ? <FixeoText accessibilityLiveRegion="polite" tone="secondary">Chargement de vos coordonnées…</FixeoText> : null}
        {!!message && <FixeoText accessibilityLiveRegion="polite" variant="supporting" tone="secondary">{message}</FixeoText>}
      </ScrollView>
    </FixeoScreen>
  );
}

const styles = StyleSheet.create({
  content: clientStyles.content,
  form: { gap: space.sm, paddingTop: space.md },
});
