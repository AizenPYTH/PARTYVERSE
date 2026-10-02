# Feuille de route

| Phase | État | Détail |
| --- | --- | --- |
| A — Audit et fondations | ✅ | Expo 57, TS strict, design system, navigation, Supabase, migrations, docs |
| B — Comptes et social | ✅ (sauf push) | Auth complète, onboarding, profils, amis, présence, notifications in-app |
| C — Salons et communication | ✅ (partiel) | Salons, invitations, chat de salon, gestion des membres, reconnexion. **Manque** : messagerie privée, groupes permanents |
| D — Premiers jeux | 🟡 1/4 | Connect Four ✅ (amical + classé). Échecs, Quiz Rush, Impostor à faire |
| E — Progression | 🟡 | XP, niveaux, cosmétiques, classements ✅. **Manque** : succès/trophées, quêtes |
| F — Party | ⬜ | Orchestrateur de manches |
| G — Temps réel | ⬜ | Serveur Colyseus, Draw & Guess, billard, mini-golf, course |
| H — Tournois et communauté | ⬜ | Tournois, groupes, événements, espace d'administration |
| I — Stabilisation | ⬜ | Tests de charge, audit sécurité externe, accessibilité, distribution |

## Prochaine étape recommandée

1. **Brancher un vrai projet Supabase** (docs/setup.md) et valider sur iOS/Android
   physiques (haptique, liens profonds, SecureStore) avec un development build.
2. **Chess Arena** : Edge Function avec chess.js, pendule autoritaire par joueur,
   Blitz/Bullet/Chess960, Elo dédié — en réutilisant `matches`, `finalize_match`,
   le matchmaking et l'écran de salon.
3. **Notifications push** : table `push_tokens` (appareils multiples, jetons expirés),
   Edge Function d'envoi respectant `notification_prefs`, demande de permission au
   premier besoin réel (invitation reçue).
4. **Messagerie privée** (conversations, pagination, lecture, réactions) et
   **groupes permanents** (rôles propriétaire/admin/membre).

## Limites connues

- Notifications push non implémentées (in-app uniquement).
- Lien profond ouvert en étant déconnecté : après connexion, l'utilisateur arrive à
  l'accueil (le lien n'est pas encore rejoué).
- Matchmaking sans confirmation de présence avant le début (le chrono de tour gère l'absence).
- Pas de compte à rebours 3-2-1 au démarrage d'une partie.
- Modération et catalogue administrés en SQL (pas encore d'interface d'administration).
- Les captures et l'E2E tournent sur la cible web ; iOS/Android sont vérifiés par
  compilation des bundles (Hermes) mais pas encore sur appareil.
