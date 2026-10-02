-- PARTYVERSE — Battleship (engine: supabase/functions/_shared/engines/battleship.ts)
-- Fleets stay in match_server_state / match_private_state; the public state
-- only carries shots, results and sunk ships.
insert into public.game_catalog
  (id, name, tagline, description, category, min_players, max_players, avg_duration_minutes,
   modes, availability, network_model, rules, sort_order, released_at)
values
  ('battleship', 'Bataille navale', 'Place ta flotte, coule la sienne.',
   'Grille 10×10, cinq navires. Placement secret et simultané (placement aléatoire si le temps est écoulé), '
   'puis tirs en alternance. Les positions ne quittent jamais le serveur avant la fin de la partie.',
   'strategy', 2, 2, 12,
   '[{"id":"classic","name":"Classique","ranked":true}]',
   'available', 'turn_based_engine',
   '{"settings":{"placement_seconds":{"options":[60,90,120],"default":90},"turn_seconds":{"options":[20,30,45],"default":30}}}',
   18, now())
on conflict (id) do nothing;
