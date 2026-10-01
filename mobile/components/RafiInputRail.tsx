import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

type RafiLanguage='fr-FR'|'ar-MA';

type Props = {
  onVoiceReady: (uri: string, language: RafiLanguage) => void;
  onPhotoReady: (uri: string) => void;
};

export function RafiInputRail({ onVoiceReady, onPhotoReady }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [language,setLanguage]=useState<RafiLanguage>('fr-FR');
  const [message, setMessage] = useState('');

  async function toggleVoice() {
    if (recorderState.isRecording) {
      await recorder.stop();
      if (recorder.uri) {
        setMessage('Enregistrement prêt.');
        onVoiceReady(recorder.uri, language);
      }
      return;
    }

    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setMessage('Microphone non autorisé.');
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setMessage(language==='ar-MA' ? 'RAFI kaytsennat…' : 'RAFI écoute…');
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setMessage('Caméra non autorisée.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.72, allowsEditing: false });
    if (!result.canceled && result.assets[0]?.uri) {
      setMessage('Photo prête.');
      onPhotoReady(result.assets[0].uri);
    }
  }

  async function choosePhoto() {
    const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
    if(!permission.granted){
      setMessage('Photothèque non autorisée.');
      return;
    }
    const result=await ImagePicker.launchImageLibraryAsync({
      mediaTypes:['images'],
      quality:0.72,
      allowsEditing:false,
      selectionLimit:1,
    });
    if(!result.canceled && result.assets[0]?.uri){
      setMessage('Photo prête.');
      onPhotoReady(result.assets[0].uri);
    }
  }

  return (
    <View>
      <View style={styles.languages}>
        <Pressable onPress={()=>setLanguage('fr-FR')} style={[styles.lang,language==='fr-FR'&&styles.langActive]}><Text>FR</Text></Pressable>
        <Pressable onPress={()=>setLanguage('ar-MA')} style={[styles.lang,language==='ar-MA'&&styles.langActive]}><Text>دارجة</Text></Pressable>
      </View>
      <View style={styles.row}>
        <Pressable style={styles.mode} onPress={() => void toggleVoice()}>
          <Text>{recorderState.isRecording ? '⏹ Arrêter' : '🎙 Parler'}</Text>
        </Pressable>
        <Pressable style={styles.mode} onPress={() => void takePhoto()}>
          <Text>📷 Caméra</Text>
        </Pressable>
        <Pressable style={styles.mode} onPress={() => void choosePhoto()}>
          <Text>🖼 Photo</Text>
        </Pressable>
      </View>
      {!!message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  languages:{flexDirection:'row',alignSelf:'center',gap:6,marginBottom:8},
  lang:{paddingHorizontal:12,paddingVertical:6,borderRadius:20,borderWidth:1,borderColor:'#ddd'},
  langActive:{borderWidth:2},
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  mode: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 14 },
  message: { textAlign: 'center', marginTop: 8, opacity: 0.65 },
});
