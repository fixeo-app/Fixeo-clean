# W5 Bio — conflit de contrat détecté avant application

**STOP — W5 ARTISAN OS NORTH STAR NOT REACHED**

Le GO Bio du 5 octobre 2026 autorise une nouvelle RPC et impose qu'aucune colonne Artisan autre que `description` ne change pendant son test. La lecture des triggers staging révèle un effet existant incompatible avec cette exigence.

## Preuve staging, lecture seule

Projet : `fixeo-diagnostic-staging / kqyhusnbybsukbcaoqtu`.

```sql
CREATE TRIGGER artisans_updated_at
BEFORE UPDATE ON public.artisans
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Corps actuel de public.update_updated_at() :
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
```

Le trigger est activé (`tgenabled = O`). Toute mise à jour de bio déclenche donc l'écriture de `updated_at`, même avec `SET description = ...` comme seule affectation dans la RPC. Les autres triggers ont également été lus : classification et vérification ciblent d'autres colonnes ; l'audit Control surveille les indicateurs de vérification/classification.

La RPC Bio est absente, les privilèges UPDATE directs `authenticated` sur les colonnes Artisan restent à zéro, et aucune session des deux identités synthétiques autorisées n'est active. Seule V2 est enregistrée pour cette journée (`20261005091927`). Voir `staging-readonly.json`.

## Migration candidate préparée

- Nom généré par `supabase migration new` : `20261005104459_mobile_w5_artisan_bio.sql`.
- SHA-256 : `82b3dbb281b39867b9c20227ffbf689e2a8cceb902461c7d37aa7e8e78cfb0ef`.
- Une seule création : `public.w5_update_my_artisan_bio_v1(text)`.
- Corps issu de la proposition revue ; prédicat final explicite `owner_user_id = auth.uid()`, avec sélection propriétaire et guard canonique conservés.
- SECURITY DEFINER, search_path vide, longueur limitée à 4000, seule affectation SQL à `public.artisans.description`.
- ACL : révocation PUBLIC/anon, EXECUTE authenticated ; aucune ACL de table modifiée.
- DROP=0, DELETE=0, TRUNCATE=0 ; aucun DML métier exécuté par la définition.

Le candidat est conservé **dans ce dossier de revue, hors du répertoire d'application des migrations**, en attendant la résolution du conflit. Il n'a pas été appliqué. V2 est inchangée : SHA-256 `6f017c6f97c7df25d0acc6117da5bc93c57bd9f7025ed199cdfd1f9f2cae7ed2`.

## Reproduction locale

```sh
node mobile/docs/w5/bio-preflight/reproduce.cjs
```

PGlite isolé reproduit la définition exacte du trigger staging. Le guard est simulé uniquement pour isoler cet effet : ce test ne constitue pas une certification Auth.

- Création de la RPC : données inchangées.
- Appel ultérieur : colonnes changées `description` **et** `updated_at`.
- Le critère strict « description seule » échoue.
- Aucun appel métier staging, aucune nouvelle session, aucune mutation de schéma ou de données staging dans cette reprise.

Résultat détaillé : `reproduction.json`. Les tests réels Bio, l'éditeur Mobile et la recertification W5 attendent cette résolution ; les succès W5 précédents restent attachés au SHA `5a2e5d19855e3ee34ee07baef694e6ece91d6b28`.

## Décision nécessaire

Autoriser **`updated_at` comme seule exception automatique**, via le trigger canonique existant inchangé. Le contrat de la RPC continuerait à n'affecter explicitement que `description`. Les tests vérifieraient `description` et `updated_at`, puis l'identité exacte de toutes les autres colonnes. Cette exception n'est pas couverte par le GO actuel, qui interdit explicitement tout changement d'une autre colonne.
