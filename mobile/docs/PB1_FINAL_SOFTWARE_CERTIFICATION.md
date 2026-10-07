# FIXEO Mobile — PB1 FINAL + addendum multi-demandes

Candidat construit à partir de `c037b9d1cee4bff2818e730b7edb107559413d20`, branche `feat/fixeo-mobile-w6-entry-auth-trust`, PR #150 vers `feat/fixeo-mobile-m4-terrain`. PR conservée ouverte, draft, non fusionnée. STAGING uniquement. Aucun aperçu Web, aucun build APK intermédiaire, aucune intervention Production.

## Contrat consolidé

Le mandat principal reste intégralement applicable. L’addendum P0/P1 remplace le modèle implicite « une demande active maximum » par Client 1 → N demandes. Un nouveau brouillon ne charge aucun ancien besoin ni mission. La création utilise la RPC canonique `create_my_service_request_v1`, après confirmation explicite et avec une clé propre au brouillon. Aucun nouveau backend et aucune migration.

Les assets et le lecteur RAFI MASTER LOOP V1, les autorités Auth/RLS et les contrats de mission sont préservés. Aucun compte, token ou session de test créé; aucun reset, recovery, OTP ni mutation de données utilisateur pour ces tests.

## Corrections et preuve logicielle

| Domaine | Résultat implémenté | Vérification |
| --- | --- | --- |
| Multi-demandes | Accueil pilotage, nouvelle demande vierge, suivi par identifiant, Interventions séparées, abandon sans écriture | Composants exécutés + SQL canonique dans PostgreSQL embarqué isolé |
| Idempotence | Une clé distincte par intention; retry identique après réponse perdue; aucune déduplication par ville/métier/description | A/B/C, même ville/métier, replay, conflit, isolation propriétaire, rôle |
| Estimation | Questions et décisions successives, réponses restaurées au retour, résumé, résultat, confirmation; moteur existant intégral | Gateway canonique multi-question et composant mobile, retour/branching/retry/safety |
| Devis | Brouillon et étapes; accord/refus avec confirmation visible; états déclaratifs explicites; autorité propriétaire et état courant relus | Tests écriture/rejet/replay + vrais handlers du composant |
| Économie | Personnel sans commission; FIXEO 15 % incluse dans le total; 500 MAD → 75 MAD / net indicatif 425 MAD; aucune TVA inventée | Arithmétique en centimes, remises, décimales, zéro, gros montants |
| Dock et Retour | Dock global sur sous-écrans; actions contextuelles distinctes; réserve mesurée/safe areas; Retour compact commun et parent logique | Contrats navigation, petits viewports, typographie, clavier, détails et univers |
| Villes et métiers | Recherche/sélection native canonique, accents conservés; catalogue métiers commun à onboarding/profil; choix explicite Client | Sélecteur de villes exécuté et typecheck; catalogue sans migration |
| Photo | Gestion groupée; clarification réellement éditable; ville préalable visible; observation neutre non transformée en panne | Capture/preview/diagnostic/provenance/safety existants, tests de composants |
| Alertes | Permission OS relue et appareil réassocié après connexion; événements existants seulement; lien vers identité backend exacte | Reconnexion sans nouvelle permission; destinations s1b/M4; guards Auth existants |
| Finance/CRM/Agenda/Disponibilité | Client cohérent avec intervention; date native; contexte CRM conservé; fonctions et guards existants préservés | Mutations Artisan, lien client/job, refus explicites, routes parents |

La réception de devis personnel n’est pas simulée dans Client OS : l’envoi et la décision reçue hors FIXEO sont déclarés par l’Artisan. Le devis marketplace conserve le circuit existant de vérification FIXEO. Aucune fausse notification ou ligne fiscale ajoutée.

## Audit des interactions critiques

- Demande : écrire/micro/photo, ville/métier, confirmer, retry, nouveau besoin, suivi A/B, retour et abandon.
- Estimation : démarrer, choisir métier/service, répondre/continuer, précédent, récapitulatif, résultat, téléphone, confirmation et retry.
- Devis : client/origine, lignes, aperçu, sauvegarde, envoi déclaré, accord/refus déclarés et confirmation visible; états incompatibles retirés.
- Navigation : dock, menu, Retour, fiche Client → devis/planifier → fiche, disponibilité → profil → disponibilité.
- Artisan : profil, disponibilité, CRM, agenda, finance, opportunités, missions, notifications; services canoniques conservés et erreurs visibles.
- Alertes déjà lues sans destination : non présentées comme boutons actifs. Avec destination : ouverture du suivi canonique.

L’audit logiciel vérifie handlers, destinations, états et feedback. Il ne prétend pas simuler une pression physique sur chaque écran Android.

## Gates locales

Au 7 octobre 2026 : 166 tests Mobile et 209 tests Server réussis, aucun échec ni skip. TypeScript et lint réussis, zéro avertissement lint. Expo Doctor 18/18. Export Android Hermes réussi sans APK. Vérification RAFI des 217 frames et variantes natives réussie; shaders GLES hors écran réussis. `git diff --check` propre. Les hashes des invariants antérieurs restent contrôlés; les remplacements explicitement autorisés sont consignés avec leurs anciens hashes et tests de comportement.

Gates distantes restantes avant freeze : CI verte sur le commit publié, passerelle Staging déployée sur ce même code, état PR vérifié, références Production inchangées. Le SHA final et le Build ID sont consignés dans le rapport de livraison après ces gates; ce document n’annonce pas un build encore absent.

## Freeze / build autorisé

Version Android préparée : `0.3.0`, versionCode `8`, package `ma.fixeo.app`. Profil EAS `w6-physical-certification`, distribution interne APK, environnement EAS `preview`, application `staging`, projet Supabase `kqyhusnbybsukbcaoqtu`. Passerelle Staging existante via `mobile-rafi-preview-proxy`.

Après toutes les gates : gel du SHA exact et arbre propre, puis un seul build Android final. Aucun commit entre freeze et build, aucune fusion PR/main, aucune publication Production. Les contrôles Hermes et compilations CI ne produisent pas d’APK intermédiaire.

## Recertification physique différée

Vision de bout en bout, permissions réelles, clavier/dock/safe areas sur le téléphone, performance et matière RAFI, push réel et rendu final : **DEFERRED TO PHYSICAL RE-CERTIFICATION**, ni PASS physique ni FAIL. Le propriétaire recertifie le véritable APK final. Aucun nouvel essai visuel Web n’est demandé.
