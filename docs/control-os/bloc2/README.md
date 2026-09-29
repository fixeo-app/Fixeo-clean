# Bloc 2 — RAFI Decision Center

Baseline : `529961f99136c750dad8803870b32e9602372c38`. Production observée READY et MAIN distant concordants le 29 septembre 2026. Les cinq migrations Bloc 1 conservent leurs empreintes certifiées. Ce candidat ne modifie aucune autorité Bloc 1.

## Architecture

`control_rafi_source_v1` → cinq sources indépendantes et bornées → moteur pur `api/control/rafi-decisions.js` → briefing, plan, activation réseau, dossier canonique → aperçu / confirmation / exécution Bloc 1 → résultat vérifié et audit existant.

RAFI ajoute des lectures administrateur et des règles ; aucune table de décisions, aucune nouvelle autorité de mutation, aucun LLM. Le rôle vient de `public.users.role`, jamais de métadonnées éditables. Les réponses ne comprennent ni coordonnées personnelles, ni preuve financière brute, ni données Business privées.

Les sources sont Operations, Network, Trust, Finance et Enterprise. Chaque observation a sa relation canonique, son horodatage, sa classification, ses IDs et son périmètre. Les groupes réseau sont calculés sur toutes les demandes éligibles au filtre, puis bornés à 100 groupes. Les autres sources sont bornées à 200 observations, avec total et indicateur de dépassement. Un échantillon d'IDs ne représente jamais un total global. Les pages incomplètes sont PARTIAL, une erreur UNAVAILABLE, une observation de plus de 60 secondes STALE. Les valeurs absentes restent nulles. Aucun cache partagé entre utilisateurs.

## Frontières de connaissance

- Couverture : correspondance exacte normalisée (casse/espaces), villes et métiers principaux ou secondaires déclarés. Le nombre de profils disponibles n'est ni une garantie d'acceptation ni une capacité simultanée. La couverture de proximité et les règles métier de Dispatch restent souveraines.
- Activation : profils existants non revendiqués et profils revendiqués/onboardés à vérifier dans les cohortes de demande. Une vérification ne promet pas une nouvelle disponibilité. Une revendication reste initiée par son propriétaire légitime.
- Dispatch : sélection préparée depuis `dispatch_preview_v22`, projection administrative sans coordonnées. La commande canonique revérifie l'état et peut refuser ; RAFI ne reproduit pas l'algorithme Dispatch.
- Enterprise : SLA d'acceptation via `enterprise_request_sla_facts_v1`, contexte/site contrôlé, offres internes existantes et encore valides. Aucun calcul inventé de SLA d'exécution, aucune affectation interne par l'Admin global ; ouvrir le dossier avec son contexte.
- Finance : prix final manquant, reversement déclaré à rapprocher, incohérence comptable observable. Les anciennes lignes `payments` non typées ne deviennent pas un encaissement prouvé.
- Concentration : part du backlog observé par ville/métier ; aucun qualificatif « anormal » sans historique de référence.
- Une ancienneté élevée est un fait ; le risque client est une inférence. Tous les seuils RAFI sont des seuils de triage versionnés, pas des engagements SLA contractuels.

## Actions

L'action disponible signifie consultation ou préparation. L'autorisation d'exécution provient exclusivement du preview Bloc 1 puis d'une confirmation Admin. Les préconditions sont vérifiées à nouveau dans la transaction d'exécution. Les décisions exposent séparément fait, inférence et recommandation. Le résultat conserve les IDs audit/corrélation/idempotence ; le dossier relit la chronologie canonique.

## Déploiement et retour arrière

Construction et certification : local + Supabase staging isolé `kqyhusnbybsukbcaoqtu`. Aucun test de mutation Production. Déploiement Production soumis à un GO distinct.

Retour arrière applicatif : redéployer l'arbre Bloc 1. Les lectures ajoutées peuvent rester inertes ; si nécessaire retirer uniquement EXECUTE des nouvelles RPC RAFI, sans toucher aux RPC Bloc 1, aux données métier ni à l'audit. Aucun backfill, aucune donnée à restaurer.
