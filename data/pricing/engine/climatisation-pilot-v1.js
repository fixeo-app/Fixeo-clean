/* Owner-approved HVAC pilot. Professional attestations are never client answers. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FixeoClimatisationPilot=factory();})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 var services={
  "climatisation.diagnostic": {
    "label": "Diagnostic climatisation — 45 minutes maximum",
    "scope": "Un problème sur un mono-split mural résidentiel : examen non destructif, contrôles professionnels compatibles avec le matériel et compte rendu oral, jusqu’à 45 minutes sur place. Sans réparation, recharge, ouverture du circuit frigorifique ni garantie de localisation de la panne.",
    "vap_minor": 20000,
    "materials_minor": 0,
    "commission_minor": 6000,
    "total_minor": 26000,
    "inputs": {
      "clim_safety": "CLIM_NO_DANGER",
      "clim_system": "CLIM_WALL_MONOSPLIT",
      "clim_count": "CLIM_ONE",
      "clim_capacity": "CLIM_7000_24000",
      "clim_access": "CLIM_SAFE_ACCESS",
      "clim_work": "CLIM_DIAGNOSTIC"
    },
    "capacity": [
      7000,
      24000
    ],
    "installation": false,
    "followup": false,
    "professional_checks": {},
    "offer_checks": {}
  },
  "climatisation.entretien_annuel": {
    "label": "Entretien courant — un climatiseur",
    "scope": "Un appareil fonctionnel : filtres lavables, surfaces et échangeurs accessibles sans dépose lourde, contrôle de l’évacuation accessible et essai. Produits compatibles et protection de la zone inclus. Sans recharge, réparation, extraction de turbine ni désinfection garantie.",
    "vap_minor": 24000,
    "materials_minor": 0,
    "commission_minor": 6000,
    "total_minor": 30000,
    "inputs": {
      "clim_safety": "CLIM_NO_DANGER",
      "clim_system": "CLIM_WALL_MONOSPLIT",
      "clim_count": "CLIM_ONE",
      "clim_capacity": "CLIM_7000_24000",
      "clim_access": "CLIM_SAFE_ACCESS",
      "clim_condition": "CLIM_FUNCTIONING",
      "clim_work": "CLIM_ROUTINE"
    },
    "capacity": [
      7000,
      24000
    ],
    "installation": false,
    "followup": true,
    "professional_checks": {
      "scope_verified": true,
      "safe_access_verified": true,
      "safe_work_verified": true,
      "equipment_identified": true,
      "cleaning_products_compatible": true,
      "electrical_components_protected": true
    },
    "offer_checks": {}
  },
  "climatisation.desinfection_profonde": {
    "label": "Nettoyage approfondi — un climatiseur",
    "scope": "Entretien courant plus nettoyage humide approfondi de l’échangeur intérieur, turbine en place et bac accessible, avec protection de collecte et produit compatible. Sans séparation du circuit frigorifique, extraction de turbine, démontage lourd ni promesse sanitaire ou de désinfection certifiée.",
    "vap_minor": 39000,
    "materials_minor": 0,
    "commission_minor": 6000,
    "total_minor": 45000,
    "inputs": {
      "clim_safety": "CLIM_NO_DANGER",
      "clim_system": "CLIM_WALL_MONOSPLIT",
      "clim_count": "CLIM_ONE",
      "clim_capacity": "CLIM_7000_24000",
      "clim_access": "CLIM_SAFE_ACCESS",
      "clim_condition": "CLIM_FUNCTIONING",
      "clim_work": "CLIM_DEEP_CLEAN"
    },
    "capacity": [
      7000,
      24000
    ],
    "installation": false,
    "followup": true,
    "professional_checks": {
      "scope_verified": true,
      "safe_access_verified": true,
      "safe_work_verified": true,
      "equipment_identified": true,
      "deep_clean_access_verified": true,
      "cleaning_products_compatible": true,
      "electrical_components_protected": true
    },
    "offer_checks": {}
  },
  "climatisation.installation.standard": {
    "label": "Pose mono-split — liaison jusqu’à 3 m, fournitures incluses",
    "scope": "Un mono-split mural neuf de 9 000 à 12 000 BTU fourni par le client, R32 ou R410A, avec unités et notice disponibles. Pose des deux unités, support adapté, deux tubes cuivre isolés suivant le même parcours, câble inter-unités et évacuation gravitaire inclus. Un perçage simple d’une paroi non structurelle de 25 cm maximum, point intérieur à 2,80 m maximum, accès extérieur depuis une surface stable protégée sans travail en façade. Alimentation électrique adaptée existante. Contrôles professionnels, épreuve d’étanchéité adaptée, tirage au vide selon le fabricant et mise en service inclus. Sans appoint de réfrigérant : charge d’usine suffisante à confirmer avant travaux. Sans dépose de l’ancien appareil, circuit électrique neuf, pompe de relevage, goulotte décorative ni carottage structurel. Liaison jusqu’à 3 m de parcours, sans doubler la mesure pour les deux tubes.",
    "vap_minor": 50000,
    "materials_minor": 45000,
    "commission_minor": 7500,
    "total_minor": 102500,
    "inputs": {
      "clim_safety": "CLIM_NO_DANGER",
      "clim_system": "CLIM_WALL_MONOSPLIT",
      "clim_count": "CLIM_ONE",
      "clim_capacity": "CLIM_9000_12000",
      "clim_access": "CLIM_SAFE_ACCESS",
      "clim_unit_supply": "CLIM_CLIENT_NEW_UNIT",
      "clim_route": "CLIM_ROUTE_UP_TO_3M",
      "clim_work": "CLIM_INSTALL_3M"
    },
    "capacity": [
      9000,
      12000
    ],
    "installation": true,
    "followup": false,
    "professional_checks": {
      "scope_verified": true,
      "safe_access_verified": true,
      "safe_work_verified": true,
      "equipment_identified": true,
      "client_equipment_new_and_complete": true,
      "manufacturer_requirements_verified": true,
      "power_and_mounting_verified": true,
      "pipe_length_and_diameter_verified": true,
      "factory_charge_sufficient": true,
      "refrigerant_skills_and_tools_verified": true,
      "supply_package_confirmed_at_fixed_price": true
    },
    "offer_checks": {
      "model_and_scope_confirmed": true,
      "skills_and_tools_confirmed": true,
      "factory_charge_confirmed": true,
      "kit_and_fixed_total_confirmed": true
    }
  },
  "climatisation.installation.mono_split_5m": {
    "label": "Pose mono-split — liaison de plus de 3 m jusqu’à 5 m, fournitures incluses",
    "scope": "Un mono-split mural neuf de 9 000 à 12 000 BTU fourni par le client, R32 ou R410A, avec unités et notice disponibles. Pose des deux unités, support adapté, deux tubes cuivre isolés suivant le même parcours, câble inter-unités et évacuation gravitaire inclus. Un perçage simple d’une paroi non structurelle de 25 cm maximum, point intérieur à 2,80 m maximum, accès extérieur depuis une surface stable protégée sans travail en façade. Alimentation électrique adaptée existante. Contrôles professionnels, épreuve d’étanchéité adaptée, tirage au vide selon le fabricant et mise en service inclus. Sans appoint de réfrigérant : charge d’usine suffisante à confirmer avant travaux. Sans dépose de l’ancien appareil, circuit électrique neuf, pompe de relevage, goulotte décorative ni carottage structurel. Liaison de plus de 3 m jusqu’à 5 m de parcours. Au-delà de 5 m : devis complet préalable.",
    "vap_minor": 60000,
    "materials_minor": 60000,
    "commission_minor": 9000,
    "total_minor": 129000,
    "inputs": {
      "clim_safety": "CLIM_NO_DANGER",
      "clim_system": "CLIM_WALL_MONOSPLIT",
      "clim_count": "CLIM_ONE",
      "clim_capacity": "CLIM_9000_12000",
      "clim_access": "CLIM_SAFE_ACCESS",
      "clim_unit_supply": "CLIM_CLIENT_NEW_UNIT",
      "clim_route": "CLIM_ROUTE_OVER_3_UP_TO_5M",
      "clim_work": "CLIM_INSTALL_5M"
    },
    "capacity": [
      9000,
      12000
    ],
    "installation": true,
    "followup": false,
    "professional_checks": {
      "scope_verified": true,
      "safe_access_verified": true,
      "safe_work_verified": true,
      "equipment_identified": true,
      "client_equipment_new_and_complete": true,
      "manufacturer_requirements_verified": true,
      "power_and_mounting_verified": true,
      "pipe_length_and_diameter_verified": true,
      "factory_charge_sufficient": true,
      "refrigerant_skills_and_tools_verified": true,
      "supply_package_confirmed_at_fixed_price": true
    },
    "offer_checks": {
      "model_and_scope_confirmed": true,
      "skills_and_tools_confirmed": true,
      "factory_charge_confirmed": true,
      "kit_and_fixed_total_confirmed": true
    }
  },
  "climatisation.desinstallation": {
    "label": "Dépose complète — un mono-split accessible",
    "scope": "Dépose des deux unités d’un mono-split mural fonctionnel R32 ou R410A, conservation ou récupération du fluide selon le matériel et la procédure professionnelle adaptée, déconnexion sécurisée, obturation des raccords et de la traversée simple, appareils laissés sur place. Sans rejet volontaire de fluide. Sans transport, évacuation, réinstallation, reprise de peinture, compresseur hors service ou récupération complexe.",
    "vap_minor": 40000,
    "materials_minor": 0,
    "commission_minor": 6000,
    "total_minor": 46000,
    "inputs": {
      "clim_safety": "CLIM_NO_DANGER",
      "clim_system": "CLIM_WALL_MONOSPLIT",
      "clim_count": "CLIM_ONE",
      "clim_capacity": "CLIM_7000_24000",
      "clim_access": "CLIM_SAFE_ACCESS",
      "clim_condition": "CLIM_FUNCTIONING",
      "clim_refrigerant": "CLIM_R32_OR_R410A",
      "clim_work": "CLIM_REMOVE"
    },
    "capacity": [
      7000,
      24000
    ],
    "installation": false,
    "followup": false,
    "professional_checks": {
      "scope_verified": true,
      "safe_access_verified": true,
      "safe_work_verified": true,
      "equipment_identified": true,
      "refrigerant_skills_and_tools_verified": true,
      "safe_refrigerant_handling_verified": true,
      "removal_scope_verified": true
    },
    "offer_checks": {}
  }
};
 var prompts={
  "clim_safety": "Sans toucher ni ouvrir l’appareil : voyez-vous fumée, étincelles, eau sur les parties électriques, un support instable, ou sentez-vous une odeur de brûlé / suspectez-vous une fuite de fluide dangereuse ?",
  "clim_system": "S’agit-il d’un climatiseur mural avec une unité intérieure et une unité extérieure dédiées, dans un logement ?",
  "clim_count": "Cette demande concerne-t-elle un seul climatiseur (une unité intérieure et son unité extérieure) ?",
  "clim_capacity": "Quelle plage de puissance correspond à votre appareil ? Répondez seulement si vous la connaissez, sans grimper ni ouvrir l’appareil.",
  "clim_access": "Les deux unités sont-elles accessibles depuis une surface stable et protégée, sans travail en façade, cordes, nacelle ni manutention spéciale ?",
  "clim_condition": "L’appareil fonctionne-t-il normalement, sans perte de froid, fuite, givre ou bruit anormal ?",
  "clim_unit_supply": "Disposez-vous du climatiseur neuf complet avec ses deux unités et sa notice ? Le kit de pose sera fourni par l’artisan.",
  "clim_refrigerant": "Le fluide R32 ou R410A est-il déjà identifié sur la notice ou une photo disponible ? Ne grimpez pas pour lire une étiquette.",
  "clim_route": "Quelle longueur de parcours entre les deux unités est prévue ? La mesure définitive et la faisabilité seront vérifiées par le professionnel.",
  "CLIM_DIAGNOSTIC": "Un problème sur un mono-split mural résidentiel : examen non destructif, contrôles professionnels compatibles avec le matériel et compte rendu oral, jusqu’à 45 minutes sur place. Sans réparation, recharge, ouverture du circuit frigorifique ni garantie de localisation de la panne. Est-ce votre besoin ?",
  "CLIM_ROUTINE": "Un appareil fonctionnel : filtres lavables, surfaces et échangeurs accessibles sans dépose lourde, contrôle de l’évacuation accessible et essai. Produits compatibles et protection de la zone inclus. Sans recharge, réparation, extraction de turbine ni désinfection garantie. Est-ce votre besoin ?",
  "CLIM_DEEP_CLEAN": "Entretien courant plus nettoyage humide approfondi de l’échangeur intérieur, turbine en place et bac accessible, avec protection de collecte et produit compatible. Sans séparation du circuit frigorifique, extraction de turbine, démontage lourd ni promesse sanitaire ou de désinfection certifiée. Est-ce votre besoin ?",
  "CLIM_INSTALL_3M": "Un mono-split mural neuf de 9 000 à 12 000 BTU fourni par le client, R32 ou R410A, avec unités et notice disponibles. Pose des deux unités, support adapté, deux tubes cuivre isolés suivant le même parcours, câble inter-unités et évacuation gravitaire inclus. Un perçage simple d’une paroi non structurelle de 25 cm maximum, point intérieur à 2,80 m maximum, accès extérieur depuis une surface stable protégée sans travail en façade. Alimentation électrique adaptée existante. Contrôles professionnels, épreuve d’étanchéité adaptée, tirage au vide selon le fabricant et mise en service inclus. Sans appoint de réfrigérant : charge d’usine suffisante à confirmer avant travaux. Sans dépose de l’ancien appareil, circuit électrique neuf, pompe de relevage, goulotte décorative ni carottage structurel. Liaison jusqu’à 3 m de parcours, sans doubler la mesure pour les deux tubes. Est-ce votre besoin ?",
  "CLIM_INSTALL_5M": "Un mono-split mural neuf de 9 000 à 12 000 BTU fourni par le client, R32 ou R410A, avec unités et notice disponibles. Pose des deux unités, support adapté, deux tubes cuivre isolés suivant le même parcours, câble inter-unités et évacuation gravitaire inclus. Un perçage simple d’une paroi non structurelle de 25 cm maximum, point intérieur à 2,80 m maximum, accès extérieur depuis une surface stable protégée sans travail en façade. Alimentation électrique adaptée existante. Contrôles professionnels, épreuve d’étanchéité adaptée, tirage au vide selon le fabricant et mise en service inclus. Sans appoint de réfrigérant : charge d’usine suffisante à confirmer avant travaux. Sans dépose de l’ancien appareil, circuit électrique neuf, pompe de relevage, goulotte décorative ni carottage structurel. Liaison de plus de 3 m jusqu’à 5 m de parcours. Au-delà de 5 m : devis complet préalable. Est-ce votre besoin ?",
  "CLIM_REMOVE": "Dépose des deux unités d’un mono-split mural fonctionnel R32 ou R410A, conservation ou récupération du fluide selon le matériel et la procédure professionnelle adaptée, déconnexion sécurisée, obturation des raccords et de la traversée simple, appareils laissés sur place. Sans rejet volontaire de fluide. Sans transport, évacuation, réinstallation, reprise de peinture, compresseur hors service ou récupération complexe. Est-ce votre besoin ?"
};
 var labels={
  "CLIM_NO_DANGER": "Aucun de ces signes apparents",
  "CLIM_DANGER": "Oui, un danger est apparent ou suspecté",
  "CLIM_WALL_MONOSPLIT": "Oui, un mono-split mural résidentiel",
  "CLIM_ONE": "Un seul appareil",
  "CLIM_7000_24000": "De 7 000 à 24 000 BTU",
  "CLIM_9000_12000": "De 9 000 à 12 000 BTU",
  "CLIM_SAFE_ACCESS": "Oui, accès simple et protégé aux deux unités",
  "CLIM_FUNCTIONING": "Oui, fonctionnement normal",
  "CLIM_PROBLEM": "Non, il présente une panne ou un symptôme",
  "CLIM_CLIENT_NEW_UNIT": "Oui, appareil neuf complet disponible",
  "CLIM_R32_OR_R410A": "R32 ou R410A identifié",
  "CLIM_ROUTE_UP_TO_3M": "Jusqu’à 3 mètres",
  "CLIM_ROUTE_OVER_3_UP_TO_5M": "Plus de 3 mètres, jusqu’à 5 mètres",
  "CLIM_COMPLEX": "Non, le besoin dépasse ce périmètre",
  "UNKNOWN": "Je ne sais pas",
  "CLIM_DIAGNOSTIC": "Oui, ce périmètre correspond à mon besoin",
  "CLIM_ROUTINE": "Oui, ce périmètre correspond à mon besoin",
  "CLIM_DEEP_CLEAN": "Oui, ce périmètre correspond à mon besoin",
  "CLIM_INSTALL_3M": "Oui, ce périmètre correspond à mon besoin",
  "CLIM_INSTALL_5M": "Oui, ce périmètre correspond à mon besoin",
  "CLIM_REMOVE": "Oui, ce périmètre correspond à mon besoin"
};
 var professionalPrompts={
  "scope_verified": "J’ai vérifié sur place le type, la puissance, le nombre d’appareils et tout le périmètre convenu.",
  "safe_access_verified": "J’ai confirmé un accès et une manutention sûrs pour les deux unités, sans équipement spécial ni travail en façade.",
  "safe_work_verified": "J’ai vérifié l’absence de danger et la mise en sécurité nécessaire avant intervention.",
  "equipment_identified": "J’ai identifié le modèle, son état et les prescriptions du fabricant.",
  "cleaning_products_compatible": "Les produits et méthodes de nettoyage sont compatibles avec le matériel.",
  "electrical_components_protected": "Les éléments électriques et la zone de travail seront protégés pendant le nettoyage.",
  "deep_clean_access_verified": "Le nettoyage approfondi est possible avec la turbine en place, sans démontage lourd ni ouverture frigorifique.",
  "client_equipment_new_and_complete": "Le client fournit les deux unités neuves et la notice correspondant au modèle convenu.",
  "manufacturer_requirements_verified": "J’ai vérifié les prescriptions de pose, de longueur, de contrôle, de vide et de mise en service du fabricant.",
  "power_and_mounting_verified": "L’alimentation électrique, les supports et la paroi sont adaptés, sans travaux supplémentaires.",
  "pipe_length_and_diameter_verified": "J’ai mesuré le parcours et vérifié les diamètres, l’isolation, les câbles et l’évacuation nécessaires.",
  "factory_charge_sufficient": "La charge d’usine convient à cette liaison ; aucun appoint de fluide n’est requis.",
  "refrigerant_skills_and_tools_verified": "Je dispose des compétences et équipements adaptés au fluide et à ce matériel.",
  "supply_package_confirmed_at_fixed_price": "Le kit compatible est disponible et je confirme le total accepté sans supplément.",
  "safe_refrigerant_handling_verified": "La conservation ou récupération du fluide est possible selon une méthode adaptée, sans rejet volontaire.",
  "removal_scope_verified": "L’appareil est fonctionnel ; la dépose ne nécessite ni récupération complexe ni transport.",
  "model_and_scope_confirmed": "Avant acceptation : le modèle, la puissance, les photos et le parcours permettent cette pose au forfait.",
  "skills_and_tools_confirmed": "Avant acceptation : je dispose des compétences et outils adaptés au fluide identifié et au matériel.",
  "factory_charge_confirmed": "Avant acceptation : la notice confirme une charge d’usine suffisante pour la liaison prévue.",
  "kit_and_fixed_total_confirmed": "Avant acceptation : j’ai confirmé la disponibilité et le coût du kit compatible et je m’engage sur le total affiché."
};
 function questions(code){var s=services[code];if(!s)return [];return Object.keys(s.inputs).map(function(k){var key=k==='clim_work'?s.inputs[k]:k;var options=[s.inputs[k],'CLIM_COMPLEX','UNKNOWN'];if(k==='clim_safety')options=['CLIM_NO_DANGER','CLIM_DANGER','UNKNOWN'];if(k==='clim_condition')options=['CLIM_FUNCTIONING','CLIM_PROBLEM','UNKNOWN'];return {input_id:k,priority:k==='clim_safety'?'SAFETY':'ROUTING_BOUNDARY',answer_type:'enum',options:options,prompt_key:key,prompt_fr:prompts[key]};});}
 function truth(v){return v===true||v==='true'||v==='True';}
 function guard(code,inputs,partial){if(!/^climatisation\./.test(code||''))return null;inputs=inputs||{};var s=services[code];
  function fail(status,reason_code,reason){return {status:status,reason_code:reason_code,reason:reason};}
  if(inputs.clim_safety==='CLIM_DANGER'||inputs.clim_safety==='UNKNOWN'||['smoke','sparks','burning_smell','water_on_electrics','unstable_support','dangerous_refrigerant_leak','exposed_live_wires'].some(function(k){return truth(inputs[k]);}))return fail('STOP_SAFETY','CLIM_DANGER','La sécurité de la zone n’est pas confirmée. Ne manipulez pas l’appareil. Une prise en charge adaptée est nécessaire avant toute réservation ordinaire.');
  if(['climatisation.recharge_gaz_r22','climatisation.reparation_fuite_recharge'].includes(code))return fail('ROUTE','CLIM_DIAGNOSTIC_FIRST','La cause, le fluide et les travaux nécessaires doivent être identifiés avant un devis. Commencez par un diagnostic ; aucune recharge ni réparation n’est incluse.');
  if(!s)return fail('QUOTE_REQUIRED','CLIM_UNAPPROVED','Cette prestation nécessite un devis et une qualification préalable.');
  if(['multi_split','cassette_or_ducted','facade_inaccessible','reinforced_concrete_gt_25cm','requires_lifting_equipment'].some(function(k){return truth(inputs[k]);}))return fail('QUOTE_REQUIRED','CLIM_COMPLEX','Ce type d’appareil ou cet accès nécessite un devis préalable.');
  if(code!=='climatisation.diagnostic'&&(inputs.clim_condition==='CLIM_PROBLEM'||['no_cooling','abnormal_noise','icing','leak_suspected','compressor_dead'].some(function(k){return truth(inputs[k]);})))return fail('ROUTE','CLIM_DIAGNOSTIC_FIRST','L’appareil présente un problème : un diagnostic précède toute promesse d’entretien, recharge ou dépose standard.');
  if((s.installation||code==='climatisation.desinstallation')&&inputs.refrigerant_type!==undefined&&!['R32','R410A'].includes(inputs.refrigerant_type))return fail('QUOTE_REQUIRED','CLIM_FLUID_UNCONFIRMED','Le matériel et son fluide doivent être confirmés par un professionnel avant le devis.');
  for(var count of ['ac_count','item_count','indoor_unit_count','outdoor_unit_count'])if(inputs[count]!==undefined&&inputs[count]!==1)return fail('QUOTE_REQUIRED','CLIM_COUNT','Le forfait concerne un seul mono-split ; les lots nécessitent un devis.');
  if(inputs.ac_capacity_btu!==undefined&&(typeof inputs.ac_capacity_btu!=='number'||!Number.isFinite(inputs.ac_capacity_btu)||inputs.ac_capacity_btu<s.capacity[0]||inputs.ac_capacity_btu>s.capacity[1]))return fail('QUOTE_REQUIRED','CLIM_CAPACITY','Cette puissance ne correspond pas au forfait choisi.');
  if(s.installation){
   if(['additional_refrigerant_required','client_supplied_kit','used_unit','new_electric_circuit_required','lifting_pump_required'].some(function(k){return truth(inputs[k]);}))return fail('QUOTE_REQUIRED','CLIM_INSTALL_EXTRA','Cette pose nécessite une proposition adaptée avant réservation, sans facturer un kit non fourni ni ajouter de supplément automatique.');
   for(var measure of ['installation_height_m','wall_thickness_cm','copper_length_m'])if(inputs[measure]!==undefined){var n=inputs[measure],max=measure==='installation_height_m'?2.8:measure==='wall_thickness_cm'?25:code.endsWith('mono_split_5m')?5:3;if(typeof n!=='number'||!Number.isFinite(n)||n<=0||n>max||(measure==='copper_length_m'&&code.endsWith('mono_split_5m')&&n<=3))return fail('QUOTE_REQUIRED','CLIM_INSTALL_LIMIT','Les dimensions ne correspondent pas au forfait choisi ; faites préciser le parcours.');}
   if(truth(inputs.copper_run_gt_5m)||(code==='climatisation.installation.standard'&&truth(inputs.copper_run_gt_3m)))return fail('QUOTE_REQUIRED','CLIM_INSTALL_LIMIT','La liaison dépasse le forfait choisi.');
  }
  for(var k of Object.keys(s.inputs)){if(inputs[k]===undefined&&partial)continue;if(inputs[k]!==s.inputs[k])return fail(inputs[k]===undefined?'REQUALIFY':'QUOTE_REQUIRED','CLIM_SCOPE_UNCONFIRMED','Le périmètre doit être confirmé avant le prix. Une réponse inconnue ou hors forfait nécessite une qualification ou un devis.');}
  return null;
 }
 return {version:'climatisation-pilot-v1',services:services,prompts:prompts,labels:labels,professionalPrompts:professionalPrompts,questions:questions,guard:guard};
});
