# Déploiement

## Backend (Supabase)

1. Sauvegarde / PITR activé sur le projet de production.
2. `npx supabase db push` (migrations dans l'ordre ; jamais de modification d'une
   migration déjà publiée).
3. `npx supabase functions deploy game-action push-dispatch delete-account`.
4. Secrets : `PUSH_DISPATCH_SECRET` (et Vault, voir [setup.md](setup.md)),
   `EXPO_ACCESS_TOKEN` facultatif.
5. Vérifier les tâches pg_cron : `select jobname, schedule from cron.job;` doit lister
   `partyverse-maintenance` et `partyverse-push-dispatch`.
6. Vérifier la publication Realtime (Dashboard › Database › Publications).
7. Auth : SMTP de production, URLs de redirection, limites de débit.

## Application (EAS)

```bash
eas build --profile production --platform all
eas submit --platform ios      # App Store Connect
eas submit --platform android  # Google Play
```

Variables `EXPO_PUBLIC_*` déclarées dans l'environnement EAS (`production`). La clé
`anon` est publique par conception ; aucune clé service n'est jamais incluse.

## Contrôles avant mise en ligne

- `npm run check`, `npm run test:db`, `npm run test:e2e` verts.
- `npx expo export --platform android --platform ios` compile.
- Smoke test sur deux téléphones réels (parcours de [setup.md](setup.md#6-tester-sur-un-vrai-téléphone)).
- Politique de confidentialité et conditions d'utilisation publiées (chat, signalement,
  suppression de compte intégrée).
