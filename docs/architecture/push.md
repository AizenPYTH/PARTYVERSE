# Notifications push

```
notification in-app (public.notifications)
   └─ trigger → app_private.push_outbox (1 ligne par appareil actif, sauf opt-out du type)
                   └─ Edge Function push-dispatch (planifiée chaque minute)
                         ├─ push_claim_batch  (service role, SKIP LOCKED, 3 essais max)
                         ├─ Expo Push API      (lots de 100)
                         └─ push_complete_batch (envoyé / erreur ; jeton désactivé si DeviceNotRegistered)
```

- **Permission** : jamais demandée au démarrage. Réglages › Notifications push ›
  « Activer » demande la permission puis enregistre le jeton Expo
  (`register_push_token`). Si la permission était déjà accordée, le jeton est
  rafraîchi silencieusement à chaque session.
- **Appareils** : 10 appareils actifs max par compte ; un jeton suit le compte connecté
  sur l'appareil ; la déconnexion le désactive (`unregister_push_token`). Les jetons
  ne sont lisibles par aucun client.
- **Préférences** : `user_settings.notification_prefs` (in-app, par type) et
  `push_prefs` (push, par type). Rappel du soir opt-in (`streak_reminders`) quand une
  série de jours joués va s'interrompre, au plus une fois par jour.
- **Contenu** : titres et textes rédigés en SQL (`push_content`), jamais de corps de
  message privé ; `data.url` = route interne (liste blanche côté client).
- **Ouverture** : un appui ouvre la route, y compris depuis l'app fermée
  (`getLastNotificationResponseAsync`), ou après connexion si nécessaire.

Prérequis de production : un `projectId` EAS (`extra.eas.projectId` ou
`EXPO_PUBLIC_EAS_PROJECT_ID`), les identifiants APNs/FCM configurés dans EAS, et un
**development build** (les push distantes ne fonctionnent pas dans Expo Go sur Android).
Sans `projectId`, l'app l'indique dans les réglages au lieu de simuler.

Tests : `tests/db/push.test.ts` (file, préférences, droits, jetons morts),
`supabase/functions/push-dispatch/handler.test.ts` (envoi, tickets, erreurs), et l'E2E
exécute la vraie fonction contre une imitation locale de l'API Expo. Aucune réception
sur un téléphone réel n'a été testée dans ce dépôt.
