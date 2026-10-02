-- PARTYVERSE — Reversi and Checkers (engines: supabase/functions/_shared/engines/{reversi,checkers}.ts)
insert into public.game_catalog
  (id, name, tagline, description, category, min_players, max_players, avg_duration_minutes,
   modes, availability, network_model, rules, sort_order, released_at)
values
  ('reversi', 'Reversi', 'Encadre, retourne, domine.',
   'Le classique 8×8 : pose un pion pour encadrer et retourner ceux de l’adversaire. Passe automatique quand '
   'aucun coup n’est possible, fin de partie au décompte des pions. Coups validés par le serveur.',
   'strategy', 2, 2, 8,
   '[{"id":"classic","name":"Classique","ranked":true}]',
   'available', 'turn_based_engine',
   '{"settings":{"turn_seconds":{"options":[20,30,60],"default":30}}}',
   16, now()),
  ('checkers', 'Dames', 'Prises obligatoires, rafles et dames.',
   'Dames anglaises sur 8×8 : prise obligatoire, rafles complètes, promotion en dame sur la dernière rangée. '
   'Nulle après 40 coups sans prise ni avancée de pion. Coups validés par le serveur.',
   'strategy', 2, 2, 10,
   '[{"id":"classic","name":"Classique","ranked":true}]',
   'available', 'turn_based_engine',
   '{"settings":{"turn_seconds":{"options":[30,45,90],"default":45}}}',
   17, now())
on conflict (id) do nothing;
