# Design system

Source : maquette haute fidélité « PARTYVERSE · fondations et écrans clés v1 »
([copie du handoff](handoff-v1.md)). Les jetons sont implémentés dans
`src/design-system` et sont la seule source de vérité du code.

| Élément | Implémentation |
| --- | --- |
| Couleurs Midnight / surfaces / accents / texte | `tokens.ts` (`colors`) |
| Teintes de jeux `oklch(L C h)` | `color.ts` : conversion OKLCH → sRGB testée, `tint(h)` (accent, carte, fond profond, emblème, bannière) |
| Typographie Unbounded / Manrope / JetBrains Mono | `typography.ts` (variantes `display`, `tabTitle`, `hero`, `section`, `body`, `overline`, chiffres tabulaires…) |
| Espacements, rayons, tailles tactiles, durées | `tokens.ts` |
| Icônes (grille 24, trait 1.8) | `components/Icon.tsx` — tracés de la planche 1d + icônes complémentaires dans le même style |
| Logo « Constellation » | `components/Logo.tsx` ; icônes d'app générées depuis la même géométrie (`assets/`) |
| Boutons L/M/S, primaire, secondaire, destructif, succès, récompense | `Button.tsx` (pression : scale 0.97 en 110 ms, état chargement à trois points) |
| Avatars (anneau XP, anneau profil, prêt, présence, pastilles) | `Avatar.tsx`, `PresenceDot.tsx`, `Badge.tsx` |
| Champs (focus violet, erreur corail, « Disponible » menthe) | `TextField.tsx` |
| Chips, contrôle segmenté, barre de progression, skeleton | composants dédiés |
| Toast d'invitation (6 s), bottom sheet de résultat | `Toast.tsx`, `Sheet.tsx` |
| Emblèmes de jeux provisoires | `src/features/games/components/GameEmblem.tsx` |

Accessibilité : libellés sur tous les éléments interactifs, l'information ne
repose jamais sur la couleur seule (jetons pleins / cerclés, libellés de rareté et
de statut), mouvements coupés avec « Réduire les animations », zones tactiles ≥ 44 px.

## Écarts assumés avec la maquette

| Maquette | Implémentation | Raison |
| --- | --- | --- |
| Carte héros « Lance une Party » | « Lance un salon » (Connect Four) | Le mode Party n'existe pas encore : pas de bouton sans logique. |
| Trophées 31/120 | « Collection » (cosmétiques débloqués / verrouillés) | Les succès ne sont pas implémentés ; la collection est réelle et attribuée par le serveur. |
| Compteurs « ● 3,4k en jeu » sur les tuiles | absents | Aucune donnée réelle d'audience pour l'instant. |
| Carte vedette Mindlink « NOUVEAU » | jeu jouable mis en avant (Connect Four) | Mindlink n'est pas jouable. |
| Recherche « Jeux, amis, salons… » | « Rechercher un jeu… » | La recherche globale arrive avec la découverte (phase H). |
| Slot « Invité… » dans le salon | non affiché | La liste des invitations sortantes d'un salon n'est pas encore exposée. |
| Compte à rebours 3-2-1 au démarrage | non implémenté | Prévu (voir roadmap). |
