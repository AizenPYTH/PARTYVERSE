-- PARTYVERSE — Tic-Tac-Toe (engine: supabase/functions/_shared/engines/tic-tac-toe.ts)
insert into public.game_catalog
  (id, name, tagline, description, category, min_players, max_players, avg_duration_minutes,
   modes, availability, network_model, rules, sort_order, released_at)
values
  ('tic_tac_toe', 'Morpion', 'Trois en ligne, en quelques secondes.',
   'Le duel le plus rapide : aligne trois symboles avant ton adversaire. Parties éclair, revanche immédiate, '
   'coups validés par le serveur.',
   'strategy', 2, 2, 2,
   '[{"id":"classic","name":"Classique","ranked":true}]',
   'available', 'turn_based_engine',
   '{"settings":{"turn_seconds":{"options":[10,20,30],"default":20}}}',
   12, now());
