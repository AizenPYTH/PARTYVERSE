# Progression et récompenses

Toutes les attributions sont calculées et écrites par le serveur
(`app_private.award_xp`, `app_private.match_xp`). Le client ne fait qu'afficher.

## XP de partie (alignée sur la maquette)

| Issue | XP |
| --- | --- |
| Victoire | 40 |
| Match nul | 20 |
| Défaite | 10 (la participation est récompensée) |

Anti-farming :

- aucune XP si la partie se termine par abandon, temps ou départ **avant 4 coups** ;
- 30 parties récompensées par jour maximum ;
- 10 parties récompensées par jour maximum **contre le même adversaire** ;
- chaque gain est unique par `(joueur, source, référence)` (registre `xp_events`) : rejouer
  une requête ne donne jamais deux fois l'XP.

## Niveaux

XP nécessaire pour passer du niveau L à L+1 : `100 + 50 × (L − 1)` (niveau max 100).
Fonction SQL `app_private.xp_for_level`, miroir d'affichage `src/features/progression/levels.ts`
(testé contre les mêmes valeurs). Chaque niveau atteint est historisé (`level_history`)
et notifié.

## Cosmétiques

Objets à identifiants stables, rareté (`common`, `rare`, `epic`, `legendary`) et
condition d'obtention explicite (`unlock_rule`) :

- 8 avatars et le titre « Recrue » de départ ;
- niveau 3 : avatar Galaxie prisme, titre Challenger ;
- niveau 5 : avatar Éclipse dorée, titre Stratège ;
- niveau 10 : avatar Supernova, titre Légende.

Les objets se débloquent automatiquement au passage de niveau. Un trigger refuse
d'équiper un objet non possédé. Aucun achat n'existe et aucun objet ne donne
d'avantage en jeu.

## Classements

Elo séparé par jeu et par mode (`player_ratings`), uniquement pour les parties
issues du matchmaking classé. Classements mondial et entre amis (`get_leaderboard`).
