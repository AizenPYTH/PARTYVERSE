# Salons

## Cycle de vie

```
(création côté client) → waiting ⇄ ready → in_progress → waiting (revanche) …
                                   └──────────────→ finished | cancelled | expired
```

| État | Signification |
| --- | --- |
| `waiting` | en attente de joueurs ou de « prêt » |
| `ready` | tous les joueurs sont prêts et le minimum du jeu est atteint (calculé par le serveur) |
| `in_progress` | une partie est en cours (`current_match_id`) |
| `finished` | fermé après au moins une partie |
| `cancelled` | fermé sans partie |
| `expired` | abandonné, fermé par la maintenance |

« En création » est un état de formulaire côté client, jamais persisté.

## Règles

- Un joueur appartient à **un seul salon ouvert** : rejoindre ou créer quitte les
  autres ; impossible pendant une partie active (`PV_ALREADY_IN_MATCH`).
- Accès : salon public, code (connaître le code suffit), invitation en attente, ou
  ami d'un membre qui autorise « Rejoindre mes salons ».
- Jamais de joueurs qui se sont bloqués dans le même salon (message générique).
- Exclusion par l'hôte : définitive pour ce salon (`lobby_kicks`).
- Changer les réglages remet tout le monde « pas prêt ».
- Démarrage : hôte uniquement, salon `ready` ; démarrage automatique optionnel.
- **Changement d'hôte** : si l'hôte part, le joueur présent depuis le plus longtemps
  devient hôte (message système) ; s'il ne reste aucun joueur, le salon ferme.
- Départ pendant une partie : défaite par abandon, puis règles ci-dessus.
- Spectateurs : jusqu'à 20, autorisés par réglage ; ils voient la partie et le chat.
- Invitations : amis seulement (ou personne selon le réglage du destinataire),
  expirent après 15 min, ré-inviter rafraîchit l'invitation existante.

## Nettoyage automatique

`app_private.run_maintenance()` : invitations expirées, membres sans heartbeat
depuis 5 min retirés des salons en attente (avec transfert d'hôte), salons inactifs
depuis 2 h fermés (`expired`).

## Chat de salon

Texte (1–300 caractères, grossièretés masquées, doublons refusés 30 s, 6 messages /
10 s), messages rapides prédéfinis (`gg`, `gl`, `rematch`…), messages système
traduits côté client. Les joueurs bloqués sont masqués à la lecture. Les joueurs
réduits au silence (`mute`) ne peuvent pas écrire. Appui long = signaler (les 20
derniers messages de la personne sont joints au signalement côté serveur).
