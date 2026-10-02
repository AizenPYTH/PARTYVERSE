# Base de données

Migrations versionnées dans `supabase/migrations` (appliquées dans l'ordre du nom) :

| Fichier | Contenu |
| --- | --- |
| `…100_foundation` | schéma `app_private`, révocation des droits par défaut, `require_user`, sanctions, limitation de débit, termes bloqués, générateur de codes |
| `…200_game_catalog` | catalogue des 10 jeux, validation des réglages de salon |
| `…300_profiles_inventory` | profils, réglages privés, cosmétiques + inventaire, courbe de niveaux, notifications, registre d'XP, onboarding |
| `…400_social_graph` | demandes d'ami, amitiés, blocages, recherche, présence, signalements |
| `…500_lobbies` | salons, membres, exclusions, chat, invitations, cycle de vie, signalement avec preuves |
| `…600_matches_connect_four` | parties, joueurs, coups, moteur Connect Four, Elo, stats, XP, abandon/temps |
| `…700_matchmaking` | tickets, fenêtre de niveau croissante, appariement atomique |
| `…800_social_queries` | lectures respectueuses de la confidentialité (amis + présence, profils, classements, accueil) |
| `…900_realtime_maintenance` | publication Realtime, maintenance planifiée (pg_cron) |

## Conventions

- UUID partout (`gen_random_uuid()`), `created_at`/`updated_at` (trigger), `version` sur les parties.
- `public` = exposé par l'API (protégé par RLS) ; `app_private` = interne, jamais exposé.
- Erreurs métier : `raise exception 'PV_CODE'` ; le client traduit (`src/lib/errors.ts`).
- Les RPC renvoient des types plats (`returns table`) ou du `jsonb` validé par Zod côté client.

## Tables principales

| Table | Lecture (RLS) | Écriture client |
| --- | --- | --- |
| `profiles` | tout joueur connecté (identité publique) | colonnes `display_name, avatar_id, title_id, bio, favorite_games` du propriétaire, validées par trigger (objets possédés, jeux existants) |
| `user_settings` | propriétaire | colonnes de confidentialité/notifications du propriétaire |
| `cosmetic_items` / `player_inventory` | catalogue / propriétaire | aucune (attribution serveur) |
| `notifications` | destinataire | suppression ; lecture via `mark_notifications_read` |
| `xp_events`, `level_history` | propriétaire | aucune |
| `friend_requests`, `friendships`, `blocks` | parties concernées | RPC uniquement |
| `presence` | aucune (RPC `list_friends`, `get_player_profile`) | RPC `presence_heartbeat` |
| `lobbies`, `lobby_members` | membres, invités, salons publics ouverts | RPC uniquement |
| `lobby_messages` | membres | RPC `send_lobby_message` |
| `lobby_invitations` | expéditeur, destinataire | RPC uniquement |
| `matches`, `match_players`, `match_moves` | joueurs + membres du salon (spectateurs) | RPC uniquement |
| `player_ratings` | tous (classement public) | aucune |
| `player_game_stats` | propriétaire (autres : via RPC selon confidentialité) | aucune |
| `matchmaking_tickets` | propriétaire | RPC uniquement |
| `reports` | auteur | RPC `report_user` |
| `app_private.moderation_actions` | — | outils de modération (service role) |

## RPC exposées (rôle `authenticated`)

- **Identité** : `complete_onboarding`, `is_username_available`, `change_username` (2 / 7 jours), `get_home_overview`, `get_player_profile`, `list_match_history`, `get_leaderboard`, `prepare_account_deletion`.
- **Social** : `send_friend_request`, `respond_friend_request`, `cancel_friend_request`, `remove_friend`, `block_user`, `unblock_user`, `list_blocked_users`, `search_players`, `list_friends`, `list_friend_requests`, `list_recent_players`, `report_user`.
- **Présence** : `presence_heartbeat`, `presence_sign_out`, `get_my_presence_status`.
- **Salons** : `create_lobby`, `join_lobby`, `join_lobby_by_code`, `leave_lobby`, `kick_lobby_member`, `set_lobby_ready`, `update_lobby_settings`, `start_lobby_match`, `get_lobby_state`, `list_public_lobbies`, `get_my_active_lobby`.
- **Invitations** : `invite_to_lobby`, `respond_lobby_invitation`, `cancel_lobby_invitation`, `list_my_invitations`.
- **Chat** : `send_lobby_message`, `list_lobby_messages`.
- **Parties** : `get_match_state`, `submit_connect_four_move`, `resign_match`, `claim_match_timeout`, `get_my_active_match`.
- **Classé** : `enqueue_matchmaking`, `poll_matchmaking`, `cancel_matchmaking`.
- **Notifications** : `mark_notifications_read`.

## Limites de débit (fenêtre glissante, `app_private.enforce_rate_limit`)

| Action | Limite |
| --- | --- |
| demandes d'ami | 30 / h |
| création de salon | 15 / 10 min |
| code de salon (y compris codes faux) | 20 / 10 min |
| invitations | 30 / 10 min |
| messages de chat | 6 / 10 s (+ doublon refusé 30 s) |
| matchmaking | 30 / 10 min |
| signalements | 10 / jour |
| changement de pseudo | 2 / 7 jours |

## Rétention

Appliquée par `app_private.run_maintenance()` (chaque minute via pg_cron) :

- événements de limitation de débit : 1 jour ;
- notifications lues : 90 jours ;
- messages des salons fermés : 30 jours ;
- invitations et tickets expirés : marqués `expired` à échéance ;
- salons inactifs depuis 2 h : `expired` ; membres sans heartbeat depuis 5 min retirés des salons en attente.

Suppression de compte : `auth.users` en cascade sur toutes les données personnelles ;
les parties des adversaires sont conservées avec le joueur anonymisé (`SET NULL`).
