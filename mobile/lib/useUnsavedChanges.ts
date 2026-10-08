import { onSessionRejected } from './authEvents';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation, usePreventRemove, type NavigationAction } from '@react-navigation/native';
/** Native-stack removal guard; keeping the edit never dispatches a navigation action. */
export function useUnsavedChanges(dirty: boolean, durable = false) {
  const navigation=useNavigation();
  const revoked=useRef(false); const [invalid,setInvalid]=useState(false);
  useEffect(()=>onSessionRejected(()=>{revoked.current=true;setInvalid(true);}),[]);
  const [leaving,setLeaving]=useState<NavigationAction | null>(null);
  usePreventRemove(dirty && !leaving && !invalid, ({data})=>{if(revoked.current){setLeaving(data.action);return;}Alert.alert('Saisie non enregistrée',durable ? 'Votre copie est conservée sur cet appareil. Vous pourrez vérifier l’état serveur à votre retour.' : 'Gardez cet écran pour conserver vos modifications, ou abandonnez-les explicitement.',[
    {text:'Continuer la saisie',style:'cancel'},
    {text:durable?'Quitter, brouillon conservé':'Abandonner ces modifications',style:durable?'default':'destructive',onPress:()=>setLeaving(data.action)},
  ]);});
  useEffect(()=>{if(leaving)navigation.dispatch(leaving);},[leaving,navigation]);
}
