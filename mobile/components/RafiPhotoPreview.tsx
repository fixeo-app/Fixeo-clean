import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { captureRafiPhoto } from '@/lib/rafiPhotoCapture';
import { FixeoText } from '@/ui/FixeoText';
import { FixeoAction } from '@/ui/FixeoAction';
import { semanticColors, space } from '@/ui/tokens';

export function RafiPhotoPreview({ uri, busy = false, readOnly = false, replacePrimary = false, onChange, onRemove, onClarify }: {
  uri: string; busy?: boolean; readOnly?: boolean; replacePrimary?: boolean; onChange: (uri: string, mimeType: string) => void; onRemove: () => void; onClarify: () => void;
}) {
  const [open, setOpen] = useState(false), [message, setMessage] = useState(''), [capturing, setCapturing] = useState(false);
  const [managing, setManaging] = useState(false);
  const alive = useRef(true), locked = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function replace(source: 'camera' | 'photos') {
    if (busy || locked.current) return;
    locked.current = true; setCapturing(true); setMessage('');
    try { const photo = await captureRafiPhoto(source, () => alive.current); if (photo) onChange(photo.uri, photo.mimeType); }
    catch { if (alive.current) setMessage('La photo n’a pas pu être remplacée. Vous pouvez réessayer.'); }
    finally { locked.current = false; if (alive.current) setCapturing(false); }
  }
  return <View testID="rafi-photo-preview" style={styles.root}>
    <Pressable accessibilityRole="button" accessibilityLabel="Voir la photo" onPress={() => setOpen(true)}>
      <Image source={{ uri }} resizeMode="contain" style={styles.photo} accessibilityLabel="Photo sélectionnée pour RAFI" />
    </Pressable>
    <FixeoText variant="caption" tone="secondary">{busy ? 'RAFI analyse cette photo.' : 'C’est cette photo que vous choisissez de partager avec RAFI.'}</FixeoText>
    {!readOnly && <>
    {replacePrimary && <FixeoAction label="Remplacer la photo" disabled={busy || capturing} onPress={() => setManaging(true)} />}
    {!managing && <FixeoAction label="Continuer sans photo" variant="ghost" disabled={busy || capturing} onPress={onRemove} />}
    <FixeoAction label={managing ? 'Fermer les options photo' : 'Gérer la photo'} variant="ghost" accessibilityState={{ expanded: managing }} onPress={() => setManaging(value => !value)} />
    {managing && <>
    <View style={styles.actions}>
      <FixeoAction label="Reprendre" variant="secondary" disabled={busy || capturing} onPress={() => void replace('camera')} />
      <FixeoAction label="Changer" variant="secondary" disabled={busy || capturing} onPress={() => void replace('photos')} />
      <FixeoAction label="Supprimer" variant="ghost" disabled={busy || capturing} onPress={onRemove} />
    </View>
    <FixeoAction label="Ajouter une précision" variant="ghost" disabled={busy || capturing} onPress={onClarify} />
    </>}
    </>}
    {!!message && <FixeoText accessibilityLiveRegion="polite">{message}</FixeoText>}
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.modal}><Image source={{ uri }} resizeMode="contain" style={styles.full} accessibilityLabel="Photo sélectionnée en grand" />
        <FixeoAction label="Fermer la photo" variant="secondary" onPress={() => setOpen(false)} /></View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({ root: { gap: space.sm }, photo: { width: 88, height: 88, borderRadius: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  modal: { flex: 1, backgroundColor: semanticColors.background.surface, padding: 28, paddingVertical: 60 }, full: { flex: 1, width: '100%' } });
