# Handoff : PARTYVERSE — fondations et écrans clés v1

## Overview
PARTYVERSE est une app mobile sociale de mini-jeux multijoueurs. Ce lot couvre l'identité (logo, palette, typo, icônes), les composants de base et six écrans : Accueil, Salon, Connect Four (jeu), Catalogue, Profil, Amis.

## About the Design Files
`Partyverse.dc.html` est une **référence de design en HTML** (prototype montrant l'apparence et le comportement attendus), pas du code de production. La tâche est de **recréer ces écrans dans l'environnement cible** (React Native / Expo, SwiftUI, Flutter…) avec ses patterns et librairies. Sans codebase existante, recommandation : **React Native + Expo** (TypeScript), Reanimated pour les animations.

Ouvrir le fichier dans un navigateur (avec `support.js` à côté). C'est un canevas : chaque bloc `1a…1k` est une planche ou un écran 390×844.

## Fidelity
**High-fidelity.** Couleurs, typo, rayons, espacements et copy sont finaux pour la v1. Exceptions : illustrations de jeux et avatars = emblèmes géométriques provisoires (voir Assets).

## Design Tokens

### Couleurs
| Token | Hex | Usage |
|---|---|---|
| midnight | `#0B0A14` | fond app, fond cases vides |
| canvas (hors app) | `#050409` | fond de la planche uniquement |
| surface | `#15131F` | cartes, champs, panneaux |
| elevated | `#1E1B2B` | sheets, boutons secondaires, toasts |
| border | `#2E2A40` | bordures 1 px, pistes de progression |
| border-strong | `#3D3854` | slots vides (pointillés), poignée sheet |
| violet (primary) | `#8B5CFF` | action principale, onglet actif, XP |
| violet-pressed | `#7443F0` | état pressé |
| violet-text | `#B79BFF` | liens / texte violet sur fond sombre |
| violet-soft | `rgba(139,92,255,.16)` | fond de titre, tour actif J1 |
| blue | `#3DB8FF` | accent secondaire, badge NOUVEAU, rareté Rare |
| mint | `#3EE6A8` | succès, en ligne, prêt, ligne gagnante |
| mint-soft | `rgba(62,230,168,.14)` | fond bouton « Prêt » |
| amber | `#FFB547` | récompenses, attention, hôte, J2 Connect Four, Légendaire |
| amber-soft | `rgba(255,181,71,.14)` | |
| coral | `#FF5C72` | erreur, destructif, badges de notification |
| coral-soft | `rgba(255,92,114,.12)` | fond bouton destructif |
| text-primary | `#F4F2FA` | 17.6:1 sur midnight |
| text-secondary | `#A29DB8` | 7.4:1 |
| text-tertiary | `#6E6987` | 3.6:1, seulement ≥ 16 px ou méta non essentielle |
| text-disabled | `#4A4560` | |

Texte sur accents : blanc sur violet ; `#0B0A14` sur blue / mint / amber / coral.

### Teintes de jeux
Formule : accent `oklch(0.70 0.15 h)`, fond de carte `oklch(0.42 0.12 h)`, fond profond `oklch(0.36 0.11 h)`, emblème clair `oklch(0.80 0.14 h)`.

| Jeu | h |
|---|---|
| Chess Arena | 295 |
| Connect Four | 245 |
| Draw & Guess | 25 |
| Impostor | 350 |
| Quiz Rush | 75 |
| Pocket Pool | 185 |
| Mini Golf Clash | 145 |
| Mindlink | 320 |
| Micro Racers | 50 |
| Bomb Squad | 10 |

Les couleurs d'avatar provisoires réutilisent `oklch(0.70 0.15 h)`, avec les initiales en `#0B0A14`.

### Typographie (Google Fonts)
- **Unbounded** 500/600/700 : identité, titres d'écran, chiffres héros
- **Manrope** 400–800 : tout le reste
- **JetBrains Mono** 500 : étiquettes techniques et sur-titres (MODE PARTY, CONNECT FOUR · MANCHE 4)
- Tous les chiffres : `font-variant-numeric: tabular-nums`

| Rôle | Police | Taille/LH | Graisse | Tracking |
|---|---|---|---|---|
| Display | Unbounded | 32/36 | 700 | -2% |
| Titre d'onglet (Jeux, Amis) | Unbounded | 28 | 700 | -1% |
| Titre de carte héros | Unbounded | 26/1.1 (Party), 22 (featured) | 700 | |
| Titre d'écran / salut | Unbounded | 18–22 | 600 | |
| Stat héros | Unbounded | 26 | 600 | |
| Chrono / score | Unbounded | 24–36 | 600 | |
| Titre de section | Manrope | 17/22 | 700 | |
| Corps | Manrope | 15/22 | 500 | |
| Item de liste | Manrope | 14–15 | 700 | |
| Légende | Manrope | 12/16 | 600 | |
| Méta petite | Manrope | 10–11 | 600–700 | |
| Bouton | Manrope | 15 (L), 13–14 (M/S) | 700 | |
| Sur-titre | JetBrains Mono | 11 | 600 | +12% (0.12em) |
| Wordmark | Unbounded | 30 | 700 | +8% |

### Espacements
Base 4. Valeurs utilisées : 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32.
- Marges latérales des écrans : 20
- Écart entre sections, Accueil et Profil : 22 ; Catalogue et Amis : 18
- Padding des cartes : 12–16 (listes), 20–22 (héros)

### Rayons
6 (puces de teinte) · 8 (badges) · 10–12 (petits boutons, segments) · 14 (champs, boutons M, tuiles 48 px) · 16 (boutons L) · 18 (cartes, tuiles de jeu) · 24 (cartes héros, plateau) · 44 (coins du téléphone) · cercles pour avatars et jetons.

### Ombres
Aucune ombre portée : la profondeur vient des paliers midnight → surface → elevated et des bordures 1 px. Les anneaux sont faits en `box-shadow` : `0 0 0 3px #0B0A14, 0 0 0 5px #3EE6A8` (prêt) et `0 0 0 3px #3EE6A8` (jeton gagnant).

### Tailles tactiles
Boutons : 52 (L), 44 (M), 36 (S, uniquement dans des cartes denses). Boutons-icônes : 44×44 (40×40 en jeu). Barre de navigation : 86 de haut, dont environ 24 de safe area.

## Composants (planche 1e)
- **Bouton primaire** : h52, padding 0 24, r16, fond violet, texte blanc Manrope 700 15. Pressé : `#7443F0` + scale(0.97), 120 ms. Désactivé : fond elevated, texte `#4A4560`. Chargement : même largeur, trois points de 6 px blancs à 100 / 60 / 30 % d'opacité (à animer en séquence).
- **Secondaire** : h44, r14, fond elevated, bordure 1px border.
- **Destructif** : fond coral-soft, texte coral.
- **Succès / prêt** : fond mint-soft, texte mint, icône check au trait 2.4.
- **Récompense** : h36, r12, fond amber, texte midnight Manrope 800 13.
- **Bouton-icône** : 44×44, r14, fond elevated ou surface.
- **Avatar** : 48 (liste), 58 (rangée en ligne), 64 (salon), 116 (profil, avec un anneau de 4 px en conic-gradient violet→bleu et un liseré midnight de 4 px).
- **Présence** : pastille de 14–16 px avec bordure 3px midnight. Mint = en ligne ; violet = en jeu ; amber = en salon ; midnight avec bordure `#4A4560` = hors ligne. Pulse mint uniquement sur la mise en avant « disponible », ou amber sur une invitation en attente.
- **Badge sur avatar** : pilule h18–20, Manrope 800 9, texte en capitales (EN JEU, SALON, HÔTE), ou carré de 22 px contenant le glyphe du jeu.
- **Badge de compteur** : min-width 16–22, fond coral, texte midnight 800.
- **Étiquette** : h24, r8, fond accent à 14 %, texte accent 700 11 en capitales (ÉPIQUE, NOUVEAU).
- **Chip de filtre** : h34, r17. Active : fond `#F4F2FA`, texte midnight. Inactive : bordure 1px border, texte secondary.
- **Contrôle segmenté** : piste surface avec padding 4, r14 ; segment actif elevated, r10, h36.
- **Champ de saisie** : h52, r14, fond surface. Focus : bordure 1.5px violet. Erreur : bordure 1.5px coral, avec un message coral 600 11 sous le champ. Valide : message mint « Disponible ». Label au-dessus en 600 12 secondary.
- **Barre de progression** : piste h6–8, r3–4, fond border (ou elevated) ; remplissage violet.
- **Skeleton** : blocs elevated sur surface, r6 (à animer en shimmer léger, désactivé en mouvement réduit).
- **Toast / invitation** : fond elevated, bordure border, r16, padding 12×14, avatar 36, bouton Rejoindre de taille S. Disparaît automatiquement après 6 s.
- **Bottom sheet de résultat** : fond elevated, rayons 28 en haut, bordure supérieure border, poignée 36×4 border-strong.

## Iconographie
Grille de 24, trait de 1.8, `stroke-linejoin/linecap: round`, sans remplissage. État actif de la navigation : icône remplie et tracée en violet, label en text-primary ; inactif : `#6E6987`. Les tracés SVG de Accueil, Jeux, Amis, Activité, Profil, Notifications, Recherche, Messages et Tournoi sont dans 1d (à copier). Les 9 icônes restantes du brief (Paramètres, Invitation, Classement, Récompenses, Statistiques, Audio, Réactions, Salons, Déconnexion) sont à dessiner selon la même règle (ou prises dans Lucide / Phosphor « regular », dont le style est proche).

## Logo (1b)
« Constellation » : trois cercles de rayon 8 aux sommets d'un triangle (32,12 / 12,46 / 52,46 dans un viewBox 64), reliés par des traits de 3, plus un cercle de rayon 4 en (32,35). En couleur : violet, bleu, blanc, avec le centre blanc. Monochrome : tout en midnight. Icône iOS : carré violet r ≈ 25 %, symbole blanc dont un sommet en midnight. Le point central est retiré en dessous de 48 px.

## Screens

Cadre : 390×844, barre d'état de 54, contenu avec padding `6 20 0`, barre de navigation absolue en bas (86, fond `rgba(11,10,20,.96)`, bordure supérieure 1px elevated, 5 items de 64 de large, label Manrope 700 10). Le contenu défile sous la navigation : la liste ne doit jamais compresser ses enfants.

### 1f — Accueil
De haut en bas :
1. **En-tête** : avatar 48 entouré d'un anneau de progression XP (conic violet à 77 % sur border) ; « Bonsoir, Nova » en Unbounded 600 18 ; « Niv. 24 · 1 840 / 2 400 XP » en 600 12 secondary ; à droite, une cloche 44 avec badge coral « 3 ».
2. **En ligne · 5** (le « 5 » en mint) avec le lien « Tous » ; carrousel horizontal d'avatars 58, écart 16. Sous chaque avatar : le nom en 700 12, puis le statut en 600 10 (nom du jeu en secondary, « Dispo » en mint). Le dernier item, « Inviter », est un cercle en pointillés.
3. **Carte d'invitation** : fond surface, bordure, r18 ; tuile du jeu 48 ; « Léo t'invite » / « Connect Four · 0:48 » (compte à rebours) ; bouton Rejoindre de taille M.
4. **Carte Party** (héros, l'action principale de l'écran) : fond violet, r24, padding 22. Sur-titre mono « MODE PARTY », titre « Lance une Party » en Unbounded 700 26, méta « 5 manches · 4–8 joueurs · ~20 min », bouton lecture rond blanc de 44 à droite. Décor : deux anneaux et un point blanc dans le coin supérieur droit. Pressé : scale(0.98).
5. **Reprendre** : tuile Chess 52 ; « Chess Arena · contre Maya » ; « À toi de jouer · coup 23 » en amber ; lien « Reprendre » en violet-text.
6. **Populaires ce soir** : carrousel de cartes de 150 de large (tuile 120 de haut, r18), nom en 700 14, méta en 600 11 (joueurs · durée · nombre en jeu en mint).

États à prévoir (non dessinés dans la v1) : nouvel utilisateur (aucun niveau ni ami → carte « Ajoute tes premiers amis » et Party mise en avant), aucun ami en ligne (rangée remplacée par une invitation par lien), aucune invitation (la carte disparaît), événement en cours (bannière au-dessus de la carte Party).

### 1g — Salon (Impostor, privé)
- Barre : bouton retour 44 ; titre centré « Les Insomniaques » en Unbounded 600 16, sous-titre « Impostor · salon privé · code K7Q2 » ; bouton réglages 44.
- Bannière du jeu : h150, r24, `oklch(0.30 0.09 350)`, emblème Impostor (4 cercles dont un évidé), compteur « N / 5 prêts · en attente de … ».
- Grille de 4 colonnes de slots (8 places) : avatar 64. Prêt = anneau mint + « ✓ Prêt(e) » en mint. Pas prêt = avatar à 55 % d'opacité + « Pas prêt » en secondary. Hôte = pilule amber « HÔTE » au-dessus de l'avatar. Invité en attente = cercle en pointillés avec un point amber qui pulse, libellé « Invité… ». « + Inviter » en pointillés. « Libre » en pointillés plus sombres.
- Réglages (liste surface r18, séparateurs elevated) : Imposteurs 1 · Temps de discussion 90 s · Thème des mots Cinéma.
- Aperçu du chat : une ligne (mini-avatar, nom en gras, message), avec le lien « Chat » qui ouvre une sheet.
- CTA collé en bas (bottom 34) : h56, r18. « Je suis prêt » en violet ; une fois prêt, « ✓ Prêt — annuler » sur fond mint-soft, texte mint. Pour l'hôte, quand tous sont prêts, le CTA devient « Démarrer ».

États à prévoir : salon vide, seul, complet, tous prêts, erreur de connexion (toast coral + slot grisé), partie démarrée (compte à rebours 3-2-1).

### 1h — Connect Four (interactif)
- Barre de jeu compacte, sans navigation inférieure : menu 40 · « CONNECT FOUR · MANCHE {n} » en mono · chat 40.
- Joueurs : grille `1fr auto 1fr`. Toi (avatar violet, « Jetons pleins ») · score « 2 : 1 » en Unbounded 24 · Léo (avatar amber, « Jetons cerclés »). Le côté du joueur actif reçoit un fond teinté (violet ou amber à environ 15 %), en transition de 200 ms.
- Ligne de statut : 700 15. « À toi de jouer » (violet-text) / « Tour de Léo » (amber) / « Victoire ! » (mint) / « Léo gagne la manche » (coral) / « Match nul ».
- Plateau : padding 12, r24, `oklch(0.36 0.11 245)`, 7 colonnes de 6 cases, écart 4, cases rondes en aspect-ratio 1. Vide `#0B0A14`, J1 `#8B5CFF` plein, J2 `#FFB547` avec un point midnight central de 40 %. **L'information ne repose pas uniquement sur la couleur.** Les 4 cases gagnantes reçoivent un anneau mint de 3 px. Toute la colonne est la zone de toucher (survol web : fond blanc à 8 %).
- Pied : « Aligne 4 jetons » · « Coup N » en mono.
- Fin de manche : la bottom sheet résultat monte. Titre Unbounded 24 dans la couleur du statut (« Victoire » / « Défaite » / « Match nul ») ; récompense (« +40 XP · série de 2 victoires », « +10 XP · la revanche est à un tap », « +20 XP ») ; boutons Quitter (secondaire, flex 1) et Revanche (primaire, flex 2).

### 1i — Catalogue (Jeux)
- Titre « Jeux » en Unbounded 28 ; recherche h48 r14 surface, placeholder « Jeux, amis, salons… ».
- Chips défilables : Tous (active) · Entre amis · Rapides · Compétitif · Réflexion.
- Carte vedette h168 r24 : badge NOUVEAU (bleu), « Mindlink » en Unbounded 22, « Pensez au même mot que votre duo · 2–8 · 8 min ». Emblème : deux cercles qui se chevauchent.
- « Tous les jeux » + lien « Filtres » ; grille de 2 colonnes, écart 16 vertical / 12 horizontal. Tuile 112 r18, nom 700 14, méta « Catégorie · joueurs · durée » en 600 11. Badge de joueurs en ligne en haut à gauche (« ● 3,4k » en mint sur midnight à 85 %).
- Jeu indisponible : tuile à 50 % d'opacité, nom en secondary, méta en amber « Maintenance · retour 22 h ».

### 1j — Profil
- Bouton réglages en haut à droite ; avatar 116 avec anneau conic ; « Nova » en Unbounded 700 24 ; titre en pilule violet-soft « Stratège nocturne » ; barre de niveau h8 (« Niveau 24 » / « 560 XP avant le 25 »).
- Grille de stats 2×2 (surface r18, padding 16) : 412 Parties · 58 % Victoires · 238 (mint) · 96 h Temps de jeu · #38 Chess · entre amis (amber).
- Trophées 31/120 : losanges de 64 (carré r14 tourné à 45°) avec le libellé de rareté en dessous. Légendaire = amber, Épique = violet, Rare = bleu, Verrouillé = pointillés « ? ». Le libellé texte accompagne toujours la couleur.
- CTA : Inventaire (secondaire) · Personnaliser (primaire).

### 1k — Amis
- Titre + « + Ajouter » ; segmenté En ligne · 5 / Tous · 48 / Demandes (badge 2).
- Lignes : avatar 48 + pastille, nom 700 15 + « Niv. N » en tertiary 12, statut 600 12 coloré. Action contextuelle : Inviter (primaire S, si disponible), Regarder (secondaire, si en partie), Rejoindre (secondaire, si en salon).
- Carte de demande : avatar, nom, contexte (« Rencontrée dans Quiz Rush · 3 amis en commun »), boutons Ignorer et Accepter côte à côte en h44.

## Interactions & Behavior
- Pression : scale(0.97) + couleur pressée, 100–120 ms, ease-out. Grandes cartes : scale(0.98).
- Changement d'onglet : remplissage de l'icône + couleur, 150 ms ; pas de transition de page latérale.
- Connect Four : à prévoir en natif, une chute du jeton (translateY depuis le haut de la colonne, environ 250 ms, easing de type gravité + petit rebond de 6 %). Haptique légère au dépôt, moyenne à la victoire. La sheet de résultat monte en environ 280 ms.
- Pulse de présence : box-shadow mint de 0 à 5 px, 2.4 s en boucle ; pour une invitation en attente, 1.6 s.
- Mouvement réduit (`prefers-reduced-motion` / Reduce Motion) : couper les pulses, les shimmers et la chute ; garder les changements d'état instantanés.
- Compte à rebours d'invitation : expire → la carte se replie et un toast « Invitation expirée » apparaît.

## State Management
- `session` : user (pseudo, niveau, xp, xpNext, titre).
- `presence[]` : status en `online | in_game | in_lobby | offline`, plus gameId.
- `invites[]` : from, gameId, lobbyId, expiresAt.
- `lobby` : id, name, code, gameId, hostId, maxPlayers, settings, players[] (userId, ready, invited) ; action `toggleReady()`.
- Connect Four : `board: number[42]` (0 vide, 1 et 2 joueurs), `turn`, `winner` (0 en cours, 1 ou 2 vainqueur, 3 nul), `winCells[]`, `moves`, `score[2]`, `round`. `drop(col)` prend la case vide la plus basse, puis vérifie 4 alignés dans les directions (0,1), (1,0), (1,1) et (1,-1). Nul à 42 coups. Après une revanche, c'est le perdant qui commence. La logique de référence est dans la classe `Component` du fichier HTML. En ligne, le serveur doit être l'autorité qui valide les coups.

## Assets
- Aucune image raster. Les tuiles de jeu sont des emblèmes CSS provisoires : damier + ♞ (Chess), grille de points (C4), cercle en pointillés (Draw), 4 cercles dont un évidé (Impostor), A/B/C/D (Quiz), 3 billes (Pool), balle + drapeau (Golf), deux cercles qui se chevauchent (Mindlink), rayures diagonales (Racers), chrono 0:42 (Bomb). **À remplacer par des illustrations finales** qui conservent la teinte du jeu. Formats : tuile carrée 1:1 à 336 px @3x ; vedette 350×168 @3x.
- Les avatars sont des initiales sur teinte, à remplacer par le système d'avatars personnalisables.
- Polices : Google Fonts (Unbounded, Manrope, JetBrains Mono), sous licence OFL.

## Hors périmètre de la v1 (à concevoir)
Splash/onboarding, authentification, fiche d'un jeu, 9 autres jeux, mode Party complet, messagerie, progression et saison, classements, tournois, activité, recherche, paramètres, version tablette.

## Files
- `Partyverse.dc.html` : toutes les planches et tous les écrans (ouvrir dans un navigateur ; `support.js` est le runtime de prévisualisation et n'est pas à porter).
