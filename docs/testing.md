# Tests

| Niveau | Commande | Contenu |
| --- | --- | --- |
| Unitaires | `npm test` (projet `unit`) | les 10 moteurs de jeu (règles, fin de partie, délais, informations cachées, vues publiques/privées), dispatcher push (envoi, tickets, erreurs), liens profonds rejouables, sélection aux dames, placement de flotte, présentation (résultats, quiz, impostor, Party, groupes, quêtes), niveaux, erreurs (tout code `PV_*` du serveur a un message), présence, stockage sécurisé |
| Composants | `npm test` (projet `ui`) | design system, plateau Connect Four, registre des rendus (chaque moteur a un rendu ; chaque schéma d'état lit la vue publique réelle du moteur) |
| Intégration SQL | `npm run test:db` | 113 tests sur PostgreSQL 16 jetable + simulateur Supabase : privilèges et RLS (aucune RPC pour `anon`, RLS partout), salons, Connect Four, moteurs via le vrai handler `game-action` (échecs, morpion, reversi, dames, bataille navale, quiz, calcul, impostor, memory) dont le secret des informations cachées, Party, messages privés (confidentialité, blocage, anti-spam), groupes, succès/quêtes (anti-farming, paiement unique), push (file, préférences, droits), concurrence (coups simultanés, double réclamation, course fin de temps / abandon), matchmaking, maintenance |
| Bout en bout | `npm run test:e2e` | vraie pile locale (PostgreSQL + Supabase Auth + PostgREST + Edge Functions `game-action` et `push-dispatch` sous Deno, sans Realtime) + build web + 3 navigateurs : 24 étapes (inscription, amis, Connect Four, morpion, bataille navale, calcul express, messages, push vers une imitation de l'API Expo, groupe, quêtes, lien d'invitation ouvert déconnecté puis inscription, Party de 2 manches Impostor + Memory à 3 joueurs) |

Prérequis : binaires PostgreSQL 16 ; pour l'E2E, Chromium (Playwright) et un accès
réseau pour télécharger une fois PostgREST, Supabase Auth et Deno dans `.cache/e2e`.
Les captures sont écrites dans `tests/e2e/artifacts/`.

Les tests d'intégration et E2E utilisent des bases jetables : ils ne touchent jamais
un projet réel. Les cibles iOS/Android sont vérifiées par compilation des bundles
Hermes (`npx expo export --platform android --platform ios`), **pas sur appareil**.

## Tests de charge (à faire)

Scénarios prévus sur une préproduction dédiée : nombreux salons, connexions
simultanées, reconnexion massive, rafales de chat, matchmaking concurrent.
