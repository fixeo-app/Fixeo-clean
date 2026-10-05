# W4.1B — autorité par capacité

Correction produit explicite du 4 octobre 2026. Le STOP et le rollback précédents restent des preuves historiques ; Voice Artisan HTTP 200 est conforme au contrat corrigé.

| Capacité | Autorité | Refus attendus |
| --- | --- | --- |
| Voice `/api/mobile-rafi-transcribe` | Authentification Mobile partagée : Client et Artisan | Anonyme, JWT invalide, authentification rejetée |
| Photo sans `persist=true` | Analyse RAFI authentifiée et éphémère, Client et Artisan | Anonyme, JWT invalide ; aucune référence Client/pricing créée |
| Photo `persist=true` | `security.client()`, consentement, ownership | Artisan, Admin, autre propriétaire |
| Estimator, pricing et confirmation | `security.client()` puis RPC gardées | Artisan, Admin, autre propriétaire |
| Demande Client directe | Contrat RPC `create_my_service_request_v1` existant | Non-Client et usurpation de propriétaire |

Le proxy borne trois routes et valide le JWT (`verify_jwt=true`) ; les endpoints canoniques conservent leur autorité métier. Aucun rôle global Client ajouté au proxy ni à Voice.

Usage Mobile audité : `mobile/lib/mobileDiagnostic.ts` appelle la photo sans persistance pour l'expérience RAFI actuelle. `mobile/lib/mobileDiagnosticReference.ts` demande séparément `persist=true`, après consentement explicite, pour le futur handoff Client W4.1. `mobile/lib/rafiGateway.ts` porte la transcription partagée. Aucune modification implicite du contrat non persistant et aucune intégration W4 dans cette correction.

Les contrats de test exercent les handlers Voice/Photo réels avec dépendances simulées ; la certification staging utilise ensuite les vrais JWT fixtures via le proxy partagé. Les deux niveaux de preuve sont distingués dans le rapport final.
