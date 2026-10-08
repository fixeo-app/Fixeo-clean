# PB1 SOFTWARE CANDIDATE — FINAL FREEZE

**READY FOR SINGLE PHYSICAL BUILD**

Aucun APK ou build physique n’est autorisé ni lancé. STOP après ce checkpoint. Prochaine autorisation nécessaire : **GO PB1 — SINGLE FINAL ANDROID BUILD**.

## Identité et chronologie du candidat

Dépôt : `fixeo-app/Fixeo-clean`. Branche unique : `feat/fixeo-mobile-w6-entry-auth-trust`. PR #150 ouverte, Draft, non mergée. Base : `feat/fixeo-mobile-m4-terrain`.

| SHA publié | Raison |
| --- | --- |
| `48b54c2795d72bc26cb5927a344e21bdd938901e` | Source du PB1 physique initial, point de départ vérifié. |
| `5efa818d84987d13072e1d53f80f8efc42585b58` | Corrections Mobile PB1, RAFI Living Sphere, tests et preuves. |
| `9024dbc5dcded60f01d2169dd0c1d5e4b40b4275` | Seule période du test navigateur Control fixée sur ses fixtures statiques, plus documentation Auth et consigne de build différé. Aucun changement du code métier. CI 5/5 PASS. |
| Commit contenant ce dossier de gel | Documentation de la stratégie finale, résultats automatiques actualisés et revue. Aucun changement applicatif depuis `5efa818…`, aucun nouveau changement du test Control depuis `9024dbc…`. Le SHA final exact est publié sur PR #150 et dans le bilan après création du commit. |

Les commits locaux et publiés peuvent avoir des identifiants différents du fait de leurs métadonnées Git. L’arbre publié est comparé à l’arbre local testé avant chaque déplacement de la seule branche W6, sans force, avec vérification du parent attendu. Aucun rebase, reset, merge ou drift silencieux.

## Résultats logiciels

| Domaine | Résultat |
| --- | --- |
| Client OS | PASS logiciel : dock sur les racines canoniques, drawer clair, navigation, catalogue villes/Fès, conservation du brouillon derrière revalidation Auth, états vides et retry. |
| Artisan OS | PASS logiciel : dock, drawer, navigation, Agenda natif avec masques conservés, Finance lisible et lien mouvement/client/intervention/date/montant. |
| RAFI timeout / retry | PASS logiciel : AbortController et délai couvrant le corps HTTP ; estimation et photo compatibles RN/Hermes ; payloads et idempotence conservés. Aucun appel AbortSignal.timeout dans le code mobile exécuté. Les anciens harnais Node utilisent leur API Node compatible. |
| RAFI Living Sphere | PASS logiciel : MASTER inchangé, moteur partagé, six états, événements métier, formats atténués, Reduce Motion, pause hors viewport/background/blur, reprise, cleanup et fallback. SPEAKING architectural sans faux déclenchement. |
| Entry / Auth / Trust | PASS logiciel : contrats Auth/role routing et fermeture des accès, callback local, ouverture native messagerie, icône FIXEO et barres système. |
| Contrats | 127/127 PASS au contrôle de gel, `freeze-contracts.log`. |
| TypeScript | PASS au contrôle de gel, `freeze-typecheck.log`. Pas de script lint séparé configuré ; diff whitespace contrôlé. |
| Android / Hermes | PASS au contrôle de gel, bundle `.hbc`, profil d’environnement staging injecté depuis eas.json ; aucun APK. `freeze-android-export.log`. |
| CI | 5/5 PASS sur le SHA précédent. La CI du commit de gel est vérifiée et enregistrée sur PR #150 après publication. |
| Autres contrôles déjà acquis sur le même code | Expo Doctor 18/18 ; prébuild 17/17 ; shell 8 configurations + grand texte ; 18 parcours synthétiques ; lifecycle RAFI et six états. |

Revue complète du diff incrémental terminée : uniquement Mobile et période du fichier de test Control autorisé. Aucune migration, policy, règle de prix, commission, dispatch ou modification métier Control/Enterprise/Web. Empreintes du MASTER et du code dans `freeze-review.json`.

## Auth Preview

**DEFERRED TO PHYSICAL CERTIFICATION**

Le compte Client `contact+w6-client@fixeo.ma` existe avec UID `0893b0d3-27ac-4acb-8165-394b8867221d`, rôle canonique Client, email confirmé et sans bannissement. Les saisies Preview ont été refusées (`invalid_credentials`). Aucune session réelle Client n’est certifiée par cette exécution. Aucun mot de passe changé, secret lu, recovery/email/signup ou remplacement d’utilisateur. La dernière instruction utilisateur arrête toute tentative Preview et reporte cette anomalie à la certification physique. Elle ne bloque plus le gel logiciel.

## Non certifié physiquement

- Connexion/résolution de rôle et parcours réels Client et Artisan, sessions et déconnexion ; données staging derrière Auth/RLS réel.
- Réseau RAFI réel : microphone/transcription, diagnostic photo, estimation, timeout/retry, récapitulatif et confirmation explicite avant création de demande.
- Permission géolocalisation/notifications/micro/caméra, maintien du contexte et reprise foreground sur le device.
- DatePicker/TimePicker Android, fuseau horaire, clavier, barres système, icône installée et ouverture de l’application de messagerie.
- CRM, même brouillon DEV-2026-0001 de 500 MAD, Agenda et mouvements +500/−120 avec liens et absence de doublons.
- Rendu animé RAFI IDLE/tap/LISTENING/THINKING/SUCCESS/ATTENTION, Reduce Motion, fluidité perçue, chauffe, batterie et confort. Les vidéos web existantes à 10 FPS ne sont pas un benchmark 60 FPS.
- Recovery/PKCE et identité expéditeur SMTP : contrats locaux acquis ; aucune certification par email réel ou par appareil dans ce lot.

Les preuves web/synthétiques déjà produites restent des preuves logicielles historiques. Aucun test utilisateur Preview supplémentaire n’a été entrepris après la rectification finale.

## Garde-fous de sortie

PR #150 ouverte : YES. Draft : YES. Non mergée : YES. Main intact : YES. Production intacte : YES. Aucun APK / build physique lancé : YES.

Main relu : `f8e59d5ad7294dd5493bf7b0219740248d2a8d64`. Production observée : `dpl_63jTTiFwLrBD3D4Tc3Gxi7KVNjvR`, même SHA. Vérification finale après publication sans écriture vers ces environnements.

Le verdict ne constitue ni PASS PB1 FINAL ni PASS PHYSICAL. Il clôt uniquement le logiciel selon le périmètre révisé par l’utilisateur.
