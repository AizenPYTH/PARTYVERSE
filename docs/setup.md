# Mise en place

## 1. Projet Supabase

1. Créer un projet sur supabase.com (région proche des joueurs).
2. Lier le dépôt : `npx supabase login` puis `npx supabase link --project-ref <ref>`.
3. Appliquer le schéma : `npx supabase db push` (migrations de `supabase/migrations`).
   - `pg_cron` est activé par la dernière migration et planifie
     `app_private.run_maintenance()` chaque minute. Si l'extension n'est pas disponible,
     planifier l'appel ailleurs (voir [operations.md](operations.md)).

## 2. Authentification (Dashboard › Authentication)

- **Providers › Email** : activé, « Confirm email » activé.
- **URL Configuration** :
  - Site URL : `partyverse://`
  - Redirect URLs : `partyverse://**`, `exp://**` (Expo Go), et l'URL web si utilisée
    (ex. `http://localhost:8081/**`).
- **SMTP** : configurer un fournisseur d'e-mail pour la production (l'expéditeur par
  défaut de Supabase est fortement limité).
- Apple / Google : non activés dans l'app tant qu'ils ne sont pas configurés (aucun
  bouton factice n'est affiché).

## 3. Realtime (Dashboard › Database › Publications)

La migration ajoute les tables à `supabase_realtime`. Vérifier que la publication
contient : `lobbies`, `lobby_members`, `lobby_messages`, `lobby_invitations`,
`matches`, `notifications`, `friend_requests`, `matchmaking_tickets`.
Sans Realtime, l'app fonctionne en polling (plus lent, plus coûteux).

## 4. Edge Function de suppression de compte

```bash
npx supabase functions deploy delete-account
```

Elle utilise `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY`,
fournies automatiquement par Supabase aux fonctions. Rien à mettre dans l'app.

## 5. Application

```bash
cp .env.example .env
# EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
# EXPO_PUBLIC_SUPABASE_ANON_KEY=<clé anon>
npm install
npx expo start
```

Variables d'environnement :

| Variable | Où | Rôle |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `.env` / EAS | URL du projet |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env` / EAS | clé publique (protégée par RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | secrets Supabase uniquement | Edge Function, jamais dans l'app |

Pour EAS Build : déclarer les deux variables `EXPO_PUBLIC_*` dans les variables
d'environnement du projet EAS.

## 6. Développement local complet (optionnel)

Avec Docker : `npx supabase start` démarre Postgres, Auth, Realtime et les fonctions
selon `supabase/config.toml`, puis `npx supabase db reset` applique les migrations.
Sans Docker, `npm run test:e2e` monte une pile minimale (sans Realtime) pour les tests.
