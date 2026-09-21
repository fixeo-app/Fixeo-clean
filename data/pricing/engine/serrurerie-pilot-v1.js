/* Grille serrurerie validée par le propriétaire pour 20 villes. Contrôles professionnels distincts des réponses client. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FixeoSerrureriePilot=factory();})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 var services={
  "serrurerie.diagnostic": {
    "label": "Diagnostic serrurerie — 30 minutes maximum",
    "scope": "Une porte de logement, examen non destructif et explication des constats, jusqu’à 30 minutes sur place. Sans ouverture, réparation, fourniture, ni garantie de résolution. Commande explicite avant déplacement.",
    "vap_minor": 16000,
    "materials_minor": 0,
    "commission_minor": 6000,
    "total_minor": 22000,
    "inputs": {
      "locksmith_safety": "NO_IMMEDIATE_DANGER",
      "locksmith_access_right": "DECLARED_AUTHORIZED_NO_DISPUTE",
      "locksmith_presence": "AUTHORIZED_ADULT_PRESENT",
      "locksmith_property": "RESIDENTIAL_PRIVATE_DOOR",
      "locksmith_count": "ONE_DOOR",
      "locksmith_slot": "DAY_08_20",
      "locksmith_work": "DIAGNOSTIC"
    },
    "client_part": false,
    "followup": false,
    "offer_checks": {
      "competence_and_tools_confirmed": true,
      "fixed_price_scope_and_availability_confirmed": true,
      "diagnostic_limits_accepted": true
    },
    "professional_checks": {
      "identity_and_access_right_verified_before_work": true,
      "mandate_verified_if_needed": true,
      "no_occupancy_dispute": true,
      "scope_and_safe_work_verified": true,
      "diagnostic_limits_accepted": true
    },
    "completion_checks": {
      "assessment_performed": true,
      "findings_and_next_steps_explained": true
    }
  },
  "serrurerie.porte_claquee_ouverture": {
    "label": "Ouverture porte standard simplement claquée",
    "scope": "Une porte non blindée refermée sans verrouillage, mécanisme compatible et intact. Ouverture sans dégradation et essai. Sans remplacement ni réparation de porte ou bâti.",
    "vap_minor": 20000,
    "materials_minor": 0,
    "commission_minor": 6000,
    "total_minor": 26000,
    "inputs": {
      "locksmith_safety": "NO_IMMEDIATE_DANGER",
      "locksmith_access_right": "DECLARED_AUTHORIZED_NO_DISPUTE",
      "locksmith_presence": "AUTHORIZED_ADULT_PRESENT",
      "locksmith_property": "RESIDENTIAL_PRIVATE_DOOR",
      "locksmith_count": "ONE_DOOR",
      "locksmith_slot": "DAY_08_20",
      "locksmith_door_type": "STANDARD_MECHANICAL",
      "locksmith_door_state": "SLAMMED_NOT_LOCKED",
      "locksmith_work": "OPEN_SLAMMED_STANDARD"
    },
    "client_part": false,
    "followup": true,
    "offer_checks": {
      "competence_and_tools_confirmed": true,
      "fixed_price_scope_and_availability_confirmed": true,
      "non_destructive_opening_feasible": true,
      "mechanism_intact_and_not_locked": true
    },
    "professional_checks": {
      "identity_and_access_right_verified_before_work": true,
      "mandate_verified_if_needed": true,
      "no_occupancy_dispute": true,
      "scope_and_safe_work_verified": true,
      "non_destructive_opening_feasible": true,
      "mechanism_intact_and_not_locked": true
    },
    "completion_checks": {
      "door_opened_without_damage": true,
      "operation_test_completed": true
    }
  },
  "serrurerie.porte_claquee_blindee.ouverture": {
    "label": "Ouverture porte blindée simplement claquée — modèle compatible",
    "scope": "Une porte blindée refermée, points de verrouillage non engagés et modèle compatible confirmé par le professionnel. Ouverture sans dégradation. Modèle inconnu, verrouillage automatique ou engagé, panne, équipement électrique/connecté : devis.",
    "vap_minor": 30000,
    "materials_minor": 0,
    "commission_minor": 6000,
    "total_minor": 36000,
    "inputs": {
      "locksmith_safety": "NO_IMMEDIATE_DANGER",
      "locksmith_access_right": "DECLARED_AUTHORIZED_NO_DISPUTE",
      "locksmith_presence": "AUTHORIZED_ADULT_PRESENT",
      "locksmith_property": "RESIDENTIAL_PRIVATE_DOOR",
      "locksmith_count": "ONE_DOOR",
      "locksmith_slot": "DAY_08_20",
      "locksmith_door_type": "SECURITY_MECHANICAL",
      "locksmith_door_state": "SLAMMED_NOT_LOCKED",
      "locksmith_work": "OPEN_SLAMMED_SECURITY"
    },
    "client_part": false,
    "followup": true,
    "offer_checks": {
      "competence_and_tools_confirmed": true,
      "fixed_price_scope_and_availability_confirmed": true,
      "model_and_non_destructive_feasibility_confirmed": true,
      "locking_points_not_engaged": true,
      "no_auto_lock_or_electronics": true
    },
    "professional_checks": {
      "identity_and_access_right_verified_before_work": true,
      "mandate_verified_if_needed": true,
      "no_occupancy_dispute": true,
      "scope_and_safe_work_verified": true,
      "model_and_non_destructive_feasibility_confirmed": true,
      "locking_points_not_engaged": true,
      "no_auto_lock_or_electronics": true
    },
    "completion_checks": {
      "door_opened_without_damage": true,
      "operation_test_completed": true
    }
  },
  "serrurerie.cle_cassee_extraction": {
    "label": "Extraction clé cassée — porte déjà ouverte",
    "scope": "Un fragment dans un cylindre mécanique standard sur porte déjà ouverte. Extraction sans dommage et essai avec un double fonctionnel disponible. Sans ouverture ni reproduction de clé ; cylindre endommagé, porte fermée ou sécurité spéciale : qualification/devis.",
    "vap_minor": 20000,
    "materials_minor": 0,
    "commission_minor": 6000,
    "total_minor": 26000,
    "inputs": {
      "locksmith_safety": "NO_IMMEDIATE_DANGER",
      "locksmith_access_right": "DECLARED_AUTHORIZED_NO_DISPUTE",
      "locksmith_presence": "AUTHORIZED_ADULT_PRESENT",
      "locksmith_property": "RESIDENTIAL_PRIVATE_DOOR",
      "locksmith_count": "ONE_DOOR",
      "locksmith_slot": "DAY_08_20",
      "locksmith_door_type": "STANDARD_MECHANICAL",
      "locksmith_door_state": "ALREADY_OPEN",
      "locksmith_test_key": "WORKING_DUPLICATE_AVAILABLE",
      "locksmith_work": "EXTRACT_BROKEN_KEY"
    },
    "client_part": false,
    "followup": true,
    "offer_checks": {
      "competence_and_tools_confirmed": true,
      "fixed_price_scope_and_availability_confirmed": true,
      "cylinder_condition_and_extraction_feasible": true,
      "working_duplicate_available": true
    },
    "professional_checks": {
      "identity_and_access_right_verified_before_work": true,
      "mandate_verified_if_needed": true,
      "no_occupancy_dispute": true,
      "scope_and_safe_work_verified": true,
      "cylinder_condition_and_extraction_feasible": true,
      "working_duplicate_available": true
    },
    "completion_checks": {
      "fragment_extracted_without_damage": true,
      "operation_test_with_duplicate_completed": true
    }
  },
  "serrurerie.cylindre_remplacement.standard": {
    "label": "Remplacement cylindre standard — pièce client",
    "scope": "Un cylindre mécanique standard à l’identique, pièce compatible fournie par le client et validée avant réservation. Porte ouverte, ancien cylindre démontable normalement et clé disponible. Dépose, pose et essais ; sans ouverture, retrait forcé, modification de porte, mécanisme multipoints ou équipement spécial.",
    "vap_minor": 24000,
    "materials_minor": 0,
    "commission_minor": 6000,
    "total_minor": 30000,
    "inputs": {
      "locksmith_safety": "NO_IMMEDIATE_DANGER",
      "locksmith_access_right": "DECLARED_AUTHORIZED_NO_DISPUTE",
      "locksmith_presence": "AUTHORIZED_ADULT_PRESENT",
      "locksmith_property": "RESIDENTIAL_PRIVATE_DOOR",
      "locksmith_count": "ONE_DOOR",
      "locksmith_slot": "DAY_08_20",
      "locksmith_door_type": "STANDARD_MECHANICAL",
      "locksmith_door_state": "ALREADY_OPEN",
      "locksmith_part_supply": "CLIENT_PART_AVAILABLE",
      "locksmith_test_key": "WORKING_KEY_AVAILABLE",
      "locksmith_part_fit": "PRO_CONFIRMED_COMPATIBLE",
      "locksmith_work": "REPLACE_STANDARD_CYLINDER"
    },
    "client_part": true,
    "followup": true,
    "offer_checks": {
      "competence_and_tools_confirmed": true,
      "fixed_price_scope_and_availability_confirmed": true,
      "replacement_part_compatibility_verified": true,
      "existing_cylinder_removable_normally": true,
      "door_open_and_key_available": true
    },
    "professional_checks": {
      "identity_and_access_right_verified_before_work": true,
      "mandate_verified_if_needed": true,
      "no_occupancy_dispute": true,
      "scope_and_safe_work_verified": true,
      "replacement_part_compatibility_verified": true,
      "existing_cylinder_removable_normally": true,
      "door_open_and_key_available": true
    },
    "completion_checks": {
      "part_installed_and_tested": true,
      "keys_handed_to_authorized_client": true,
      "old_part_return_offered": true
    }
  },
  "serrurerie.serrure_remplacement.standard": {
    "label": "Remplacement serrure monopoint à l’identique — pièce client",
    "scope": "Une serrure mécanique monopoint, pièce client compatible, même format et fixations, porte ouverte. Dépose, pose, réglage simple et essais ; cylindre du nouvel ensemble posé sans seconde main-d’œuvre. Sans adaptation, soudure, nouvelle réservation dans la porte, multipoints ni motorisation.",
    "vap_minor": 34000,
    "materials_minor": 0,
    "commission_minor": 6000,
    "total_minor": 40000,
    "inputs": {
      "locksmith_safety": "NO_IMMEDIATE_DANGER",
      "locksmith_access_right": "DECLARED_AUTHORIZED_NO_DISPUTE",
      "locksmith_presence": "AUTHORIZED_ADULT_PRESENT",
      "locksmith_property": "RESIDENTIAL_PRIVATE_DOOR",
      "locksmith_count": "ONE_DOOR",
      "locksmith_slot": "DAY_08_20",
      "locksmith_door_type": "STANDARD_MECHANICAL",
      "locksmith_door_state": "ALREADY_OPEN",
      "locksmith_part_supply": "CLIENT_PART_AVAILABLE",
      "locksmith_test_key": "WORKING_KEY_AVAILABLE",
      "locksmith_part_fit": "PRO_CONFIRMED_COMPATIBLE",
      "locksmith_work": "REPLACE_MONOPOINT_LOCK"
    },
    "client_part": true,
    "followup": true,
    "offer_checks": {
      "competence_and_tools_confirmed": true,
      "fixed_price_scope_and_availability_confirmed": true,
      "replacement_part_compatibility_verified": true,
      "same_format_and_fixings": true,
      "monopoint_mechanical_only": true
    },
    "professional_checks": {
      "identity_and_access_right_verified_before_work": true,
      "mandate_verified_if_needed": true,
      "no_occupancy_dispute": true,
      "scope_and_safe_work_verified": true,
      "replacement_part_compatibility_verified": true,
      "same_format_and_fixings": true,
      "monopoint_mechanical_only": true
    },
    "completion_checks": {
      "part_installed_and_tested": true,
      "keys_handed_to_authorized_client": true,
      "old_part_return_offered": true
    }
  }
};
 var prompts={
  "locksmith_safety": "Y a-t-il un danger immédiat pour une personne, un incendie, de la violence ou une intrusion en cours ?",
  "locksmith_access_right": "Êtes-vous autorisé à accéder à ce logement, sans litige d’occupation, et pouvez-vous faire vérifier votre identité et ce droit avant intervention ? La propriété seule ne permet pas un accès contesté.",
  "locksmith_presence": "Serez-vous présent, ou un adulte autorisé avec un mandat vérifiable, pendant l’intervention ?",
  "locksmith_property": "La demande concerne-t-elle une porte privative de logement, hors accès collectif, coffre, véhicule et local professionnel ?",
  "locksmith_count": "Cette demande concerne-t-elle une seule porte et une seule prestation ?",
  "locksmith_slot": "Acceptez-vous une intervention en journée, avec un début prévu entre 8 h et 20 h, selon disponibilité du partenaire ?",
  "locksmith_door_type": "Quel type de porte et de serrure avez-vous, si vous le savez ?",
  "locksmith_door_state": "La porte est-elle déjà ouverte, simplement claquée sans verrouillage, ou verrouillée ? Répondez seulement si vous le savez.",
  "locksmith_test_key": "Disposez-vous d’une clé ou d’un double fonctionnel pour les vérifications et essais prévus ?",
  "locksmith_part_supply": "Disposez-vous déjà de la pièce neuve à poser ? La pièce n’est pas comprise dans ce forfait.",
  "locksmith_part_fit": "Un professionnel a-t-il déjà confirmé que votre pièce convient pour un remplacement à l’identique ? N’achetez pas de pièce avant cette vérification.",
  "DIAGNOSTIC": "Une porte de logement, examen non destructif et explication des constats, jusqu’à 30 minutes sur place. Sans ouverture, réparation, fourniture, ni garantie de résolution. Commande explicite avant déplacement. Est-ce votre besoin ?",
  "OPEN_SLAMMED_STANDARD": "Une porte non blindée refermée sans verrouillage, mécanisme compatible et intact. Ouverture sans dégradation et essai. Sans remplacement ni réparation de porte ou bâti. Est-ce votre besoin ?",
  "OPEN_SLAMMED_SECURITY": "Une porte blindée refermée, points de verrouillage non engagés et modèle compatible confirmé par le professionnel. Ouverture sans dégradation. Modèle inconnu, verrouillage automatique ou engagé, panne, équipement électrique/connecté : devis. Est-ce votre besoin ?",
  "EXTRACT_BROKEN_KEY": "Un fragment dans un cylindre mécanique standard sur porte déjà ouverte. Extraction sans dommage et essai avec un double fonctionnel disponible. Sans ouverture ni reproduction de clé ; cylindre endommagé, porte fermée ou sécurité spéciale : qualification/devis. Est-ce votre besoin ?",
  "REPLACE_STANDARD_CYLINDER": "Un cylindre mécanique standard à l’identique, pièce compatible fournie par le client et validée avant réservation. Porte ouverte, ancien cylindre démontable normalement et clé disponible. Dépose, pose et essais ; sans ouverture, retrait forcé, modification de porte, mécanisme multipoints ou équipement spécial. Est-ce votre besoin ?",
  "REPLACE_MONOPOINT_LOCK": "Une serrure mécanique monopoint, pièce client compatible, même format et fixations, porte ouverte. Dépose, pose, réglage simple et essais ; cylindre du nouvel ensemble posé sans seconde main-d’œuvre. Sans adaptation, soudure, nouvelle réservation dans la porte, multipoints ni motorisation. Est-ce votre besoin ?"
};
 var labels={
  "NO_IMMEDIATE_DANGER": "Aucun de ces dangers",
  "IMMEDIATE_DANGER": "Oui, danger immédiat",
  "DECLARED_AUTHORIZED_NO_DISPUTE": "Oui, droit d’accès non contesté et justificatifs disponibles avant intervention",
  "DISPUTED_OR_UNAUTHORIZED": "Non, droit contesté ou non établi",
  "AUTHORIZED_ADULT_PRESENT": "Oui, un adulte autorisé sera présent",
  "RESIDENTIAL_PRIVATE_DOOR": "Oui, porte privative de logement",
  "ONE_DOOR": "Une seule porte, une seule prestation",
  "DAY_08_20": "Oui, début en journée entre 8 h et 20 h",
  "STANDARD_MECHANICAL": "Porte standard, serrure mécanique",
  "SECURITY_MECHANICAL": "Porte blindée, serrure mécanique",
  "SLAMMED_NOT_LOCKED": "Simplement claquée, non verrouillée",
  "ALREADY_OPEN": "Porte déjà ouverte",
  "LOCKED": "Porte verrouillée",
  "WORKING_DUPLICATE_AVAILABLE": "Oui, un double fonctionnel est disponible",
  "WORKING_KEY_AVAILABLE": "Oui, clé fonctionnelle disponible",
  "CLIENT_PART_AVAILABLE": "Oui, je fournis la pièce",
  "PRO_CONFIRMED_COMPATIBLE": "Oui, compatibilité confirmée par un professionnel",
  "SERR_COMPLEX": "Non, cela dépasse ce périmètre",
  "UNKNOWN": "Je ne sais pas",
  "DIAGNOSTIC": "Oui, ce périmètre correspond à mon besoin",
  "OPEN_SLAMMED_STANDARD": "Oui, ce périmètre correspond à mon besoin",
  "OPEN_SLAMMED_SECURITY": "Oui, ce périmètre correspond à mon besoin",
  "EXTRACT_BROKEN_KEY": "Oui, ce périmètre correspond à mon besoin",
  "REPLACE_STANDARD_CYLINDER": "Oui, ce périmètre correspond à mon besoin",
  "REPLACE_MONOPOINT_LOCK": "Oui, ce périmètre correspond à mon besoin"
};
 var professionalPrompts={
  "identity_and_access_right_verified_before_work": "J’ai vérifié sur place l’identité et les justificatifs du droit d’accès, avant toute ouverture ou modification.",
  "mandate_verified_if_needed": "J’ai vérifié le mandat et le droit d’accès du mandant lorsqu’une autre personne intervient pour l’occupant.",
  "no_occupancy_dispute": "Aucun litige d’occupation, demande d’éviction ou droit d’accès contesté n’est présent.",
  "scope_and_safe_work_verified": "J’ai contrôlé sur place le périmètre, l’état visible et la sécurité de l’intervention.",
  "competence_and_tools_confirmed": "Je dispose des compétences et de l’outillage nécessaires pour ce modèle et ce périmètre.",
  "fixed_price_scope_and_availability_confirmed": "Je confirme la disponibilité pour le créneau 8 h–20 h, une porte, le périmètre et le total fixe, déplacement compris.",
  "diagnostic_limits_accepted": "Le client a commandé un examen non destructif de 30 minutes maximum, sans ouverture, réparation ni pièce.",
  "non_destructive_opening_feasible": "J’ai confirmé la faisabilité d’une ouverture sans dégradation au forfait annoncé.",
  "mechanism_intact_and_not_locked": "La porte est simplement claquée, sans verrouillage, avec un mécanisme intact et compatible.",
  "model_and_non_destructive_feasibility_confirmed": "J’ai identifié le modèle de porte blindée et confirmé la faisabilité sans dégradation au prix fixe.",
  "locking_points_not_engaged": "J’ai confirmé que les points de verrouillage ne sont pas engagés.",
  "no_auto_lock_or_electronics": "Ce modèle ne comporte pas de verrouillage automatique ni de dispositif électrique ou connecté à traiter.",
  "cylinder_condition_and_extraction_feasible": "J’ai vérifié que le cylindre standard permet l’extraction sans dommage, sur porte déjà ouverte.",
  "working_duplicate_available": "Un double fonctionnel est disponible pour l’essai après extraction.",
  "replacement_part_compatibility_verified": "J’ai confirmé la compatibilité de la pièce client disponible pour une pose à l’identique, sans supplément.",
  "existing_cylinder_removable_normally": "Le cylindre standard peut être déposé normalement, sans retrait forcé ni mécanisme multipoints.",
  "door_open_and_key_available": "La porte est déjà ouverte et la clé nécessaire à la dépose et aux essais est disponible.",
  "same_format_and_fixings": "La serrure de remplacement utilise le même format et les fixations existantes, sur porte ouverte.",
  "monopoint_mechanical_only": "Il s’agit d’une serrure mécanique monopoint, sans adaptation, soudure ni motorisation.",
  "assessment_performed": "J’ai réalisé le diagnostic non destructif commandé, dans la limite convenue.",
  "findings_and_next_steps_explained": "J’ai expliqué les constats et les suites possibles, sans promettre une réparation non réalisée.",
  "door_opened_without_damage": "La porte a été ouverte sans dégradation, conformément au forfait accepté.",
  "operation_test_completed": "J’ai effectué les essais de fonctionnement avec un résultat satisfaisant.",
  "fragment_extracted_without_damage": "Le fragment de clé a été extrait sans dégradation du cylindre.",
  "operation_test_with_duplicate_completed": "J’ai vérifié le fonctionnement avec le double disponible.",
  "part_installed_and_tested": "La pièce compatible a été posée et son fonctionnement a été vérifié avec succès.",
  "keys_handed_to_authorized_client": "Les clés ont été remises à la personne autorisée.",
  "old_part_return_offered": "J’ai proposé la restitution des anciennes pièces au client."
};

 function questions(code){var s=services[code];if(!s)return [];return Object.keys(s.inputs).map(function(k){var key=k==='locksmith_work'?s.inputs[k]:k,options=[s.inputs[k],'SERR_COMPLEX','UNKNOWN'];if(k==='locksmith_safety')options=['NO_IMMEDIATE_DANGER','IMMEDIATE_DANGER','UNKNOWN'];if(k==='locksmith_access_right')options=['DECLARED_AUTHORIZED_NO_DISPUTE','DISPUTED_OR_UNAUTHORIZED','UNKNOWN'];if(k==='locksmith_door_state')options=['ALREADY_OPEN','SLAMMED_NOT_LOCKED','LOCKED','UNKNOWN'];return {input_id:k,priority:k==='locksmith_safety'?'SAFETY':'ROUTING_BOUNDARY',answer_type:'enum',options:options,prompt_key:key,prompt_fr:prompts[key]};});}
 function truth(v){return v===true||v==='true'||v==='True';}
 function guard(code,inputs,partial){if(!/^serrurerie\./.test(code||''))return null;inputs=inputs||{};var s=services[code];
  function fail(status,key,message){return {status:status,reason_code:key,reason:message};}
  if(inputs.locksmith_safety==='IMMEDIATE_DANGER'||inputs.locksmith_safety==='UNKNOWN'||['immediate_danger','fire','violence','intrusion_in_progress','person_in_danger','smoke'].some(function(k){return truth(inputs[k]);}))return fail('STOP_SAFETY','SERR_DANGER','En cas de danger immédiat, contactez les services d’urgence compétents. La réservation ordinaire ne convient pas à cette situation.');
  if((inputs.locksmith_access_right!==undefined&&inputs.locksmith_access_right!=='DECLARED_AUTHORIZED_NO_DISPUTE')||['occupancy_dispute','unauthorized_access','eviction_request'].some(function(k){return truth(inputs[k]);})||inputs.authorization_verified===false||inputs.property_occupied_status==='OCCUPIED_THIRD_PARTY')return fail('STOP_SAFETY','SERR_ACCESS_UNCONFIRMED','Le droit d’accès doit être établi avant toute intervention. Une situation contestée ou inconnue ne permet pas de réserver une ouverture ou un diagnostic. Contactez FIXEO pour clarifier la demande.');
  if(!s)return fail('QUOTE_REQUIRED','SERR_QUOTE_ONLY','Cette intervention nécessite un devis complet accepté avant déplacement ou travaux, incluant les pièces et la remise en fermeture sûre si nécessaire.');
  for(var count of ['cylinder_count','lock_count','door_count','item_count'])if(inputs[count]!==undefined&&inputs[count]!==1)return fail('QUOTE_REQUIRED','SERR_COUNT','Le forfait concerne une porte et une prestation ; les lots nécessitent un devis.');
  if(['part_replacement_required','destructive_work_required','barrel_previously_damaged','auto_lock','connected_lock','multipoint_engaged','combined_opening_replacement'].some(function(k){return truth(inputs[k]);}))return fail('QUOTE_REQUIRED','SERR_COMPLEX','Le matériel ou les travaux dépassent ce forfait : un devis complet est nécessaire avant intervention.');
  if(code!=='serrurerie.diagnostic'){
   if(truth(inputs.door_locked_with_key)||inputs.locksmith_door_state==='LOCKED')return fail('QUOTE_REQUIRED','SERR_LOCKED','Une porte verrouillée nécessite une qualification et un devis complet ; le forfait porte claquée ne s’applique pas.');
   if(inputs.security_door!==undefined&&inputs.security_door!==(code==='serrurerie.porte_claquee_blindee.ouverture'))return fail('QUOTE_REQUIRED','SERR_DOOR_TYPE','Le type de porte doit être confirmé pour ce forfait.');
  }
  if(inputs.appointment_hour!==undefined&&(typeof inputs.appointment_hour!=='number'||!Number.isFinite(inputs.appointment_hour)||inputs.appointment_hour<8||inputs.appointment_hour>=20))return fail('QUOTE_REQUIRED','SERR_HOURS','Ce forfait prévoit un début d’intervention entre 8 h et 20 h. Hors créneau : devis accepté avant déplacement.');
  for(var k of Object.keys(s.inputs)){if(inputs[k]===undefined&&partial)continue;if(inputs[k]!==s.inputs[k])return fail(inputs[k]===undefined?'REQUALIFY':'QUOTE_REQUIRED','SERR_SCOPE_UNCONFIRMED','Le périmètre doit être confirmé avant le prix. Une réponse inconnue ou hors forfait nécessite une qualification ou un devis, sans diagnostic facturé automatiquement.');}
  return null;
 }
 return {version:'serrurerie-pilot-v1',services:services,prompts:prompts,labels:labels,professionalPrompts:professionalPrompts,questions:questions,guard:guard};
});
