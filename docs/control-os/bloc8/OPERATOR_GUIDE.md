# FIXEO Control OS — Guide opérateur

## Accès et navigation

- `Ctrl/Cmd+K` : ouvrir la palette de commandes.
- `/` : revenir à la Control Tower et placer le focus dans la recherche universelle.
- `Échap` : fermer la palette, le dossier latéral ou le menu mobile quand il est ouvert.
- Les résultats de recherche ouvrent un dossier canonique. Un raccourci clavier ne déclenche jamais une mutation métier.

## Lire les états

- **FRESH / healthy** : source récente et exploitable dans son contrat.
- **PARTIAL** : lecture réelle mais incomplète ; ne pas interpréter le total affiché comme exhaustif.
- **STALE** : dernière lecture connue conservée mais périmée.
- **UNAVAILABLE / indisponible** : aucune conclusion métier ne doit être tirée de l'absence de données.
- **FORBIDDEN** : accès refusé ; ne pas contourner par une autre source ou un export.
- **UNKNOWN** : absence de preuve suffisante ; ce n'est ni zéro, ni résolu, ni validé.

## Actions gouvernées

Une action engageante suit toujours : dossier → preuves → préparation → preview serveur → confirmation humaine → exécution par l'autorité canonique → résultat relu → audit/correlation ID.

Ne jamais interpréter :
- l'ouverture d'un dossier comme une mutation ;
- une preview comme une exécution ;
- une notification créée comme une livraison garantie ;
- un prix final comme une preuve de paiement ;
- la disparition d'un signal RAFI comme une résolution.

## Observabilité

La section **Système & gouvernance** affiche des traces locales minimisées :
- opération ;
- statut succès/erreur ;
- statut HTTP ;
- latence ;
- code d'erreur borné ;
- correlation ID.

Elle ne doit jamais contenir de token, téléphone, nom, note, description, payload métier ou réponse RPC complète.

Conserver le correlation ID lorsqu'une erreur doit être escaladée.

## Erreurs et reprise

- `AUTH_REQUIRED` / `SESSION_REQUIRED` : reconnecter l'Admin ; ne pas réessayer une mutation à l'aveugle.
- `FORBIDDEN` / `ORIGIN_REJECTED` : problème de droit ou de canal ; ne pas contourner.
- `SOURCE_TIMEOUT` / `DEPENDENCY_UNAVAILABLE` : source momentanément indisponible ; les autres univers restent utilisables.
- `STALE_EVIDENCE` / `EVIDENCE_CHANGED` : relire le dossier et régénérer une proposition.
- `HUMAN_CONFIRMATION_REQUIRED` : aucune exécution sans confirmation explicite.
- `CONTROL_SCHEMA_NOT_READY` : stopper les actions concernées et vérifier la version déployée.

## Escalade

Escalade technique si :
- erreurs 5xx répétées sur la même route ;
- divergence MAIN / Production ;
- asset Production différent du commit certifié ;
- refus de permission inattendu ;
- fuite potentielle de PII dans réponse, cache, log ou contexte IA ;
- résultat d'action sans audit/correlation/idempotency key.

Escalade métier si :
- preuve contradictoire ;
- dossier sans parent canonique ;
- finance sans preuve de reversement ;
- statut métier incompatible avec l'action envisagée.

## Rollback Bloc 8

Bloc 8 ne contient aucune migration DB. Le rollback applicatif de référence revient au commit Production Bloc 7 :

`3bda113c3ba74351f9fb9da4df85164e92165b81`

Après rollback :
1. attendre Vercel READY ;
2. vérifier MAIN/Production selon la procédure de restauration choisie ;
3. vérifier `admin.html`, assets Control et API read-only ;
4. conserver les audits et données métier tels quels ;
5. documenter la cause et le correlation ID éventuel.

## Règle d'exploitation

Quand une donnée ou une preuve manque, afficher la limitation. Ne jamais combler une inconnue par une supposition opérateur, une inférence IA ou une valeur par défaut présentée comme canonique.
