# Matrice déterministe RAFI v1

Tri : priorité P0 → P3, ancienneté connue décroissante, nombre d'objets décroissant, identifiant stable. L'identifiant dépend du type, de la cible, de la cohorte, du tenant/site et de la classification, jamais du texte généré ou de l'heure de refresh. Les doublons exacts sont supprimés ; la décision opérationnelle la plus prioritaire domine pour une même demande. Les opportunités réseau et les dossiers Finance distincts restent séparés.

| Faits canoniques observés | Décision / priorité | Autorité / parcours |
|---|---|---|
| Demande urgente sans gagnant depuis ≥ 120 min | Attente critique P0 | Dossier puis préparation Dispatch si new et hors Enterprise |
| Autre demande urgente, no_match ou attente ≥ 24 h | Prise en charge P1 | Dossier ; aucun rétablissement automatique de statut |
| Autre demande new sans gagnant | Prise en charge P2 | Dispatch gouverné |
| Mission orpheline ou validated face à une demande non validated | Incohérence P1 | Dossiers ; aucune réparation arbitraire |
| Mission acceptée sans nouveau jalon depuis ≥ 24 h | Mission vieillissante P2 | Le blocage est une hypothèse, pas un fait |
| Devis soumis en attente de revue | P1 après 24 h, sinon P2 | Quotes / version / preview / confirmation |
| Échec enregistré dans l'outbox de dispatch | P1 | Dossier ; pas de retry WhatsApp depuis RAFI |
| Backlog ville/métier, zéro profil déclaré disponible | P1 si urgence, sinon P2 | Network / observation ; Dispatch peut proposer une proximité |
| Backlog et profils déclarés disponibles | Capacité déclarée P3 | Operations ; aucune capacité simultanée présumée |
| Backlog et profils revendiqués, onboardés, non vérifiés | Revue réseau P1 si urgence, sinon P2 | Trust / artisan.verify après dossier individuel |
| Backlog et profils sans propriétaire non revendiqués | Activation P2 si urgence, sinon P3 | Recommandation ; aucune revendication Admin à la place du propriétaire |
| ≥ 10 demandes en attente, ≥ 50 % dans la cohorte | Concentration P3 | Observation courante ; pas d'anomalie statistique sans historique |
| Ville ou métier manquant | Contexte à qualifier P2 | Aucune affirmation de couverture zéro |
| Claim pending | P1 après 24 h, sinon P2 | Claims / approve ou reject / confirmation |
| verified ≠ is_verified | Conflit Trust P2 | verified reste canonique ; pas de backfill |
| Mission réellement terminée, prix final absent | Finance P2 | Settlement canonique, prix attendu relu |
| Reversement déclaré | Rapprochement P2 | Finance / preuve documentaire / version / confirmation |
| Confirmé supérieur à la commission | Écart Finance P1 | Examiner l'historique ; aucune correction automatique |
| SLA d'acceptation à risque ou gagnants contradictoires | Enterprise P1 | SLA canonique / tenant et site conservés |
| SLA dépassé, urgence, aucune acceptation | Enterprise P0 | Dossier ; aucune délégation de mutation tenant ajoutée |
| SLA dépassé mais acceptation déjà enregistrée | Revue historique P2 | Ne devient pas une urgence immédiate |
| Offres internes non expirées et mode internal_first | Opportunité interne P2 | Offres canoniques ; pas d'affectation par RAFI |
| Échéance fallback atteinte, internal_offered/no_internal_candidate | P1 | Opérateur Enterprise habilité |
| Dispatch hybride external_failed | P1 | Examiner le retry dans l'autorité Enterprise |

## Qualité et garde-fous

- FRESH : observation datée de ≤ 60 secondes ; PARTIAL : fenêtre bornée incomplète, avec total connu et nombre exposé distincts.
- STALE : pas de nouvelle recommandation calculée depuis une source ancienne. Le navigateur peut conserver sa dernière lecture en l'étiquetant périmée ; préparer une action impose un dossier et un preview relus.
- UNAVAILABLE : erreur/timeout/provenance invalide. Aucune valeur manquante ne devient zéro. Une source défaillante laisse les autres utilisables.
- Une absence de décision signifie seulement qu'aucune règle couverte ne s'est déclenchée dans la fenêtre observée.
- Les seuils de triage sont versionnés ici et testés sans IA externe. Seul le SLA configuré dans Enterprise constitue un engagement contractuel calculé.

## Couverture des tests

`rafi-engine.test.cjs` couvre vide, une/multiples priorités, égalité, âge, réseau, activation, claims, finance, Enterprise, partial/timeout/stale, contexte et dédoublonnage. `rafi-db.test.cjs` exécute les schémas/RPC/ACL réels dans PostgreSQL embarqué. `rafi-api.test.cjs` couvre Auth, refus, fanout borné et routage fermé. `rafi-ui.test.cjs` exerce le vrai DOM, l'échappement, la navigation, les réponses hors ordre, les erreurs et le retry idempotent. `staging/rafi.cjs` ajoute Supabase Auth/RPC/RLS réels sur le seul projet staging ; ses résultats ne prétendent jamais être des tests de mutation Production.
