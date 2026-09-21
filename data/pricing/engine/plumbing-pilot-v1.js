/* Approved plumbing pilot. Shared qualification/copy; prices are enforced server-side. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FixeoPlumbingPilot=factory();})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 var services={
  'plomberie.diagnostic':{label:'Diagnostic plomberie seul',vap_minor:16000,work:'PLUMB_DIAGNOSTIC',scope:'Contrôle visuel et vérifications simples d’un problème accessible, avec explication. Sans réparation, recherche instrumentée, démontage lourd, ouverture de mur, rapport certifié ni seconde visite.'},
  'plomberie.fuite_simple':{label:'Fuite simple visible',vap_minor:22000,work:'PLUMB_LEAK',scope:'Un raccord sanitaire visible et accessible : resserrage ou joint standard, puis contrôle d’étanchéité. Petits consommables inclus jusqu’à 50 DH. Sans remplacement de tuyau, flexible ou robinet, corrosion, soudure, chauffe-eau, gaz ni réseau collectif.'},
  'plomberie.debouchage_evier':{label:'Débouchage simple évier ou lavabo',vap_minor:22000,work:'PLUMB_SINK',scope:'Un évier ou lavabo : siphon accessible, nettoyage, remontage et débouchage manuel local avec essai d’écoulement. Sans remplacement de siphon, équipement motorisé, ouverture d’accès, colonne collective, plusieurs équipements refoulants ni échec préalable d’un professionnel.'},
  'plomberie.debouchage_wc_simple':{label:'Débouchage simple WC',vap_minor:27000,work:'PLUMB_WC',scope:'Un WC classique, sans broyeur : obstruction isolée traitable manuellement, avec essai d’écoulement. Sans dépose du WC, extraction spéciale d’objet, matériel motorisé, réseau collectif, plusieurs refoulements ni échec préalable d’un professionnel.'},
  'plomberie.robinet_remplacement':{label:'Remplacement robinet fourni par le client',vap_minor:22000,work:'PLUMB_TAP',parts:true,scope:'Un mitigeur standard posé sur évier ou lavabo, fourni compatible par le client : dépose, pose et essai. Raccordements existants compatibles, accessibles et non grippés ; petits consommables inclus jusqu’à 50 DH. Sans flexible ou vanne à remplacer, robinet mural ou thermostatique ni modification de tuyauterie.'},
  'plomberie.chasse_eau':{label:'Mécanisme de chasse fourni par le client',vap_minor:27000,work:'PLUMB_CISTERN',parts:true,scope:'Un WC au sol à réservoir apparent intact : mécanisme standard compatible fourni par le client, pose, réglage et essai. Alimentation et robinet d’arrêt en bon état ; petits consommables inclus jusqu’à 30 DH. Sans WC suspendu, réservoir encastré, fissure ni mécanisme propriétaire.'}
 };
 var prompts={
  plumbing_scope:'Le besoin concerne-t-il un seul équipement accessible, sans canalisation encastrée ni réseau collectif ?',
  plumbing_access:'La zone est-elle accessible et sécurisée, sans inondation en cours ni risque électrique, avec arrivée d’eau pouvant être fermée sans difficulté ?',
  plumbing_parts:'Disposez-vous déjà de la pièce neuve compatible (robinet ou mécanisme), sans achat ni adaptation à prévoir ?'
 };
 var labels={LOCAL_ACCESSIBLE:'Oui, un seul équipement accessible',PLUMB_ACCESS_READY:'Oui, accès sûr et eau isolable',PLUMB_CLIENT_PART:'Oui, pièce compatible déjà disponible',COMPLEX:'Non, le besoin dépasse ce périmètre',UNKNOWN:'Je ne sais pas'};
 Object.keys(services).forEach(function(code){var s=services[code];s.total_minor=s.vap_minor+6000;s.inputs={plumbing_scope:'LOCAL_ACCESSIBLE',plumbing_access:'PLUMB_ACCESS_READY',plumbing_work:s.work};if(s.parts)s.inputs.plumbing_parts='PLUMB_CLIENT_PART';labels[s.work]='Oui, ce périmètre correspond exactement';prompts[s.work]=s.scope+' Est-ce bien votre besoin ?';});
 function questions(code){var s=services[code];return Object.keys(s.inputs).map(function(k){var key=k==='plumbing_work'?s.work:k;return {input_id:k,priority:'ROUTING_BOUNDARY',answer_type:'enum',options:[s.inputs[k],'COMPLEX','UNKNOWN'],prompt_key:key,prompt_fr:prompts[key]};});}
 return {version:'plumbing-pilot-v1',services:services,prompts:prompts,labels:labels,questions:questions};
});
