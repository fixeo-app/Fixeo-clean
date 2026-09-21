/* Owner-approved electricity pilot. Customer scope and professional checks are separate. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FixeoElectricityPilot=factory();})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 var services={
  'electricite.diagnostic':{label:'Diagnostic électrique local — 45 minutes maximum',vap_minor:18000,work:'ELEC_DIAGNOSTIC',scope:'Un problème électrique local dans un logement : recherche non invasive jusqu’à 45 minutes sur place, mesures appropriées et explication. Résultat non garanti. Sans réparation, pièce, audit complet, certification, rapport réglementaire, recherche destructive ni seconde visite.'},
  'electricite.prise_remplacement':{label:'Remplacement d’une prise standard fournie par le client',vap_minor:20000,work:'ELEC_OUTLET',scope:'Une prise intérieure standard au même emplacement, fournie par le client. Boîtier et câblage existants réutilisables après contrôle professionnel. Sans prise spécialisée, circuit neuf, saignée, déplacement de prise ni réparation de terre ou de câblage.'},
  'electricite.interrupteur_remplacement.simple':{label:'Remplacement d’un interrupteur simple fourni par le client',vap_minor:20000,work:'ELEC_SWITCH',scope:'Un interrupteur standard commandant un circuit depuis un seul point, fourni par le client et remplacé au même emplacement. Sans variateur, appareil connecté, programmation ni modification de circuit.'},
  'electricite.interrupteur_remplacement.va_et_vient':{label:'Va-et-vient — remplacement des deux interrupteurs',vap_minor:24000,work:'ELEC_TWO_WAY',scope:'Les deux interrupteurs existants commandant un même éclairage, fournis par le client : remplacement et essai des deux commandes. Sans création de va-et-vient, ajout de point, recâblage, télérupteur ni commande depuis plus de deux endroits.'},
  'electricite.luminaire_installation':{label:'Pose d’un plafonnier ou d’une applique simple',vap_minor:22000,work:'ELEC_LIGHT',scope:'Un plafonnier ou une applique simple fourni par le client, de 3 kg maximum, posé à 2,80 m maximum sur fixation existante adaptée et réutilisable et point électrique fonctionnel. Dépose simple incluse. Sol stable et dégagé, sans escalier. Sans lustre, spots encastrés, fixation structurelle nouvelle, extérieur ni programmation.'},
  'electricite.disjoncteur_remplacement':{label:'Remplacement d’un disjoncteur divisionnaire simple',vap_minor:25000,work:'ELEC_MCB',scope:'Un disjoncteur divisionnaire modulaire simple fourni par le client, dans un tableau résidentiel privé monophasé. Défaut propre à l’appareil et compatibilité à confirmer par l’artisan avant travaux. Sans différentiel, câblage ou peigne à réparer, tableau complet, triphasé ni équipement du distributeur. Déclenchements répétés ou cause incertaine : diagnostic préalable.'}
 };
 var prompts={
  electricity_safety:'Sans toucher ni ouvrir l’installation : voyez-vous de la fumée, des étincelles, des traces de chauffe, un fil dénudé accessible ou de l’eau près d’un équipement électrique, ou sentez-vous une odeur de brûlé ?',
  electricity_operator:'Le besoin concerne-t-il l’installation privée du logement, hors compteur et équipement scellé du distributeur ? Ne démontez rien pour répondre.',
  electricity_access:'S’agit-il d’un logement, avec zone intérieure accessible, sèche et dégagée, sans accès spécial ni travaux sur un réseau collectif ?',
  electricity_parts:'La pièce neuve est-elle déjà disponible chez vous, sans achat à prévoir ? Sa compatibilité sera vérifiée par l’artisan ; n’ouvrez rien pour la contrôler.',
  electricity_fault:'Sans ouvrir le tableau : le disjoncteur est-il manifestement cassé, ou saute-t-il de façon répétée / pour une raison inconnue ?',
  electricity_light_limits:'Le luminaire pèse-t-il au plus 3 kg et son point de pose est-il à 2,80 m maximum, sur fixation existante, sans escalier ? Répondez sans monter ni démonter.'
 };
 var labels={ELEC_NO_DANGER:'Non, aucun de ces signes apparents',ELEC_DANGER:'Oui, au moins un de ces signes',ELEC_PRIVATE:'Oui, installation privée du logement',ELEC_DISTRIBUTOR:'Non, compteur ou équipement du distributeur',ELEC_ACCESS_READY:'Oui, accès intérieur simple et dégagé',ELEC_PART_AVAILABLE:'Oui, pièce déjà disponible',ELEC_BROKEN_DEVICE:'Appareil manifestement cassé ; à vérifier par l’artisan',ELEC_TRIPS_OR_UNKNOWN:'Il saute ou la cause est incertaine',ELEC_LIGHT_LIMITS:'Oui, 3 kg et 2,80 m maximum, accès simple',COMPLEX:'Non, le besoin dépasse ce périmètre',UNKNOWN:'Je ne sais pas'};
 var professionalPrompts={
  scope_verified:'J’ai vérifié sur place le nombre d’appareils et toutes les limites du périmètre décrit.',
  safe_work_verified:'J’ai contrôlé l’absence de danger et la possibilité de travailler hors tension ; aucune intervention sur un équipement du distributeur.',
  installation_verified:'J’ai vérifié les conducteurs, les raccordements et les protections nécessaires. Aucune remise en état électrique supplémentaire n’est requise.',
  part_verified:'J’ai vérifié la compatibilité de la pièce fournie par le client et, pour un luminaire, la fixation adaptée et les protections requises.',
  fault_verified:'Pour un disjoncteur : j’ai confirmé le défaut propre à l’appareil, sa spécification appropriée et l’absence de panne en aval. Aucun changement de calibre pour masquer un déclenchement.'
 };
 Object.keys(services).forEach(function(code){var s=services[code];s.total_minor=s.vap_minor+6000;s.parts=code!=='electricite.diagnostic';
  s.inputs={electricity_safety:'ELEC_NO_DANGER',electricity_operator:'ELEC_PRIVATE',electricity_access:'ELEC_ACCESS_READY'};
  if(s.work==='ELEC_MCB')s.inputs.electricity_fault='ELEC_BROKEN_DEVICE';
  s.inputs.electricity_work=s.work;
  if(s.work==='ELEC_LIGHT')s.inputs.electricity_light_limits='ELEC_LIGHT_LIMITS';
  if(s.parts)s.inputs.electricity_parts='ELEC_PART_AVAILABLE';
  s.professional_checks=s.parts?{scope_verified:true,safe_work_verified:true,installation_verified:true,part_verified:true}:{};
  if(s.work==='ELEC_MCB')s.professional_checks.fault_verified=true;
  labels[s.work]='Oui, c’est le besoin décrit, sous contrôle de l’artisan';prompts[s.work]=s.scope+' Est-ce votre besoin ?';
 });
 function questions(code){var s=services[code];return Object.keys(s.inputs).map(function(k){var key=k==='electricity_work'?s.work:k;
  var opts=[s.inputs[k],'COMPLEX','UNKNOWN'];
  if(k==='electricity_safety')opts=['ELEC_NO_DANGER','ELEC_DANGER','UNKNOWN'];
  if(k==='electricity_operator')opts=['ELEC_PRIVATE','ELEC_DISTRIBUTOR','UNKNOWN'];
  if(k==='electricity_fault')opts=['ELEC_BROKEN_DEVICE','ELEC_TRIPS_OR_UNKNOWN','UNKNOWN'];
  return {input_id:k,priority:k==='electricity_safety'?'SAFETY':'ROUTING_BOUNDARY',answer_type:'enum',options:opts,prompt_key:key,prompt_fr:prompts[key]};
 });}
 function truth(v){return v===true||v==='true'||v==='True';}
 function guard(code,inputs,partial){var s=services[code];if(!s)return null;inputs=inputs||{};
  function fail(status,reason_code,reason){return {status:status,reason_code:reason_code,reason:reason};}
  if(inputs.electricity_safety==='ELEC_DANGER'||['burning_smell','scorch_marks','active_moisture','smoke','sparks','exposed_live_wires','water_near_electricity'].some(function(k){return truth(inputs[k]);}))return fail('STOP_SAFETY','ELECTRIC_DANGER','Un danger électrique a été signalé. Ne touchez pas l’installation. Une prise en charge adaptée est nécessaire ; aucun forfait ordinaire ne peut être réservé.');
  if(inputs.electricity_operator==='ELEC_DISTRIBUTOR'||truth(inputs.distributor_equipment_involved))return fail('ROUTE','ELECTRIC_DISTRIBUTOR','Contactez le distributeur d’électricité de votre localité pour le compteur ou son équipement. Aucun diagnostic FIXEO n’est facturé pour cette orientation.');
  if(inputs.electricity_safety==='UNKNOWN')return fail('STOP_SAFETY','ELECTRIC_SAFETY_UNCERTAIN','La sécurité de la zone n’est pas confirmée. Ne touchez pas l’installation ; faites préciser la situation avant toute réservation.');
  if(inputs.electricity_operator==='UNKNOWN')return fail('ROUTE','ELECTRIC_OPERATOR_UNCERTAIN','Faites confirmer le périmètre privé ou distributeur par FIXEO avant de réserver, sans ouvrir l’installation.');
  if(truth(inputs.ddr_rcd_involved)||truth(inputs.three_phase_circuit)||truth(inputs.multiple_mcbs_defective))return fail('QUOTE_REQUIRED','ELECTRIC_COMPLEX','Cette intervention dépasse le périmètre électrique standard. Un devis préalable est nécessaire.');
  if(s.work==='ELEC_MCB'&&(inputs.electricity_fault==='ELEC_TRIPS_OR_UNKNOWN'||inputs.electricity_fault==='UNKNOWN'||inputs.mcb_defect_confirmed==='trips_repeatedly'||inputs.mcb_defect_confirmed==='not_confirmed'||truth(inputs.mcb_trips_repeatedly)||truth(inputs.cause_unknown)))return fail('ROUTE','ELECTRIC_DIAGNOSTIC_FIRST','Un disjoncteur qui saute ne doit pas être remplacé sans recherche de la cause. Commencez par un diagnostic électrique, sans réparation ni pièce incluse.');
  var counts={item_count:s.work==='ELEC_TWO_WAY'?2:1,outlet_count:1,fixture_count:1,mcb_count:1,switch_count:s.work==='ELEC_TWO_WAY'?2:1};
  for(var count of Object.keys(counts))if(inputs[count]!==undefined&&inputs[count]!==counts[count])return fail('QUOTE_REQUIRED','ELECTRIC_BATCH','Plusieurs équipements ou un nombre différent du forfait nécessitent un devis préalable.');
  if(s.work==='ELEC_LIGHT')for(var measure of ['fixture_weight_kg','fixture_height_m','installation_height_m'])if(inputs[measure]!==undefined&&(typeof inputs[measure]!=='number'||!Number.isFinite(inputs[measure])||inputs[measure]<=0||inputs[measure]>(measure==='fixture_weight_kg'?3:2.8)))return fail('QUOTE_REQUIRED','ELECTRIC_LIGHT_LIMIT','Le luminaire dépasse les limites du forfait ou ses dimensions ne sont pas confirmées.');
  for(var k of Object.keys(s.inputs)){if(inputs[k]===undefined&&partial)continue;if(inputs[k]!==s.inputs[k])return fail(inputs[k]===undefined?'REQUALIFY':'QUOTE_REQUIRED','ELECTRIC_SCOPE_UNCONFIRMED','Confirmez le périmètre électrique. Toute réponse inconnue ou hors forfait nécessite une qualification ou un devis avant travaux.');}
  return null;
 }
 return {version:'electricity-pilot-v1',services:services,prompts:prompts,labels:labels,professionalPrompts:professionalPrompts,questions:questions,guard:guard};
});
