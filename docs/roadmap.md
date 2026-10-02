# Feuille de route

| Phase | État | Détail |
| --- | --- | --- |
| A — Audit et fondations | ✅ | Expo 57, TS strict, design system, navigation, Supabase, migrations, docs |
| B — Jeux | ✅ 10 jeux | Connect Four, Morpion, Chess Arena, Reversi, Dames, Bataille navale, Quiz Rush, Calcul Express, Impostor, Memory — moteurs serveur, tests, rendus |
| C — Social | ✅ | profils, amis, présence, blocage/signalement, messages privés, groupes (rôles, chat, classement, activité, défis), liens profonds rejoués |
| D — Progression | ✅ | XP/niveaux, cosmétiques, Elo par jeu et mode, succès, quêtes quotidiennes/hebdomadaires, série de jours, classements XP |
| E — Party | ✅ | formats, manches enchaînées, classement général, reprise d'une manche annulée |
| F — Push | ✅ (non testé sur appareil) | jetons Expo, file serveur, préférences, rappels, ouverture au bon écran |
| G — Temps réel | ⬜ | serveur dédié (Colyseus) : Draw & Guess, Pocket Pool, Mini Golf, Micro Racers, Bomb Squad, Mindlink |
| H — Tournois et administration | ⬜ | tournois, événements, interface de modération et de catalogue |
| I — Stabilisation | ⬜ | tests sur appareils, charge, audit sécurité externe, accessibilité, distribution |

## Limites connues

- **Aucun test sur téléphone réel** n'a été effectué : iOS/Android sont vérifiés par la
  compilation des bundles Hermes ; l'E2E tourne sur la cible web avec trois comptes.
  Les push ont été vérifiées jusqu'à l'API Expo (imitation locale), pas jusqu'à un appareil.
- Push : nécessitent un development build et un projet EAS (APNs/FCM). Les reçus Expo
  (« receipts ») ne sont pas encore relevés : un jeton mort est détecté au ticket.
- Six jeux restent « Bientôt disponible » (moteurs temps réel non écrits) ; ils ne sont
  jamais proposés comme jouables.
- Party Challenge du cahier des charges : couvert par le mode Party (enchaînement de jeux
  avec classement) ; pas de mini-défis dédiés.
- Matchmaking classé : duels uniquement ; pas de confirmation de présence avant le début.
- Quiz : banque de 90 questions (à enrichir et à faire relire) ; Impostor : 50 paires de mots.
- Succès et quêtes recalculés depuis l'historique à chaque lecture : à indexer ou
  matérialiser au-delà de quelques milliers de parties par joueur.
- Pas de traduction (français uniquement), pas d'interface d'administration (SQL).
- Le chat des groupes et des messages privés n'a ni réactions ni pièces jointes.

## Prochaines étapes recommandées

1. Projet Supabase réel + development build, parcours sur deux téléphones
   ([setup.md](setup.md#6-tester-sur-un-vrai-téléphone)).
2. Relevé des reçus Expo dans `push-dispatch` et métriques d'envoi.
3. Serveur temps réel pour les jeux d'adresse et de dessin.
4. Interface d'administration (signalements, sanctions, catalogue, banque de questions).
