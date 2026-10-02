# Présence

## Modèle

- L'app envoie `presence_heartbeat()` à l'ouverture puis toutes les 30 s **au premier plan**.
- Un joueur est en ligne si son dernier heartbeat date de moins de **75 s** et qu'il
  ne s'est pas déconnecté (`presence_sign_out`). Une session expirée, une app tuée ou
  un réseau coupé ne laissent donc jamais un faux « en ligne ».
- Le statut choisi (`online`, `away`, `dnd`, `invisible`) est stocké ; **l'activité**
  (`in_game`, `in_lobby`) est déduite des vraies appartenances (partie active, salon
  ouvert), jamais déclarée par le client.

## Confidentialité

- La table `presence` n'est lisible par personne : elle n'est exposée qu'à travers
  `list_friends` et `get_player_profile`.
- `invisible` ou « Afficher ma présence » désactivé → vu hors ligne.
- Le salon d'un ami n'est révélé (bouton Rejoindre / Regarder) que s'il a activé
  « Mes amis peuvent rejoindre mes salons ».

## Évolution

Le heartbeat est simple, exact et peu coûteux (une ligne par joueur). À grande
échelle, il pourra être remplacé par Supabase Realtime Presence (canaux par
groupe d'amis) sans changer le contrat de `list_friends`.
