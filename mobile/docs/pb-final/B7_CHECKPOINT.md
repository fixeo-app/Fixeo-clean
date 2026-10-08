# B7 — Finition, accessibilité et destinations

PASS SOFTWARE : 205 tests Mobile ; typecheck et lint sans erreur. Revue C01–C10/A01–A10 dans 01_UX_DECISIONS.md. Aucune preuve physique nouvelle.

- Palette sélection champagne/noir et focus mesurés ; legacy tokens, RAFI assets/renderer et callbacks métier préservés.
- Rôles radio/checkbox corrigés dans ShellControl et testés sur composant réel ; cibles 48 dp, disabled/checked conservés.
- AuthField et compte Client rejoignent KeyboardInput ; géométrie Auth indépendante de la hauteur clavier. Recherche modale fixée au-dessus de sa liste.
- Liens notifications UUID/type/univers, objet opportunité exact ; cible inconnue vers notifications de son rôle avec explication, jamais accueil trompeur.
- Raccourcis sans troncature essentielle ; titres Artisan 28 sp, marges 16/20 dp.
- Dépendance directe @react-navigation/native déclarée dans l’intervalle SDK ^7.1.8, résolution existante 7.5.0 conservée (aucun changement de résolution).
- Deux hashes de présentation historiques actualisés avec anciens hashes et motif explicite : ShellControl rôle accessible et WorkspaceShortcutGrid texte complet. Aucun invariant métier retiré.

R02/R03/R05/R19/R27/R29/R30 natifs, PDF réel et performance restent PHYSICALLY-DEFERRED. Multi-photo reste DEFERRED (contrat 1 photo honnête).
