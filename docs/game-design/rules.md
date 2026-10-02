# Règles des jeux

Toutes ces règles sont appliquées par le serveur. Les réglages entre crochets sont
choisis par l'hôte du salon parmi les options du catalogue (valeur par défaut en gras).

| Jeu | Joueurs | Classé | Réglages |
| --- | --- | --- | --- |
| Connect Four | 2 | oui | temps par tour |
| Morpion | 2 | oui | tour [10, **20**, 30 s] |
| Chess Arena | 2 | oui (Elo par cadence) | cadence [Bullet 1+0, **Blitz 3+2**, Rapide 10+5] |
| Reversi | 2 | oui | tour [20, **30**, 60 s] |
| Dames | 2 | oui | tour [30, **45**, 90 s] |
| Bataille navale | 2 | oui | placement [60, **90**, 120 s], tir [20, **30**, 45 s] |
| Quiz Rush | 2–8 | duel | questions [5, **8**, 10], temps [10, **15**, 20 s], catégorie [**toutes**, 9 thèmes] |
| Calcul Express | 2–8 | duel | questions [**10**, 15, 20], temps [8, **10**, 15 s] |
| Impostor | 3–12 | non | variante [**mot proche**, imposteur sans mot], tours d'indices [1, **2**, 3], tour [20, **30**, 45 s], discussion [30, **60**, 90 s] |
| Memory | 2–4 | non | paires [**8**, 12, 18], tour [10, **15**, 20 s] |

Temps écoulé : dans les duels au tour par tour, le joueur dont le temps expire perd
(aux échecs, nulle si l'adversaire n'a plus de matériel suffisant pour mater). Au
Memory, le tour passe. Au quiz, la question se clôt. À l'Impostor, l'indice est sauté ;
une discussion ou un vote expiré passe à l'étape suivante.

Abandon / départ : en duel, abandonner donne la victoire à l'adversaire. À 3 joueurs
ou plus, le joueur qui part est classé dernier et la partie continue tant qu'il reste
au moins deux joueurs.

## Morpion
Trois symboles alignés (ligne, colonne, diagonale) gagnent ; grille pleine = nulle.
La revanche fait commencer le perdant.

## Chess Arena
Règles FIDE via chess.js : roque, prise en passant, promotion au choix, échec et mat,
pat, matériel insuffisant, triple répétition (rejouée depuis l'historique complet),
règle des 50 coups. Pendule tenue par le serveur avec incrément. Propositions de nulle
(3 maximum par joueur) ; jouer un coup décline la proposition adverse. Historique en
notation française (R, D, T, F, C).

## Reversi
8×8, les Violets commencent. Poser un pion doit encadrer au moins un pion
adverse en ligne droite (8 directions) ; tous les pions encadrés sont retournés. Sans
coup légal, le joueur passe automatiquement ; si personne ne peut jouer, la partie se
termine au décompte des pions.

## Dames (anglaises)
8×8, cases foncées. Pions vers l'avant, dames dans les 4 directions, d'une case.
**Prise obligatoire**, rafle complète obligatoire, une pièce ne peut être prise deux
fois ; un pion qui atteint la dernière rangée devient dame et son coup s'arrête.
Un joueur sans coup légal perd. Nulle après 40 coups par joueur sans prise ni
mouvement de pion.

## Bataille navale
Grille 10×10, flotte : porte-avions 5, cuirassé 4, croiseur 3, sous-marin 3,
torpilleur 2 (pas de chevauchement, contact autorisé). Placement secret et simultané ;
une flotte non validée à temps est placée au hasard (graine de la partie). Tirs en
alternance ; un navire coulé est révélé ; la partie s'arrête quand une flotte est
entièrement coulée.

## Quiz Rush et Calcul Express
Tous les joueurs répondent en même temps à la même question (4 choix). Points pour une
bonne réponse : (100 + jusqu'à 100 selon la rapidité) × difficulté, +50 à partir de 3
bonnes réponses d'affilée. Quiz Rush puise dans une banque de 90 questions vérifiées
(9 catégories, difficulté progressive) ; Calcul Express génère additions, tables et
opérations mixtes de plus en plus difficiles. Classement final au score.

## Impostor
Chacun reçoit le même mot secret, sauf l'imposteur (mot proche, sans le savoir ; ou,
en variante, aucun mot et il le sait). Indices publics à tour de rôle (un indice ne
peut pas contenir son propre mot), discussion dans le chat, puis vote secret simultané.
Égalité ou innocent éliminé : l'imposteur gagne. Imposteur démasqué : il propose une
dernière fois le mot des civils ; juste, il gagne quand même.

## Memory
Retourne deux cartes par tour : une paire te fait marquer et rejouer, sinon les deux
cartes restent visibles jusqu'au coup suivant et le tour passe. Fin quand toutes les
paires sont trouvées.

## Party
Un hôte enchaîne plusieurs jeux dans le même salon : formats Classique, Rapide
(≤ 5 min), Entre amis (quiz, déduction, mémoire), Compétitif (stratégie) ou
Personnalisé (2 à 10 jeux dans l'ordre). Points par manche : 10 pour le premier,
jusqu'à 1 pour le dernier ; 7 pour une première place partagée. Une manche dont le jeu
ne convient plus au nombre de joueurs est passée ; une manche annulée est rejouée.
