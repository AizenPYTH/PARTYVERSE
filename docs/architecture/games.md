# Moteurs de jeu

Tous les résultats (coups, tours, pendules, scores, classements, XP, Elo) sont décidés
côté serveur. Le client n'envoie que des **intentions** ; il n'affiche que ce que le
serveur publie.

## Deux familles

| Modèle | Jeux | Où vivent les règles |
| --- | --- | --- |
| `turn_based_sql` | Connect Four | entièrement en SQL (`submit_connect_four_move`) |
| `turn_based_engine` | Morpion, Chess Arena, Reversi, Dames, Bataille navale, Quiz Rush, Calcul Express, Impostor, Memory | moteur TypeScript pur exécuté par l'Edge Function `game-action` ; le SQL garde verrous, versions, échéances et finalisation |

## Moteurs TypeScript partagés

`supabase/functions/_shared/engines/*.ts` — modules purs et déterministes, importés :

- par l'Edge Function `game-action` (Deno), seule autorité ;
- par l'application (alias `@engines/*`) uniquement pour **afficher** des aides (coups
  légaux, sélection) — le serveur revalide tout.

Contrat (`types.ts`) :

```ts
interface GameEngine<S, A> {
  init(ctx): Transition<S>;                 // état initial
  parseAction(raw): A | null;               // validation stricte de l'intention
  apply(state, seat, action, ctx): Transition<S> | { error: 'PV_…' };
  onTimeout(state, ctx): Transition<S>;     // appelé quand l'échéance est passée
  publicView(state): unknown;               // ce que tout le monde voit (jamais de secret)
  privateView(state, seat): unknown;        // ce que seul ce siège voit
  redactAction?(action): unknown;           // ce qui peut entrer dans le journal des coups
}

interface Transition<S> {
  state: S; activeSeats: number[]; turnSeat: number | null; deadlineMs: number | null;
  outcome?: { outcome; reason; results: [{ seat, result, rank, score }] };
  log?: Record<string, unknown>;
}
```

`ctx` fournit l'heure **du serveur de base de données**, le nombre de sièges, les
réglages validés, une graine aléatoire par partie (`rng.ts`, mulberry32) et les sièges
absents. Les données nécessaires au départ (banque de questions, paires de mots) sont
chargées par SQL (`app_private.*_start_data`) et ne passent jamais par le client.

## Cycle d'une action

1. Le client appelle `game-action` avec son JWT : `{ op: 'action', matchId, version, action }`.
2. La fonction identifie le joueur (`auth.getUser`), charge l'état serveur
   (`engine_load`, service role), vérifie statut / siège / version / échéance,
   valide l'intention (`parseAction`) et calcule la transition (`apply`).
3. `engine_commit` (SQL, sous verrou salon → partie) revérifie **tout** (version,
   siège actif, échéance), écrit l'état public (`matches.state`), l'état serveur
   (`match_server_state`, aucun accès client), les états privés
   (`match_private_state`, RLS `user_id = auth.uid()`), le coup (`match_moves`, après
   `redactAction`) puis, si la transition a un résultat, finalise
   (`finalize_match_results` : stats, XP, Elo en duel classé, Party, groupes, succès).
4. Realtime notifie la mise à jour ; le client relit l'état validé par Zod
   (polling de secours sans Realtime).

Délais : n'importe quel joueur peut demander `{ op: 'timeout' }` une fois l'échéance
passée ; la maintenance (`run_maintenance`, chaque minute) tranche les parties que
personne ne réclame. Un `PV_STALE_STATE` (version dépassée) est renvoyé une fois
automatiquement par le client si son siège peut encore agir (phases simultanées).

## Informations cachées

| Jeu | Secret | Protection |
| --- | --- | --- |
| Bataille navale | position des flottes | état serveur + vue privée ; placement expurgé du journal ; flottes révélées en fin de partie |
| Quiz Rush / Calcul Express | bonne réponse, choix des autres | réponse publiée seulement à la clôture de la question ; choix expurgés |
| Impostor | rôle, mots, votes | mot de chacun en vue privée (même forme pour tous) ; votes et proposition expurgés ; révélation finale |
| Memory | ordre du paquet | seules les cartes retournées ou trouvées sont publiques |

Chaque étape réécrit la vue privée de **tous** les sièges (null compris) pour qu'aucune
information privée ne survive à son étape. Les tests SQL vérifient qu'un adversaire ne
peut lire ni l'état serveur, ni la vue privée d'un autre, ni les secrets via le journal.

## Ajouter un jeu

1. Moteur `supabase/functions/_shared/engines/<jeu>.ts` + `<jeu>.test.ts`, enregistré
   dans `registry.ts`.
2. Migration : ligne du catalogue (`network_model = 'turn_based_engine'`, réglages
   `rules.settings` avec options et défaut, modes) et, si besoin, chargeur
   `app_private.<jeu>_start_data` ajouté à `engine_start_data`.
3. Rendu `src/features/games/<jeu>/` sur `MatchShell`, exportant son `stateSchema`
   (vérifié contre `publicView` par `renderers.test.tsx`), ajouté à `MATCH_RENDERERS`
   et `SUPPORTED_GAMES`.
4. Tests SQL via `tests/db/engineDb.ts` (`startEngineMatch`, `act`).
5. Codes `PV_*` nouveaux dans `src/lib/errors.ts` (un test échoue sinon).
