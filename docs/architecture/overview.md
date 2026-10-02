# Architecture — vue d'ensemble

## Diagnostic initial

Le dépôt était vide (aucun commit). Seul existant : la maquette haute fidélité
« PARTYVERSE · fondations et écrans clés v1 » ([handoff](../design/handoff-v1.md)),
qui fixe identité, jetons et six écrans. Rien n'était à préserver côté code ; la
maquette est respectée et ses écarts sont listés dans [design/README.md](../design/README.md).

## Pile technique et justifications

| Domaine | Choix | Pourquoi |
| --- | --- | --- |
| App | Expo SDK 57, React Native 0.86, Expo Router (`src/app`), TypeScript strict | Un seul socle iOS / Android / web, routes typées par fichier, CNG (pas de dossiers natifs versionnés). |
| Styles | `StyleSheet` + jetons TypeScript (`src/design-system`) | Pas de NativeWind : moins de configuration Babel/Metro et zéro risque de compatibilité avec Reanimated 4 / SDK 57. Les jetons sont la source unique. |
| Données distantes | TanStack Query | Cache, invalidation, états de chargement/erreur uniformes, polling de secours. |
| État local partagé | Zustand | Session et drapeaux d'onboarding, sans boilerplate. |
| Validation | Zod (formulaires **et** réponses serveur) | Toute réponse RPC est validée à l'exécution (`src/lib/rpc.ts`). |
| Formulaires | React Hook Form + resolver Zod | Formulaires d'auth. |
| Animations | Reanimated 4 | Chute des jetons, pressions, shimmer ; tout respecte « Réduire les animations ». |
| Retour haptique | expo-haptics | Dépôt de jeton, fin de manche, invitations. |
| Stockage sécurisé | expo-secure-store (découpé en blocs) | Les sessions Supabase dépassent la limite ~2 Ko du trousseau ; rien de sensible dans AsyncStorage. |
| Backend | Supabase : Postgres, Auth, Realtime, Edge Functions | Données relationnelles + RLS + transactions ; Realtime comme signal d'invalidation. |
| Polices | Unbounded, Manrope, JetBrains Mono (paquets `@expo-google-fonts`, OFL) | Imposées par la maquette ; embarquées (pas de réseau au lancement). |

Dépendances volontairement **absentes** : bibliothèque d'icônes (icônes SVG de la
maquette dans `Icon.tsx`), AsyncStorage, expo-image, NativeWind.

## Couches

```
Écran (src/app)  →  hooks de feature (TanStack Query)  →  api.ts (callRpc + Zod)  →  Supabase
                         ↑ invalidation                                    ↓
                 useRealtimeInvalidation  ←———— Realtime (postgres_changes, filtré par RLS)
```

- **Écrans** : composition et navigation uniquement.
- **Features** (`src/features/<domaine>`) : `api.ts` (schémas Zod + appels), `hooks.ts`
  (requêtes/mutations), composants spécifiques, logique pure testée (`*.test.ts`).
- **Jeux** (`src/features/games/<jeu>`) : schéma d'état (Zod), présentation, rendu sur
  `MatchShell` (barre, joueurs, chrono, résultat, chat). La route `/match/[matchId]`
  choisit le rendu dans `MATCH_RENDERERS` ; un jeu sans rendu n'est jamais jouable.
- **Serveur** : toute écriture passe par une RPC `SECURITY DEFINER` qui valide entrée,
  droits et état, dans une transaction. Les tables ne sont jamais écrites directement
  par le client, sauf colonnes explicitement accordées (profil, réglages).

## Interfaces de jeu

| Concept | Où | Rôle |
| --- | --- | --- |
| `GameCatalog` | `public.game_catalog` | bornes de joueurs, modes (avec réglages et classement), réglages autorisés, `network_model`, disponibilité |
| `GameSession` | `public.matches` + `match_players` | état public versionné, sièges actifs, tour, échéance, issue, rang/score |
| `GameAction` | `submit_connect_four_move` (SQL) ou Edge Function `game-action` | intention du joueur + version attendue |
| `GameRules` | `app_private.c4_*` (SQL) ou `supabase/functions/_shared/engines/*.ts` | validation autoritaire, informations cachées |
| `GameResult` | `app_private.finalize_match_results` | résultats N joueurs, stats, Elo (duel classé), XP, Party, groupes, succès |
| `GameRenderer` | `src/features/games/<jeu>` + `MATCH_RENDERERS` | rendu et présentation, sans autorité |

`network_model` : `turn_based_sql` (Connect Four), `turn_based_engine` (tous les autres
jeux actuels, moteur TypeScript exécuté par l'Edge Function), `realtime_server`
(billard, mini-golf, course, dessin — à venir). Détails : [games.md](games.md),
[multiplayer.md](multiplayer.md), règles : [../game-design/rules.md](../game-design/rules.md).

## Autres domaines

- [Social : messages privés, groupes, confidentialité](social.md)
- [Notifications push](push.md)
- [Party](../game-design/rules.md#party) et [progression](../game-design/progression.md)

## Sécurité (résumé)

- RLS activée sur **toutes** les tables `public` ; test automatique qui échoue sinon.
- Aucune fonction exécutable par `anon` (test automatique) ; `EXECUTE` accordé fonction par fonction.
- Le client ne peut écrire ni XP, ni niveau, ni inventaire, ni classement, ni résultat (tests).
- Fonctions `search_path = ''`, identifiants qualifiés, verrous dans un ordre fixe (salon → partie).
- Limitation de débit serveur (demandes d'ami, invitations, chat, codes de salon, signalements…).
- Les tentatives de code de salon invalides sont comptées (la RPC ne lève pas d'erreur).
- Secrets : seule la clé publique `anon` est dans l'app ; la clé service ne sert que dans les Edge Functions (`game-action`, `push-dispatch`, `delete-account`).

## Évolutivité

- Le matchmaking est « pull » (chaque sondage tente un appariement, `SKIP LOCKED`) :
  pas de worker, et migrable vers un service dédié sans changer l'API client.
- Realtime ne sert que d'invalidation ; un serveur de jeu temps réel pourra publier
  ses propres événements sans toucher aux écrans existants.
- Les erreurs serveur sont des codes stables `PV_*` traduits côté client (`src/lib/errors.ts`).
