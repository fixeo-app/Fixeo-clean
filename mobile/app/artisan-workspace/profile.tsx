import { ArtisanProfileChecklist } from '@/components/ArtisanProfileChecklist';
import { CityZonesField } from '@/components/CityField';
import { ServiceField } from '@/components/ServiceField';
import { canonicalCity } from '@/lib/clientLocation';
import { useState } from 'react';
import { Image, View } from 'react-native';
import { loadArtisanProfile, artisanProfileCities, saveArtisanProfile, saveArtisanBio, type ArtisanProfile } from '@/lib/artisanOS';
import { availabilityLabels } from '@/lib/artisanExperience';
import { equalDraft } from '@/lib/sectionDraft';
import { useSectionDraft } from '@/lib/useSectionDraft';
import { useUnsavedChanges } from '@/lib/useUnsavedChanges';
import { ArtisanPage, ArtisanSection, ArtisanChoices, ArtisanField, ArtisanMessage, useArtisanQuery, useArtisanAction, art } from '@/components/ArtisanEditorial';
import { FixeoText } from '@/ui/FixeoText';
import { FixeoAction } from '@/ui/FixeoAction';
const activityOf=(p:ArtisanProfile | null | undefined)=>({services:p?.services?.length?p.services:p?.service_category?[p.service_category]:[],cities:p?artisanProfileCities(p).map(value=>canonicalCity(value)||value):[]});
const load=async()=>({profile:await loadArtisanProfile()});
export default function Profile() {
  const q=useArtisanQuery(load), a=useArtisanAction(), p=q.data?.profile;
  const [section,setSection]=useState('contact'), [attempted,setAttempted]=useState(false);
  const scope=p?`${p.owner_user_id}:${p.id}`:'';
  const contact=useSectionDraft(scope,p?.phone_public || ''), activity=useSectionDraft(scope,activityOf(p)), bio=useSectionDraft(scope,p?.description || '');
  const dirty=contact.dirty||activity.dirty||bio.dirty;
  useUnsavedChanges(dirty);
  const current=section==='contact'?contact:section==='activity'?activity:bio;
  const phoneError=!/^(?:0[5-7][0-9]{8}|(?:\+?212)[5-7][0-9]{8})$/.test(contact.value.replace(/[\s.-]/g,''))?'Renseignez un numéro marocain valide.':'';
  async function saveSection() {
    setAttempted(true);
    if(!p || current.conflict || a.busy)return;
    if(section==='contact' && phoneError)return;
    if(section==='activity' && (!activity.value.services.length || !activity.value.cities.length))return;
    if(section==='bio' && Array.from(bio.value).length>4000)return;
    await a.run(async()=>{
      const latest=await loadArtisanProfile();
      if(!latest || latest.id!==p!.id || latest.owner_user_id!==p!.owner_user_id)throw Error('ARTISAN_REQUIRED');
      const remote=section==='contact'?latest.phone_public || '':section==='activity'?activityOf(latest):latest.description || '';
      if(!equalDraft(remote,current.baseline)){await q.reload();throw Error('PROFILE_VERSION_CONFLICT');}
      if(section==='bio'){
        const confirmed=await saveArtisanBio(bio.value);bio.confirm(confirmed.description);
      } else {
        const previous={phone:latest.phone_public || '',...activityOf(latest)};
        const input=section==='contact'?{...previous,phone:contact.value}:{...previous,...activity.value};
        await saveArtisanProfile(input,previous);
        const confirmed=await loadArtisanProfile();
        if(!confirmed || confirmed.id!==latest.id)throw Error('PROFILE_UPDATE_FAILED');
        if(section==='contact')contact.confirm(confirmed.phone_public || '');else activity.confirm(activityOf(confirmed));
      }
      setAttempted(false);await q.reload();return true;
    },'Section enregistrée.');
  }
  return <ArtisanPage title="Mon profil" eyebrow="ARTISAN" activeKey="profile" rafi={a.rafi} loading={q.loading} transactional={section!=='reputation'} onRefresh={()=>void q.reload()}>
    <ArtisanMessage message={q.error||a.message} retry={q.error?()=>void q.reload():undefined} />
    {p && <>
      <FixeoText variant="heading">{p.name || 'Artisan FIXEO'}</FixeoText><FixeoText tone="secondary">{p.city} · {availabilityLabels[p.availability] || 'À définir'}</FixeoText>
      {p.verified && <FixeoText>Profil vérifié par FIXEO</FixeoText>}
      <ArtisanChoices label="Section du profil" value={section} onChange={value=>{setSection(value);setAttempted(false);a.setMessage('');}} options={[{value:'contact',label:'Coordonnées'},{value:'activity',label:'Métiers et zones'},{value:'bio',label:'Présentation'},{value:'reputation',label:'Réputation et galerie'}]} />
      {dirty && <FixeoText accessibilityLiveRegion="polite">Des modifications ne sont pas encore enregistrées.</FixeoText>}
      {section!=='reputation' && <>
        {current.conflict && <ArtisanSection label="INFORMATIONS SERVEUR MODIFIÉES"><FixeoText accessibilityRole="alert">Votre saisie est conservée. Choisissez la version à garder avant d’enregistrer cette section.</FixeoText>
          <FixeoAction label="Reprendre les informations serveur" variant="secondary" onPress={current.acceptRemote} />
          <FixeoAction label="Conserver explicitement ma saisie" variant="ghost" onPress={current.reapply} />
        </ArtisanSection>}
        {section==='contact' && <ArtisanField label="Téléphone professionnel" value={contact.value} onChangeText={value=>{contact.edit(value);a.setMessage('');}} keyboardType="phone-pad" editable={!a.busy} error={attempted?phoneError:undefined} />}
        {section==='activity' && <>
          <ServiceField multiple values={activity.value.services} onChange={services=>activity.edit({...activity.value,services})} disabled={a.busy} />
          <CityZonesField values={activity.value.cities} onChange={cities=>activity.edit({...activity.value,cities})} disabled={a.busy} />
          {attempted && (!activity.value.services.length||!activity.value.cities.length) && <FixeoText accessibilityRole="alert">Choisissez au moins un métier et une ville.</FixeoText>}
        </>}
        {section==='bio' && <ArtisanField label="Présentation professionnelle" value={bio.value} onChangeText={value=>{bio.edit(value);a.setMessage('');}} multiline maxLength={4000} hint={`${Array.from(bio.value).length} / 4 000 caractères`} editable={!a.busy} placeholder="Votre expérience et votre façon de travailler." />}
        <FixeoAction label={section==='contact'?'Enregistrer mes coordonnées':section==='activity'?'Enregistrer mes métiers et zones':'Enregistrer ma présentation'} busy={a.busy} disabled={!current.dirty||current.conflict} onPress={()=>void saveSection()} />
        {current.dirty && <FixeoAction label="Annuler les modifications de cette section" variant="ghost" disabled={a.busy} onPress={current.acceptRemote} />}
      </>}
      {section==='reputation' && <>
        <ArtisanProfileChecklist profile={p} />
        <ArtisanSection label="RÉPUTATION & PERFORMANCE">
          {[["Missions terminées",p.completed_missions],["Note",p.review_count&&p.rating?p.rating:null],["Temps de réponse (min)",p.response_time_min],["Taux d’acceptation",null],["Fiabilité",null]].map(([label,value])=><View key={String(label)} style={art.row}><FixeoText>{label}</FixeoText><FixeoText tone={value==null?'secondary':'primary'}>{value==null?'Données non disponibles':String(value)}</FixeoText></View>)}
          {p.badge_label && <FixeoText>{p.badge_label}</FixeoText>}
        </ArtisanSection>
        <ArtisanSection label="GALERIE">{p.photo_url && /^https:\/\//.test(p.photo_url)?<Image source={{uri:p.photo_url}} style={{width:'100%',height:200,borderRadius:18}} resizeMode="cover" accessibilityLabel="Photo du profil Artisan" />:<FixeoText tone="secondary">Aucune photo de réalisation n’est encore disponible ici.</FixeoText>}</ArtisanSection>
      </>}
    </>}
    {q.data && !p && <FixeoText>Votre compte ne possède pas encore de profil Artisan.</FixeoText>}
  </ArtisanPage>;
}
