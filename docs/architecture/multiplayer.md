# Modèle multijoueur

## Principe

Le client envoie des **intentions** ; le serveur décide. Aucun résultat, score,
gain d'XP ou classement ne provient du client.

## Tour par tour en SQL (`network_model = turn_based_sql`) — Connect Four

`submit_connect_four_move(match, column, expected_version)` :

1. verrouille le salon puis la partie (ordre fixe → pas d'interblocage avec un départ simultané) ;
2. vérifie : participant, partie active, `expected_version` = version courante
   (`PV_STALE_STATE` sinon — un double tap ne joue jamais deux fois), tour du joueur,
   échéance non dépassée (`PV_TURN_EXPIRED`), colonne valide et non pleine ;
3. écrit le coup dans `match_moves` (clé `(match_id, move_number)`), calcule la ligne
   gagnante, met à jour l'état et la version ;
4. en fin de partie, `finalize_match` applique **dans la même transaction** :
   résultats, Elo (si classée), statistiques, XP, retour du salon en attente.

Le moteur TypeScript (`src/features/games/connect-four/engine.ts`) ne sert qu'à
l'affichage (jeton optimiste, colonnes jouables). Les deux moteurs sont vérifiés
par les **mêmes vecteurs** (`tests/fixtures/connect-four-vectors.json`).

### Horloge autoritaire

- `turn_deadline` est fixé par le serveur (`now() + turn_seconds`).
- Le client affiche un compte à rebours corrigé par le décalage mesuré sur
  `server_time` (`src/lib/serverClock.ts`).
- À échéance, n'importe quel participant appelle `claim_match_timeout` ; le serveur
  vérifie l'heure et attribue la défaite au joueur dont c'est le tour.
- Filet de sécurité : la maintenance tranche les échéances dépassées de 15 s.

### Déconnexion, reconnexion, abandon

- Quitter le salon pendant une partie = défaite (`abandon`).
- Perdre la connexion : le joueur reste dans la partie ; son temps de tour s'écoule.
- Reconnexion : l'écran relit `get_match_state` (et l'accueil propose « Reprendre »).

## Temps réel Supabase : signal, pas vérité

Les écrans s'abonnent à `postgres_changes` (filtrés par RLS) **uniquement pour
invalider** leurs requêtes, puis relisent l'état via des RPC validées par Zod.
Si le canal n'est pas connecté (réseau instable, Realtime indisponible), un
**polling de secours** prend le relais (salon 4 s, partie 2 s, invitations 15 s).
Le test E2E tourne volontairement **sans** Realtime pour valider ce mode.

## Matchmaking classé

- Ticket unique par joueur (clé primaire) ; fenêtre de niveau ±100, +50 toutes les
  10 s, plafonnée à ±600 ; joueurs bloqués et hors ligne exclus.
- Chaque `poll_matchmaking` tente un appariement : verrou du ticket courant puis
  `FOR UPDATE SKIP LOCKED` sur l'adversaire, création du salon et de la partie dans
  la même transaction → aucune double affectation possible.
- Elo distinct par `(jeu, mode)` ; K = 40 sur les 20 premières parties, puis 24.
- Après la partie, le salon devient amical : une revanche ne modifie pas le classement.
- Non implémenté : confirmation de présence avant le début (voir roadmap).

## Jeux à venir

| Jeu | Modèle prévu | Points clés |
| --- | --- | --- |
| Chess Arena | `turn_based_edge` | Edge Function avec chess.js (validation, mat, nulle), puis `apply_validated_move` réservé au service role ; pendule par joueur côté serveur. |
| Quiz Rush | `turn_based_edge` | Banque de questions versionnée (table + outil d'admin) ; la bonne réponse n'est révélée qu'après la manche. |
| Impostor | `turn_based_edge` | État secret par joueur dans une table séparée lisible par son seul propriétaire ; jamais dans `matches.state`. |
| Bomb Squad | `turn_based_edge` | Génération déterministe par graine stockée côté serveur, vues différentes par rôle. |
| Draw & Guess | `realtime_server` | Traits envoyés en segments compressés (pas d'image complète) via le serveur temps réel ; mot secret côté serveur. |
| Pocket Pool, Mini Golf, Micro Racers | `realtime_server` | Serveur autoritaire Colyseus, simulation déterministe (pas fixe), état minimal synchronisé, reprise de session. |
| Mode Party | orchestrateur | Enchaîne des `matches` dans un même salon (`party_sessions`, `party_rounds`), indépendant des moteurs. |

Supabase Realtime n'est **pas** utilisé pour la simulation physique.

## v0.2 — moteurs TypeScript

Les jeux au tour par tour autres que Connect Four utilisent `network_model =
'turn_based_engine'` : un moteur TypeScript pur exécuté par l'Edge Function
`game-action`, le SQL gardant verrous, versions, échéances et finalisation. Phases
simultanées (placement, réponses, votes), informations cachées et N joueurs sont pris
en charge. Détails : [games.md](games.md).
