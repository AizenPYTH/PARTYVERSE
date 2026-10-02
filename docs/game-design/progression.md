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

Classement XP : mondial ou entre amis, cette semaine ou depuis toujours
(`get_xp_leaderboard`, écran « Classement XP »).

## Parties « comptées » (anti-abus)

Quêtes et succès ne comptent que les parties **terminées avec au moins deux coups
joués par des joueurs** (`app_private.counted_matches`) : un abandon immédiat ou un
salon déserté ne fait rien progresser. La progression est **recalculée** à partir des
tables sources à chaque lecture, jamais incrémentée par le client.

## Succès (19)

Catalogue `public.achievements` (métrique, seuil, récompense) : premières parties et
paliers de parties (1, 10, 50, 200), victoires (1, 10, 50, 200), série de 5 victoires
dans un jeu, 1300 Elo, 5 et 10 jeux différents, 3 et 7 jours d'affilée, 5 amis, membre
d'un groupe, vainqueur d'une Party, niveaux 10 et 25. Débloqués automatiquement après
chaque partie (et à l'ouverture de l'écran pour les succès sociaux), notifiés, payés
une seule fois (`award_xp` source `achievement`, référence déterministe). Visibles sur
le profil selon la confidentialité des statistiques.

## Quêtes quotidiennes et hebdomadaires

Pool `public.quest_definitions` ; chaque joueur reçoit **3 quêtes par jour et 3 par
semaine** (rotation personnelle et déterministe, semaine du lundi, UTC). Exemples :
jouer 3 parties, gagner 2 parties, jouer à 2 jeux différents, jouer avec un ami,
jouer 3 manches de Party. Une quête terminée se récupère (`claim_quest`, verrou par
joueur, réclamation unique par période, XP payée une fois).

## Série de jours

Nombre de jours UTC consécutifs, jusqu'à aujourd'hui ou hier, avec au moins une partie
comptée. Rappel push du soir en option.
