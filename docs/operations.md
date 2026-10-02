# Exploitation

## Maintenance planifiée

`select app_private.run_maintenance();` — idempotente, à exécuter chaque minute.
Planifiée automatiquement par pg_cron (`partyverse-maintenance`). Elle renvoie un
résumé JSON : invitations et tickets expirés, temps de tour tranchés, membres
déconnectés retirés, salons expirés. Sans pg_cron : planificateur externe appelant
la fonction avec le service role.

## Modération

Les signalements arrivent dans `public.reports` (statut `open`) avec un instantané
des preuves. Les sanctions sont des lignes de `app_private.moderation_actions` :

```sql
-- Réduire au silence 24 h
insert into app_private.moderation_actions (user_id, action, reason, report_id, expires_at, created_by)
values ('<user>', 'mute', 'Insultes dans le chat', '<report>', now() + interval '24 hours', '<moderator>');

-- Suspendre (bloque toutes les RPC) ; lever une sanction
insert into app_private.moderation_actions (user_id, action, reason) values ('<user>', 'suspend', '…');
update app_private.moderation_actions set revoked_at = now() where id = '<action>';

-- Clore le signalement
update public.reports set status = 'actioned', resolution_note = '…', resolved_by = '<moderator>', resolved_at = now()
 where id = '<report>';
```

Termes interdits (pseudos, chat) : `app_private.blocked_terms` (catégories `reserved`, `profanity`).

Ces opérations se font aujourd'hui en SQL avec le service role. Un espace
d'administration dédié et séparé de l'app publique est prévu (roadmap, phase H/I).

## Catalogue

Activer ou désactiver un jeu : `update public.game_catalog set availability = 'disabled' where id = '…';`
(`disabled` le masque, `coming_soon` l'affiche sans permettre de créer un salon).

## Indicateurs (à brancher)

Les événements analytiques prévus (comptes créés, parties commencées/terminées,
invitations envoyées/acceptées, abandons, erreurs réseau) sont dérivables des tables
existantes sans collecter de messages privés. Aucun SDK d'analytics n'est intégré.
