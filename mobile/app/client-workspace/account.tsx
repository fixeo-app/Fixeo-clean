import { CityField } from '@/components/CityField';
import { useWorkspaceDock } from '@/components/useWorkspaceDock';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
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
      setEditing(false);
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

  const contextDock = useWorkspaceDock('client');
  return (
    <FixeoScreen padded={false} contextDock={{ ...contextDock, hidden: editing }} header={
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

        <ClientPageIntro eyebrow="MON COMPTE" title={clientProfileTitle(profile?.full_name)} detail="Vos coordonnées, simplement." />
        {!!profile?.email && <FixeoText variant="supporting" tone="secondary">{profile.email}</FixeoText>}
        {profile ? <ClientSection label="Pour vos interventions">
          {editing ? <View style={styles.form}>
            <FixeoText variant="supporting" tone="secondary">Téléphone</FixeoText>
            <TextInput accessibilityLabel="Votre téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad"
              placeholder="Votre numéro" placeholderTextColor={semanticColors.text.tertiary} editable={!saving} style={clientStyles.input} />
            <CityField value={city} onChange={setCity} disabled={saving} />
            <FixeoAction label={saving ? 'Enregistrement…' : 'Enregistrer les coordonnées'} busy={saving}
              disabled={saving} onPress={() => void save()} />
            <FixeoAction label="Annuler" variant="ghost" disabled={saving} onPress={() => {
              setPhone(profile.phone || ''); setCity(profile.city || ''); setEditing(false);
            }} />
          </View> : <>
            <View style={clientStyles.row}>
              <FixeoText variant="caption" tone="secondary">Téléphone</FixeoText>
              <FixeoText variant="bodyLarge">{profile.phone || 'À renseigner'}</FixeoText>
            </View>
            <View style={clientStyles.row}>
              <FixeoText variant="caption" tone="secondary">Ville</FixeoText>
              <FixeoText variant="bodyLarge">{profile.city || 'À renseigner'}</FixeoText>
            </View>
            <FixeoAction label="Modifier mes coordonnées" variant="ghost" onPress={() => setEditing(true)} />
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
