# Tests

| Niveau | Commande | Contenu |
| --- | --- | --- |
| Unitaires | `npm test` (projet `unit`) | moteur Connect Four (vecteurs partagés), présentation des résultats, niveaux, conversion OKLCH, stockage sécurisé découpé, erreurs, horloge serveur, filtres du catalogue, présence, messages système, schémas d'auth, callback de lien profond |
| Composants | `npm test` (projet `ui`) | boutons (désactivé, chargement), champ de saisie, plateau Connect Four (colonnes jouables, pleines, hors tour) |
| Intégration SQL | `npm run test:db` | 61 tests sur un PostgreSQL 16 jetable + simulateur Supabase (`supabase/tests/supabase_shim.sql`) : privilèges, RLS, onboarding, amis, blocage, présence, salons (cycle de vie, hôte, exclusion, invitations, chat), Connect Four (vecteurs, versions, tour, horloge, abandon), XP et anti-farming, Elo, matchmaking, maintenance |
| Bout en bout | `npm run test:e2e` | vraie pile locale (PostgreSQL + Supabase Auth + PostgREST, sans Realtime) + build web + 2 navigateurs : inscription, onboarding, demande d'ami, salon, invitation, prêts, partie complète, persistance (XP, stats, coups), revanche où le perdant commence, profil |

Prérequis : binaires PostgreSQL 16 (`initdb`, `pg_ctl`) ; pour l'E2E, Chromium
(Playwright) et un accès réseau pour télécharger une fois PostgREST et Supabase Auth
dans `.cache/e2e`. Les captures sont écrites dans `tests/e2e/artifacts/`.

Les tests d'intégration et E2E utilisent des bases jetables : ils ne touchent jamais
un projet réel.

## Tests de charge (à faire)

Scénarios prévus, à exécuter sur un projet de préproduction dédié : création de
nombreux salons, connexions simultanées, reconnexion massive, rafales de chat,
matchmaking concurrent. `pgbench` (scripts SQL appelant les RPC sous des JWT de test)
couvre la base ; un outil type k6 couvrira l'API.
