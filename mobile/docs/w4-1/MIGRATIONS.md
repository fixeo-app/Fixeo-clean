# Migrations exactes appliquées

Cible unique : `kqyhusnbybsukbcaoqtu`. Versions locales alignées sur les versions retournées par Supabase après application. Aucun squash ni modification rétroactive du SQL appliqué.

| Fichier | SHA256 |
| --- | --- |
| `supabase/migrations/20261004181121_mobile_intelligence_jwt_attestation_v1.sql` | `dadd4596d5985e1e8f1a900e759e39239ca980874e2e91b1badca3adf2d2778a` |
| `supabase/migrations/20261004183523_mobile_intelligence_replay_city_guard.sql` | `d9a807483f17ba093170e18fabcf1d254e68dbede71c330b2460d7e2376a7b95` |
| `supabase/migrations/20261004184025_mobile_intelligence_diagnostic_payload_guard.sql` | `14e1b503072b86cfef84c56c4c1852199b67b25016f176e50a384a090702dbe0` |

La deuxième migration garde la ville lors du replay de session. La troisième corrige la priorité de l’extraction JSON avant validation des paramètres Diagnostic.

Rollback : `ROLLBACK.sql`. Il retire les seules fonctions/policies W4.1 sans effacer les données métier. Le flag de configuration est actuellement désactivé.
