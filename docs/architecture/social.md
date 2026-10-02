# Social : messages privés, groupes, confidentialité

## Confidentialité (réglages du joueur)

| Réglage | Valeurs | Effet serveur |
| --- | --- | --- |
| Profil / statistiques | public · amis | `can_view_stats` ; succès d'un profil privé invisibles aux non-amis |
| Demandes d'ami | tous · amis d'amis · personne | `send_friend_request` |
| Invitations à jouer | amis · personne | `invite_to_lobby`, invitations de groupe et de salon de groupe |
| Messages privés | tous · **amis** · personne | `send_direct_message` |
| Présence | affichée ou non, statut invisible | `presence_for` (l'activité est dérivée des vraies parties) |

Le blocage (dans les deux sens) coupe tout : messages, invitations, recherche de salon
rapide, conversations listées. L'erreur renvoyée (`PV_USER_UNAVAILABLE`) ne révèle pas
le blocage.

## Messages privés

Tables `conversations` (une par paire, `user_a < user_b`), `conversation_members`
(`last_read_at`), `direct_messages` — lecture par RLS aux seuls participants, écriture
uniquement par `send_direct_message`.

Anti-abus : 1 à 1000 caractères, filtre de vulgarités, doublon refusé 30 s,
8 messages / 10 s et 300 / h, ouverture de nouvelles conversations limitée à 20 / h,
sanctions `mute`/`suspend` respectées. Signalement depuis la conversation : les
20 derniers messages du joueur signalé sont copiés côté serveur comme preuve.

Lu / non-lu : compteur par conversation, badge global (`count_unread_messages`),
« Vu » quand l'autre a lu. La notification (in-app et push) ne contient **jamais** le
texte du message et reste unique par conversation tant qu'elle n'est pas lue.

## Groupes

`groups`, `group_members` (fondateur · admin · membre), `group_invitations`,
`group_messages`, `group_activity`, `group_challenges`.

- Création limitée (5 / jour, 20 groupes par joueur, 50 membres par groupe).
- Groupes privés (sur invitation d'un admin, entre amis) ou publics (recherche, adhésion libre).
- Admins : inviter, retirer un membre ; fondateur : nommer/retirer des admins,
  transférer la fondation. Le fondateur qui part passe la main (admin le plus ancien,
  sinon membre) ; un groupe vide est supprimé.
- Classement interne de la semaine (victoires puis niveau), activité (arrivées,
  départs, parties entre membres, défis réussis).
- **Défi collectif hebdomadaire** (jouer ensemble, cumuler des victoires ou varier les
  jeux) : recalculé à partir des vraies parties de la semaine, récompense de 50 XP par
  membre versée une seule fois (`award_xp` à référence déterministe).
- « Créer un salon » : salon privé pour le jeu choisi + invitation de tous les membres
  qui acceptent les invitations.

## Liens profonds

`partyverse://join/<CODE>`, `/lobby/<id>`, `/messages/<id>`, `/groups/<id>`,
`/player/<id>`, `/quests`… Un lien ouvert déconnecté (démarrage à froid compris) est
mémorisé (`src/lib/pendingLink.ts`, liste blanche de routes) et rejoué après connexion
ou onboarding. Un démarrage à froid déjà connecté ouvre le lien directement.
