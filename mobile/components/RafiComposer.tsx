import { StyleSheet, View } from 'react-native';
import { FixeoText } from '@/ui/FixeoText';
import { ShellControl, ShellIcon } from '@/ui/ShellControl';
import { depth, radii, semanticColors, space } from '@/ui/tokens';

type Props = {
  compact?: boolean;
  recording: boolean; voiceBusy: boolean; message?: string;
  onVoice: () => void; onPhoto: () => void; onWrite?: () => void;
};
/** Presentation only: capture, permissions and values stay in RafiInputRail/Home. */
export function RafiComposer({ compact = false, recording, voiceBusy, message, onVoice, onPhoto, onWrite }: Props) {
  return <View testID="rafi-composer" style={styles.root}>
    <View style={styles.rail}>
      {!compact && <ShellControl accessibilityLabel="Écrire à RAFI" onPress={onWrite} disabled={!onWrite} style={styles.write}>
        <FixeoText variant="supporting" tone="secondary" style={styles.prompt}>Écrire à RAFI</FixeoText>
      </ShellControl>}
      <ShellControl accessibilityLabel="Montrer une photo à RAFI" onPress={onPhoto}>
        <ShellIcon name="camera-outline" />
      </ShellControl>
      <ShellControl accessibilityLabel={recording ? 'Arrêter l’enregistrement' : voiceBusy ? 'Préparation du microphone' : 'Parler à RAFI'}
        accessibilityState={{ selected: recording, busy: voiceBusy, disabled: voiceBusy }} disabled={voiceBusy}
        onPress={onVoice} style={styles.voice}>
        <ShellIcon name={recording ? 'stop-outline' : 'mic-outline'} color={semanticColors.text.inverse} />
      </ShellControl>
    </View>
    {message ? <FixeoText accessibilityLiveRegion="polite" variant="supporting" tone="secondary" style={styles.message}>{message}</FixeoText> : null}
  </View>;
}
const styles = StyleSheet.create({
  root: { gap: space.sm, width: '100%' },
  rail: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, padding: space.xs,
    borderRadius: radii.floating, backgroundColor: semanticColors.background.surface, ...depth.raised },
  write: { flex: 1, minWidth: 0, alignItems: 'flex-start', paddingHorizontal: space.xs },
  prompt: { flexShrink: 1, width: '100%' },
  voice: { backgroundColor: semanticColors.background.focus, borderRadius: radii.control },
  message: { textAlign: 'center' },
});
