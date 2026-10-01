import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { EnterpriseSpace, resolveWorkspaces, WorkspaceResolution } from '@/lib/workspaces';

function globalDestination(role: WorkspaceResolution['global_role']) {
  if (role === 'artisan') return '/artisan' as const;
  return '/' as const;
}

export default function Spaces() {
  const [resolution,setResolution]=useState<WorkspaceResolution|null>(null);
  const [error,setError]=useState('');

  useEffect(()=>{
    void resolveWorkspaces().then(setResolution).catch(()=>setError('Impossible d’ouvrir vos espaces.'));
  },[]);

  function openEnterprise(space: EnterpriseSpace) {
    router.push({ pathname:'/enterprise', params:{ enterpriseId:space.enterprise_id } });
  }

  return <View style={styles.root}>
    <Text style={styles.brand}>FIXEO</Text>
    <Text style={styles.title}>Vos espaces</Text>
    {!!error && <Text>{error}</Text>}
    {resolution && <>
      <Pressable style={styles.card} onPress={()=>router.replace(globalDestination(resolution.global_role))}>
        <Text style={styles.heading}>Espace {resolution.global_role === 'artisan' ? 'Artisan' : resolution.global_role === 'admin' ? 'Admin' : 'Client'}</Text>
        <Text>Votre espace FIXEO personnel</Text>
      </Pressable>
      {resolution.enterprise_spaces.map(space=>(
        <Pressable key={space.enterprise_id} style={styles.card} onPress={()=>openEnterprise(space)}>
          <Text style={styles.heading}>{space.enterprise_name}</Text>
          <Text>FIXEO Entreprise · {space.member_role.replaceAll('_',' ')}</Text>
        </Pressable>
      ))}
    </>}
  </View>;
}

const styles=StyleSheet.create({
  root:{flex:1,padding:24,paddingTop:70,gap:14},
  brand:{fontWeight:'800',letterSpacing:3},
  title:{fontSize:30,fontWeight:'800',marginBottom:8},
  card:{borderWidth:1,borderColor:'#ddd',borderRadius:18,padding:18,gap:4},
  heading:{fontSize:19,fontWeight:'700'},
});
