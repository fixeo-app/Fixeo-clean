# Bloc 2 — dossier de certification candidat

Baseline immuable : `529961f99136c750dad8803870b32e9602372c38`.
Branche : `feat/control-os-bloc2-rafi-decision-center`.
PR : https://github.com/fixeo-app/Fixeo-clean/pull/53.
Révision des API certifiée en Preview : `fa733c9996eb8dc0887960f6387274e31be44ea4`. La révision suivante conserve ces API et ajoute l'expiration visuelle des briefings vides, couverte par le huitième test UI. Les empreintes applicatives de livraison figurent dans [FILE-MANIFEST.json](FILE-MANIFEST.json).

**Statut : certification technique en cours de clôture ; recette visuelle Admin authentifiée encore requise. Ce dossier ne constitue pas un GO Production.**

## Périmètre livré

Voir [README](README.md), [matrice des décisions](DECISION-MATRIX.md) et [rollback](ROLLBACK.md).

- Trois RPC de lecture Admin, cinq sources indépendantes, un moteur pur et déterministe.
- Contrat de décision avec provenance, âge, priorité, facteurs, faits, inférence d'impact et recommandation ; identifiant stable, tri et dédoublonnage.
- Briefing, plan, activation réseau, contexte paginé et dossier canonique ; Control Tower conserve son rôle de synthèse.
- Actions préparées via les autorités Bloc 1, confirmation Admin, résultat vérifié, audit et retry avec la même clé après réponse incertaine.
- Aucune nouvelle autorité de mutation, aucune écriture directe métier depuis RAFI, aucune IA externe.

## Gates et preuves

| Gate | Résultat / preuve |
|---|---|
| Baseline MAIN / Production | Concordants ; Vercel Production `dpl_5yH3sqRzwCfpfrTSwpRhUbToe35r`, READY |
| CI du code applicatif | 103 tests PASS, zéro échec, zéro ignoré ; [run 36515461849](https://github.com/fixeo-app/Fixeo-clean/actions/runs/36515461849) |
| Concurrence PostgreSQL 17.6 | PASS : double retry, acceptation client, concurrence interne/externe, Claims, plafond de commission |
| Build repository | 164 contrôles PASS via `node api/diagnostic/verify-build.cjs` ; aucun test photo/LLM effectué |
| Supabase staging réel | 19 groupes PASS ; [preuve](evidence/staging-reads.json) |
| Auth / RLS / ACL | Anon refusé ; 14 identités non-admin, dont deux tenants Enterprise, refusées sur les trois RPC ; Admin autorisé |
| Métadonnées SQL / Production inchangée | [Preuve ciblée](evidence/security-and-ci.json) |
| Preview | READY, `dpl_ApzCFgDtSMWctHQnXsobs6U51GCt`, SHA applicatif ci-dessus ; configuration isolée staging |
| HTTP / API / assets déployés | 20 groupes PASS sur la révision API ; [rapport détaillé](evidence/preview.json). La livraison vérifie à nouveau les assets du dernier HEAD. |
| UI fonctionnelle | 8 tests PASS sur le DOM réel avec JSDOM : briefing, preuves, XSS, contexte, réponses hors ordre, erreurs, refus, chargement limité, expiration même sans décision, retry idempotent |
| Recette visuelle desktop / mobile signée | NON VALIDÉE : la Preview affiche le formulaire d'authentification ; connexion Admin staging nécessaire |

L'HTML servi en Preview peut comporter le script de feedback Vercel ajouté après le document. Le test vérifie séparément l'identité exacte des octets applicatifs et ce seul suffixe de plateforme autorisé. Les empreintes HTTP brutes et applicatives restent toutes deux consignées.

## Migration unique

`20260929021750_control_os_b2_rafi_reads.sql`

SHA256 : `9dc5872e2bd9647f10ff7a82c389f1ba53afca2a3b66e15b55bbae0b91a97a65`.

Appliquée au staging isolé `kqyhusnbybsukbcaoqtu`. Non appliquée en Production. Les trois nouvelles fonctions sont STABLE, SECURITY DEFINER, owner postgres, search_path vide, garde Admin canonique en première instruction. EXECUTE est retiré de PUBLIC/anon/service_role. Aucune table ou policy existante n'est modifiée. Les trois WARN du linter sur EXECUTE authenticated sont documentés et couverts par les refus réels non-admin.

## Limites explicites

- Operations staging : 268 observations, fenêtre de 200 ; le résultat global reste PARTIAL. Les fenêtres ne sont jamais présentées comme une exhaustivité globale.
- Couverture fondée sur villes/métiers déclarés ; aucune garantie de disponibilité simultanée ni d'éligibilité Dispatch finale.
- SLA d'acceptation canonique uniquement ; absence d'historique suffisante pour qualifier une concentration d'anormale.
- Aucune commande d'activation/recrutement ni de revendication à la place du propriétaire. Offres internes Enterprise observées, sans nouveau pouvoir de mutation du tenant.
- Les tickets de retry du navigateur sont conservés en mémoire ; après fermeture/rechargement, relire le dossier et l'audit avant une nouvelle préparation.
- Une connexion humaine Admin staging reste nécessaire dans le navigateur pour clôturer la recette visuelle. Les contrôles HTTP utilisent déjà de vrais JWT staging ; ils ne remplacent pas cette observation visuelle.

## Reprise exacte

Conserver les preuves existantes compatibles. Terminer uniquement la recette visuelle sur la Preview du candidat, consigner les captures desktop/mobile et les parcours briefing → preuve → dossier → contexte → préparation/annulation. Toute exécution de recette reste sur staging contrôlé. Passer la PR prête seulement après fermeture de ce gate. Ne pas merger, appliquer une migration ou déployer Production sans GO Bloc 2 explicite.

Production : **NON MODIFIÉE**. Aucune fixture, aucun faux utilisateur, aucun secret modifié en Production ; aucune restauration ni rollback exécuté.
