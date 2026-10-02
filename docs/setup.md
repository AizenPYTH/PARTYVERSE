# Mise en place

## 1. Projet Supabase

1. Créer un projet sur supabase.com (région proche des joueurs).
2. Lier le dépôt : `npx supabase login` puis `npx supabase link --project-ref <ref>`.
3. Appliquer le schéma : `npx supabase db push` (toutes les migrations de
   `supabase/migrations`, voir [migrations.md](migrations.md)).
   - `pg_cron` est activé et planifie `app_private.run_maintenance()` chaque minute
     (invitations, tickets, salons expirés, temps de tour tranchés). Sans pg_cron,
     planifier l'appel ailleurs (voir [operations.md](operations.md)).

## 2. Authentification (Dashboard › Authentication)

- **Providers › Email** : activé, « Confirm email » activé.
- **URL Configuration** : Site URL `partyverse://` ; Redirect URLs `partyverse://**`,
  `exp://**` (Expo Go) et l'URL web si utilisée (ex. `http://localhost:8081/**`).
- **SMTP** : configurer un fournisseur d'e-mail pour la production (l'expéditeur par
  défaut de Supabase est fortement limité).
- Apple / Google : non activés dans l'app tant qu'ils ne sont pas configurés (aucun
  bouton factice n'est affiché).

## 3. Realtime (Dashboard › Database › Publications)

Les migrations ajoutent les tables à `supabase_realtime` : salons et membres, chat,
invitations, parties, états privés, notifications, demandes d'ami, tickets, Party,
messages privés, groupes. Sans Realtime l'app fonctionne en polling (plus lent).

## 4. Edge Functions

```bash
npx supabase functions deploy game-action        # moteurs de jeu (JWT vérifié)
npx supabase functions deploy push-dispatch      # envoi des push (verify_jwt = false, secret dédié)
npx supabase functions deploy delete-account     # suppression de compte
npx supabase secrets set PUSH_DISPATCH_SECRET="$(openssl rand -hex 32)"
npx supabase secrets set EXPO_ACCESS_TOKEN=<jeton Expo>   # facultatif (« enhanced push security »)
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont fournies
automatiquement aux fonctions. **Rien de tout cela ne va dans l'app.**

Planifier `push-dispatch` chaque minute (SQL Editor, une fois ; pg_net + Vault) :

```sql
select vault.create_secret('https://<ref>.supabase.co', 'partyverse_project_url');
select vault.create_secret('<la valeur de PUSH_DISPATCH_SECRET>', 'partyverse_push_secret');
select cron.schedule('partyverse-push-dispatch', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'partyverse_project_url') || '/functions/v1/push-dispatch',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'partyverse_push_secret'),
      'Content-Type', 'application/json'),
    body := '{}'::jsonb);
$$);
```

## 5. Application

```bash
cp .env.example .env    # URL + clé anon + projectId EAS
npm install
npx expo start
```

| Variable | Où | Rôle |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `.env` / EAS | URL du projet |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env` / EAS | clé publique (protégée par RLS) |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | `.env` / EAS (ou `extra.eas.projectId`) | jetons push Expo |
| `SUPABASE_SERVICE_ROLE_KEY` | secrets Supabase uniquement | Edge Functions, jamais dans l'app |
| `PUSH_DISPATCH_SECRET` | secrets Supabase + Vault | appel planifié de `push-dispatch` |
| `EXPO_ACCESS_TOKEN` | secrets Supabase (facultatif) | envoi push authentifié |

## 6. Tester sur un vrai téléphone

Expo Go suffit pour tout **sauf les notifications push** (Android : push distantes non
prises en charge dans Expo Go). Pour les push, un development build :

```bash
npm install -g eas-cli && eas login
eas init                          # crée le projet EAS et son projectId
eas credentials                   # APNs (iOS) / FCM (Android)
eas build --profile development --platform android   # ou ios
npx expo start --dev-client
```

Parcours conseillé avec deux téléphones (deux comptes) :
1. Inscription + confirmation e-mail par lien profond, onboarding.
2. Demande d'ami, acceptation, présence en ligne.
3. Salon privé, invitation, prêts, une partie de chaque jeu à 2 ; Impostor ou Memory à 3.
4. Couper le réseau d'un joueur en pleine partie, le rétablir (reprise, temps de tour).
5. Message privé app fermée → push → appui → la conversation s'ouvre.
6. Lien `partyverse://join/<CODE>` ouvert déconnecté → inscription → arrivée dans le salon.
7. Party de 3 manches, quêtes du jour, succès.

## 7. Développement local complet (optionnel)

Avec Docker : `npx supabase start` (Postgres, Auth, Realtime, fonctions selon
`supabase/config.toml`) puis `npx supabase db reset`. Sans Docker, `npm run test:e2e`
monte une pile minimale (sans Realtime) pour les tests.
