import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { EnterpriseSpace, resolveWorkspaces } from '@/lib/workspaces';

export default function EnterpriseShell() {
  const { enterpriseId } = useLocalSearchParams<{enterpriseId?:string}>();
  const [space,setSpace]=useState<EnterpriseSpace|null>(null);
  const [error,setError]=useState('');

  useEffect(()=>{
    void resolveWorkspaces().then(result=>{
      const found=result.enterprise_spaces.find(item=>item.enterprise_id===enterpriseId);
      if (!found) {
        setError('Accès Entreprise non autorisé.');
        return;
      }
      setSpace(found);
    }).catch(()=>setError('Accès Entreprise indisponible.'));
  },[enterpriseId]);

  useEffect(()=>{
    if (error) {
      const timer=setTimeout(()=>router.replace('/spaces'),1200);
      return ()=>clearTimeout(timer);
    }
  },[error]);

  return <View style={styles.root}>
    <Text style={styles.kicker}>FIXEO ENTREPRISE</Text>
    {space ? <>
      <Text style={styles.title}>{space.enterprise_name}</Text>
      <Text>Rôle · {space.member_role.replaceAll('_',' ')}</Text>
      <Text style={styles.note}>Le shell terrain est prêt. Les fonctions Site / Équipement / QR arriveront dans M6.</Text>
    </> : <Text>{error || 'Ouverture de votre espace…'}</Text>}
  </View>;
}

const styles=StyleSheet.create({
  root:{flex:1,padding:24,paddingTop:70,gap:12},
  kicker:{fontWeight:'800',letterSpacing:2},
  title:{fontSize:30,fontWeight:'800'},
  note:{marginTop:20,opacity:.65},
});
