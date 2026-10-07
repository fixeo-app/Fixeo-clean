# PB1 FINAL CORRECTION — reprise du 7 octobre 2026

## Autorité distante relue avant toute modification

PR #150 : OPEN / DRAFT / UNMERGED. Branche source : `feat/fixeo-mobile-w6-entry-auth-trust`. Base : `feat/fixeo-mobile-m4-terrain` (`7256eeda9898639debe7c5a4e574a463d6fb2234`). HEAD distant initial : `04569139234fe760c14d407302dd73846cc54883`. Cinq workflows SUCCESS sur ce HEAD.

Les derniers commits distants étaient `0456913` (PB1 V2), `23a3923` (Vision descriptive), `87753e4` (ancien gel), `9024dbc` (fixture Control) et `5efa818` (corrections physiques précédentes).

Le commit local `e4d4f08cbfe0fb2690737b7a4d1ee392a08a4e63`, enfant direct du HEAD distant, a été retrouvé mais n'était pas publié. Son contenu a été audité et ses gates rejoués. Aucun travail local n'a été assimilé à une preuve distante. Le master nouvellement joint est identique octet par octet au master utilisé (SHA-256 `248147026d95a171ebafc650d1f476c46cde7013d8d90997d9ffb16013b1ea2a`). Aucun nouveau détourage ni changement des dérivés, frames, ordre, cadence, respiration ou boucle pendant cette reprise.

## Compléments issus de la revue

Les questions financières ne sont plus interceptées par le mot « aujourd'hui » comme des questions d'agenda. Les questions Finance, Devis et Clients répondent à partir des données métier disponibles avant le CTA. Une lecture indisponible ne devient pas un résultat nul. Les périodes non prises en charge sont explicitement renvoyées vers l'agenda/Finance sans fabriquer une synthèse du jour. Une question sur la disponibilité ne prépare plus une modification de statut. Les commandes FR de saisie et leurs confirmations sont préservées. Les lectures agenda sont fraîches au moment de la question.

## Gates rejoués

- Mobile : 158 tests PASS, dont Darija arabe/latine, code-switching, agenda, commandes FR, réponses métier, consommation de commande, cycle de vie natif, photo, Auth et parcours précédemment certifiés logiciel.
- Server : 207 tests PASS (autorité, Vision/provenance/calibration, villes, devis/agenda/finance et régressions).
- TypeScript : PASS ; lint : zéro erreur, sept avertissements préexistants.
- Expo Doctor : 18/18 PASS.
- Export Android Hermes : PASS avec variables publiques du profil EAS final ; bundle .hbc et trois fichiers WebP animés canoniques présents. Aucun APK local.
- Décodage des 217 images des trois dérivés : PASS, cœur alpha 255, bord alpha 0, halo partiellement transparent, ordre/cadence/raccord conservés.
- STAGING relu : les quatre fonctions de confirmation acceptent Martil ; ACL service_role, SECURITY DEFINER et search_path inchangés. Aucune migration rejouée, aucun compte Auth ou donnée métier modifié par cette reprise.

La CI du SHA publié, le backend STAGING et le gel exact sont vérifiés et consignés dans la PR avant l'unique build Android. Aucun PASS physique n'est émis ; la prochaine recette est celle du vrai APK 0.3.0 (7).

## Publication et limites

La publication CLI n'a pas d'identité GitHub disponible. Utiliser le connecteur authentifié, comparer l'arbre intégral publié à l'arbre local testé, puis déplacer la seule ref W6 avec contrôle du parent attendu, sans force. PR Draft, aucun merge, aucun Main, aucune Production, aucune Preview UI, aucune validation visuelle intermédiaire. Le dernier build distant observé avant cette reprise était `b037efcb-032e-45e6-a593-0e8d9d71ee01` (0.3.0 (6), ancien SHA). Il ne s'agit pas du nouveau build autorisé.
