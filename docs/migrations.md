# Migrations

Les migrations de `supabase/migrations` s'appliquent dans l'ordre de leur horodatage
(`npx supabase db push` sur le projet lié, ou `npx supabase db reset` en local). Elles
sont écrites pour une base vierge et rejouées intégralement par `npm run test:db`
(PostgreSQL 16 jetable + `supabase/tests/supabase_shim.sql`) à chaque exécution.

| Fichier | Contenu |
| --- | --- |
| `20261002000100_foundation` | schéma `app_private`, utilisateur courant, sanctions, limitation de débit, filtre de termes |
| `…0200_game_catalog` | catalogue des jeux |
| `…0300_profiles_inventory` | profils, réglages, cosmétiques, inventaire, notifications, XP, niveaux |
| `…0400_social_graph` | amis, demandes, blocages, présence, signalements |
| `…0500_lobbies` | salons, membres, chat, invitations, codes |
| `…0600_matches_connect_four` | parties, joueurs, coups, Elo, stats, moteur SQL Connect Four |
| `…0700_matchmaking` | tickets et appariement Elo |
| `…0800_social_queries` | lectures : amis + présence, profils, classements, accueil, suppression de compte |
| `…0900_realtime_maintenance` | publication Realtime, `run_maintenance` + pg_cron |
| `20261010000100_engine_framework` | parties N joueurs, états serveur/privés, RPC `engine_*`, finalisation générique |
| `…0200` à `…0900` | catalogue et données de Morpion, Échecs, Reversi, Dames, Bataille navale, Quiz Rush (banque de questions), Calcul Express, Impostor (paires de mots), Memory ; choix du jeu d'un salon |
| `20261011000100_party_mode` | sessions, manches, scores de Party |
| `20261012000100_direct_messages` | messages privés, réglage `messages_from`, nouveaux types de notification |
| `20261012000200_groups` | groupes, invitations, chat, activité, défis ; découpage du hook de fin de partie |
| `20261012000300_report_contexts` | signalements depuis messages privés et chats de groupe |
| `20261013000100_progression` | parties comptées, succès, quêtes, série, classement XP |
| `20261014000100_push_notifications` | jetons, file d'envoi, préférences push, RPC du dispatcher |
| `20261015000100_room_controls` | transfert d'hôte, partie rapide |

Règles : une migration publiée n'est jamais modifiée ; toute correction passe par une
nouvelle migration (`create or replace function`, `alter table …`). Chaque table
`public` active la RLS (test), chaque fonction est `search_path = ''` et accorde
`execute` explicitement (aucune à `anon`, test).

Retour arrière : pas de migrations « down ». En production, sauvegarde (PITR Supabase)
avant chaque `db push`, et correctif par migration suivante.
